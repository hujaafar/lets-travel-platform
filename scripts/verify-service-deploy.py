"""Prove isolated service scaling on the disposable GitHub review stack."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess

from runtime_checks import ROOT, AuthenticatedProbe, VerificationError, docker, running_replicas, write_report


def container_state():
    ids = docker('compose', 'ps', '-q').split()
    if not ids:
        raise VerificationError('No deployment found')
    # IDs/start times detect recreation or restart of unrelated services.
    data = json.loads(docker('inspect', *ids))
    return {row['Id']: {'service': row['Config']['Labels']['com.docker.compose.service'],
                        'started_at': row['State']['StartedAt']}
            for row in data}


def assert_unchanged(before, after, selected):
    others = lambda state: {key: value for key, value in state.items() if value['service'] != selected}
    if others(before) != others(after):
        raise VerificationError('Service-only deployment changed unrelated containers')


def apply(args, replicas, suffix):
    log = Path(args.report).parent / ('ansible-service-' + suffix + '.log')
    with log.open('w') as output:
        result = subprocess.run([
            'ansible-playbook', '-i', args.inventory, 'infra/ansible/service.yml',
            '--extra-vars', json.dumps({'app_dir': str(ROOT), 'service_name': 'travel',
                                       'replica_count': replicas, 'build_image': False}),
        ], cwd=ROOT, stdout=output, stderr=subprocess.STDOUT, timeout=360)
    if result.returncode:
        raise VerificationError('Service-only Ansible deployment failed')


def run(args):
    if os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('RUNNER_ENVIRONMENT') != 'github-hosted':
        raise VerificationError('Run this gate only on a disposable GitHub-hosted runner')
    report = {'passed': False, 'started_at': datetime.now(timezone.utc).isoformat(),
              'scope': 'Independent travel replica scaling and unchanged unrelated containers'}
    write_report(args.report, report)
    original = len(running_replicas('travel-plan', 'travel'))
    if original < 2:
        raise VerificationError('Start the two-replica stack first')
    try:
        baseline = container_state()
        with AuthenticatedProbe('travel-plan') as probe:
            try:
                apply(args, original + 1, 'scale-up')
                if len(running_replicas('travel-plan', 'travel')) != original + 1:
                    raise VerificationError('Travel did not reach the requested scale')
                assert_unchanged(baseline, container_state(), 'travel')
                if not all(probe.read(p).get('ok') for p in ('/api/auth/me', '/api/travels', '/api/payments')):
                    raise VerificationError('Authenticated reads failed after scaling')
                report['scale_up'] = True
            finally:
                apply(args, original, 'restore')
                report['original_replica_count_restored'] = len(running_replicas('travel-plan', 'travel')) == original
            assert_unchanged(baseline, container_state(), 'travel')
            if not report['original_replica_count_restored']:
                raise VerificationError('Original travel replica count was not restored')
        report['unrelated_containers_unchanged'] = True
        report['passed'] = True
        print('PASS service-only scale-up/restore; other services and databases unchanged')
    except BaseException as error:
        report['failure'] = type(error).__name__
        raise
    finally:
        report['finished_at'] = datetime.now(timezone.utc).isoformat()
        write_report(args.report, report)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inventory', required=True)
    parser.add_argument('--report', default='work/verification/service-deploy.json')
    try:
        run(parser.parse_args())
    except (VerificationError, subprocess.TimeoutExpired, OSError) as error:
        parser.exit(1, str(error) + '\n')


if __name__ == '__main__':
    main()
