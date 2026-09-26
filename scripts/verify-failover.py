"""Explicit opt-in replica-failure test. Never stops databases or removes volumes."""

import argparse
from datetime import datetime, timezone
import signal
import time

from runtime_checks import (
    AuthenticatedProbe, SERVICES, VerificationError, running_replicas,
    temporarily_stop, validate_project, wait_healthy, write_report,
)


def run(args):
    if not args.run_failover:
        print("No changes made. This test stops and restores one replica per Java service.")
        print("Run on a dedicated review environment with --run-failover after starting two healthy replicas each.")
        return
    project = validate_project(args.project)
    report = {
        "started_at":datetime.now(timezone.utc).isoformat(), "project":project,
        "scope":"Java replica continuity only; not database or host high availability",
        "passed":False, "tests":[],
    }
    write_report(args.report, report)
    paths = ("/api/auth/me", "/api/travels", "/api/payments")
    try:
        replicas = {service:running_replicas(project, service) for service in SERVICES}
        for service, containers in replicas.items():
            if len(containers) < 2:
                raise VerificationError(service + " needs at least two running replicas; no services stopped")
            for container in containers:
                wait_healthy(container, timeout=10)
        with AuthenticatedProbe(project, args.credentials) as probe:
            if not all(probe.read(path).get("ok") for path in paths):
                raise VerificationError("Authenticated baseline failed; no services stopped")
            for service, containers in replicas.items():
                test = {"service":service, "stopped_replica":containers[0], "restored":False}
                report["tests"].append(test)
                write_report(args.report, report)
                print("Testing " + service + ": temporarily stopping " + containers[0], flush=True)
                try:
                    with temporarily_stop(containers[0], restoration=test):
                        started = time.monotonic()
                        failures, consecutive, total = 0, 0, 0
                        while time.monotonic() - started < args.recovery_timeout:
                            results = [probe.read(path) for path in paths]
                            total += len(results)
                            failures += sum(not result.get("ok") for result in results)
                            consecutive = consecutive + 1 if all(r.get("ok") for r in results) else 0
                            if consecutive >= 3:
                                break
                            time.sleep(1)
                        test.update(requests=total, failed_requests=failures,
                                    recovery_seconds=round(time.monotonic()-started, 2))
                        if consecutive < 3 or time.monotonic() - started > args.recovery_timeout:
                            raise VerificationError(service + " failed to recover within the configured deadline")
                        # Recovery alone is insufficient: prove sustained reads through every service.
                        test["stable_requests"] = 0
                        for _ in range(6):
                            results = [probe.read(path) for path in paths]
                            test["stable_requests"] += len(results)
                            test["requests"] += len(results)
                            test["failed_requests"] += sum(not result.get("ok") for result in results)
                            if not all(result.get("ok") for result in results):
                                raise VerificationError(service + " was unstable after initial recovery")
                            time.sleep(1)
                    test["restored"] = True
                    test["passed"] = True
                finally:
                    write_report(args.report, report)
                print("PASS " + service + ": authenticated continuity; stopped replica restored", flush=True)
        report["passed"] = True
    except BaseException as error:
        report["passed"] = False
        report["failure"] = type(error).__name__
        raise
    finally:
        report["finished_at"] = datetime.now(timezone.utc).isoformat()
        write_report(args.report, report)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-failover", action="store_true", help="Explicitly authorize stopping/restoring one Java replica at a time")
    parser.add_argument("--project", default="travel-plan")
    parser.add_argument("--credentials", help="Private JSON file with email/password; otherwise use local bootstrap credentials")
    parser.add_argument("--recovery-timeout", type=int, default=45)
    parser.add_argument("--report", default="work/verification/failover.json")
    args = parser.parse_args()
    if args.recovery_timeout < 10 or args.recovery_timeout > 180:
        parser.error("recovery timeout must be between 10 and 180 seconds")
    def interrupted(signum, frame):
        raise KeyboardInterrupt("Verification interrupted; restoring the stopped replica")
    signal.signal(signal.SIGTERM, interrupted)
    try:
        run(args)
    except (VerificationError, KeyboardInterrupt) as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()
