"""Reapply Ansible and verify persisted data and an existing session survive.

Run only on the disposable GitHub-hosted review runner. No record contents,
password hashes, cookies or credential fingerprints are written to reports.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
import subprocess

from runtime_checks import ROOT, AuthenticatedProbe, VerificationError, docker, write_report

TABLES = ('identity.users', 'identity.bootstrap_state', 'travel.travels',
          'travel.stops', 'travel.participants', 'payments.gateways', 'payments.transactions')


def fingerprints():
    # Exclude expiring sessions/login attempts and the asynchronous graph outbox.
    # Consistent snapshot: only final SHA-256 digests leave this function.
    sql = 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n'
    for table in TABLES:
        sql += f"SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb) FROM {table} t;\n"
    sql += 'COMMIT;\n'
    result = docker('compose', 'exec', '-T', 'postgres', 'psql', '-qAt', '-v',
                    'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'travelplan', payload=sql)
    lines = result.splitlines()
    if len(lines) != len(TABLES):
        raise VerificationError('Unexpected database snapshot shape')
    return {table: hashlib.sha256(line.encode()).digest() for table, line in zip(TABLES, lines)}


def run(args):
    if os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('RUNNER_ENVIRONMENT') != 'github-hosted':
        raise VerificationError('Redeployment gate runs only on a disposable GitHub-hosted runner')
    report = {'passed': False, 'started_at': datetime.now(timezone.utc).isoformat(),
              'scope': 'Ansible reapplication, business-data preservation and existing-session continuity'}
    write_report(args.report, report)
    try:
        with AuthenticatedProbe('travel-plan') as probe:
            if not probe.read('/api/auth/me').get('ok'):
                raise VerificationError('Existing-session baseline failed')
            before = fingerprints()
            log = Path(args.report).parent / 'ansible-redeploy.log'
            with log.open('w') as output:
                result = subprocess.run([
                    'ansible-playbook', '-i', args.inventory, 'infra/ansible/deploy.yml',
                    '--extra-vars', 'app_dir=' + str(ROOT),
                    '--extra-vars', '{"manage_system_packages":false,"replica_count":2}',
                ], cwd=ROOT, stdout=output, stderr=subprocess.STDOUT, timeout=1200)
            if result.returncode:
                raise VerificationError('Second Ansible deployment failed; inspect its sanitized log')
            after = fingerprints()
            report['tables_preserved'] = {table: before[table] == after[table] for table in TABLES}
            report['existing_session_preserved'] = all(
                probe.read(path).get('ok') for path in ('/api/auth/me', '/api/travels', '/api/payments'))
            if not all(report['tables_preserved'].values()) or not report['existing_session_preserved']:
                raise VerificationError('Redeployment changed business data or invalidated the session')
        report['passed'] = True
        print('PASS Ansible reapplication preserves business tables and the existing session')
    except BaseException as error:
        report['failure'] = type(error).__name__
        raise
    finally:
        report['finished_at'] = datetime.now(timezone.utc).isoformat()
        write_report(args.report, report)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inventory', required=True)
    parser.add_argument('--report', default='work/verification/redeploy.json')
    try:
        run(parser.parse_args())
    except (VerificationError, OSError, subprocess.TimeoutExpired) as error:
        parser.exit(1, str(error) + '\n')


if __name__ == '__main__':
    main()
