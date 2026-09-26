"""Bounded concurrent read load and replica-failure checks on a disposable stack.

Opt in explicitly. Only Java replicas are stopped, always through restoration
contexts. No payments or business writes are issued. This is a regression gate,
not a production capacity certification.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from datetime import datetime, timezone
import json
import math
import signal
import time
import uuid

from runtime_checks import (
    AuthenticatedProbe, SERVICES, VerificationError, docker, running_replicas,
    temporarily_stop, validate_project, wait_healthy, write_report,
)

PATHS = ("/api/auth/me", "/api/travels", "/api/payments")
SERVICE_PATHS = dict(zip(SERVICES, PATHS))


def summarize(samples, elapsed, grace, max_p95):
    """Reject empty/starved paths and late failures, including transport failures."""
    paths = {}
    for path in PATHS:
        rows = [s for s in samples if s['path'] == path]
        steady = [s for s in rows if s['started'] >= grace]
        durations = sorted(s['elapsed_ms'] for s in steady)
        p95 = durations[math.ceil(len(durations) * .95) - 1] if durations else None
        paths[path] = {
            'requests': len(rows), 'failures': sum(not s['ok'] for s in rows),
            'steady_requests': len(steady),
            'steady_failures': sum(not s['ok'] for s in steady), 'p95_ms': p95,
            'passed': len(steady) >= 5 and all(s['ok'] for s in steady)
                      and p95 is not None and p95 <= max_p95,
        }
    return {'requests': len(samples), 'elapsed_seconds': round(elapsed, 2),
            'requests_per_second': round(len(samples) / elapsed, 2),
            'paths': paths, 'passed': all(p['passed'] for p in paths.values())}


def load_phase(probes, duration, grace, max_p95):
    started = time.monotonic()
    def worker(probe):
        samples = []
        index = 0
        while time.monotonic() - started < duration:
            path = PATHS[index % len(PATHS)]
            request_id = 'tpload-' + uuid.uuid4().hex
            begin = time.monotonic()
            result = probe.read(path, request_id=request_id)
            samples.append({'path': path, 'request_id': request_id,
                            'ok': bool(result.get('ok')), 'started': begin - started,
                            'elapsed_ms': (time.monotonic() - begin) * 1000})
            index += 1
            time.sleep(.05)  # Bound the generator to at most 20 reads/sec per worker.
        return samples
    with ThreadPoolExecutor(max_workers=len(probes)) as pool:
        samples = [sample for batch in pool.map(worker, probes) for sample in batch]
    return summarize(samples, time.monotonic() - started, grace, max_p95), samples


def replica_distribution(replicas, samples, since):
    successful = {s['request_id']: s['path'] for s in samples if s['ok']}
    distribution = {}
    for service, containers in replicas.items():
        distribution[service] = {}
        for container in containers:
            matched = set()
            for line in docker('logs', '--since', since, container).splitlines():
                start = line.find('{')
                if start < 0:
                    continue
                try:
                    record = json.loads(line[start:])
                except json.JSONDecodeError:
                    continue
                request_id = record.get('requestId')
                message = record.get('message', '')
                if successful.get(request_id) == SERVICE_PATHS[service] and (
                    'path=' + SERVICE_PATHS[service] + ' ' in message and 'status=200 ' in message
                ):
                    matched.add(request_id)
            distribution[service][container] = len(matched)
    return distribution


def run(args):
    if not args.run_load:
        print('No changes made. Use --run-load on a disposable two-replica review stack.')
        return
    project = validate_project(args.project)
    report = {'passed': False, 'started_at': datetime.now(timezone.utc).isoformat(),
              'scope': 'Bounded concurrent reads and Java replica loss; not host/database HA',
              'workers': args.workers, 'duration_per_phase': args.duration,
              'recovery_grace_seconds': args.grace, 'max_p95_ms': args.max_p95_ms,
              'phases': []}
    write_report(args.report, report)
    try:
        replicas = {s: running_replicas(project, s) for s in SERVICES}
        for service, containers in replicas.items():
            if len(containers) < 2:
                raise VerificationError(service + ' requires at least two replicas')
            for container in containers:
                wait_healthy(container, timeout=10)
        with ExitStack() as stack:
            probes = [stack.enter_context(AuthenticatedProbe(project, args.credentials))
                      for _ in range(args.workers)]
            since = datetime.now(timezone.utc).isoformat()
            baseline, samples = load_phase(probes, args.duration, 0, args.max_p95_ms)
            baseline['name'] = 'healthy'
            baseline['replica_requests'] = replica_distribution(replicas, samples, since)
            baseline['balanced'] = all(count > 0 for counts in baseline['replica_requests'].values()
                                       for count in counts.values())
            report['phases'].append(baseline)
            write_report(args.report, report)
            if not baseline['passed'] or not baseline['balanced']:
                raise VerificationError('Healthy load or per-replica distribution failed')
            for service, containers in replicas.items():
                phase = {'name': service + '-replica-down', 'restored': False}
                report['phases'].append(phase)
                try:
                    with temporarily_stop(containers[0], restoration=phase):
                        result, _ = load_phase(probes, args.duration, args.grace, args.max_p95_ms)
                        phase.update(result)
                        if not phase['passed']:
                            raise VerificationError(service + ' failed concurrent survivor load')
                    # DNS/passive-health recovery may take a few seconds; bounded by the
                    # next phase's grace. The stopped replica's health is checked on exit.
                finally:
                    write_report(args.report, report)
            # Wait for the gateway's documented 10-second passive-health window.
            time.sleep(10)
            restored, _ = load_phase(probes, args.duration, 0, args.max_p95_ms)
            restored['name'] = 'restored'
            report['phases'].append(restored)
            if not restored['passed']:
                raise VerificationError('Restored stack failed concurrent reads')
        report['passed'] = True
        print('PASS concurrent load, per-replica distribution and restored Java failover')
    except BaseException as error:
        report['failure'] = type(error).__name__
        raise
    finally:
        report['finished_at'] = datetime.now(timezone.utc).isoformat()
        write_report(args.report, report)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-load', action='store_true')
    parser.add_argument('--project', default='travel-plan')
    parser.add_argument('--credentials')
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--duration', type=int, default=20)
    parser.add_argument('--grace', type=int, default=10)
    parser.add_argument('--max-p95-ms', type=int, default=3000)
    parser.add_argument('--report', default='work/verification/load.json')
    args = parser.parse_args()
    if not 2 <= args.workers <= 16 or not 15 <= args.duration <= 120:
        parser.error('Use 2–16 workers and 15–120 seconds per phase')
    if not 0 <= args.grace <= args.duration - 5 or args.max_p95_ms <= 0:
        parser.error('Leave at least five steady seconds and use a positive latency budget')
    def interrupted(signum, frame):
        raise KeyboardInterrupt('Restoring stopped Java replica')
    signal.signal(signal.SIGTERM, interrupted)
    try:
        run(args)
    except (VerificationError, KeyboardInterrupt) as error:
        parser.exit(1, str(error) + '\n')


if __name__ == '__main__':
    main()
