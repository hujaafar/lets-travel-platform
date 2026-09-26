"""Verify both owner sandbox providers through authenticated admin endpoints.

Requires a running bootstrapped stack and owner sandbox credentials configured
in Vault. Never collects payments, changes gateways or writes provider secrets.
Absent credentials are a failed/unverified gate, never a successful test.
"""
import argparse
from datetime import datetime, timezone

from runtime_checks import AuthenticatedProbe, VerificationError, validate_project, write_report


def verify(probe):
    result = probe.command('providers')
    if not result.get('ok'):
        raise VerificationError('Cannot read payment gateway configuration')
    providers = {}
    for provider in ('STRIPE', 'PAYPAL'):
        gateways = [row for row in result['gateways'] if row.get('provider') == provider]
        configured = [row for row in gateways if row.get('configured')]
        if not gateways:
            providers[provider] = {'passed': False, 'reason': 'No gateway record'}
        elif not configured:
            providers[provider] = {'passed': False, 'reason': 'Sandbox credentials not configured in Vault'}
        else:
            response = probe.command('test_provider', gateway_id=configured[0]['id'])
            providers[provider] = {'passed': bool(response.get('ok')), 'http_status': response.get('status')}
    return providers


def run(args):
    project = validate_project(args.project)
    report = {'passed': False, 'started_at': datetime.now(timezone.utc).isoformat(),
              'scope': 'Stripe test balance and PayPal sandbox token verification; no charges or refunds'}
    write_report(args.report, report)
    try:
        with AuthenticatedProbe(project, args.credentials) as probe:
            report['providers'] = verify(probe)
            if not all(p['passed'] for p in report['providers'].values()):
                raise VerificationError('Both sandbox providers must pass; see the credential-free report')
        report['passed'] = True
        print('PASS Stripe and PayPal sandbox credentials verified without collecting money')
    except BaseException as error:
        report['failure'] = type(error).__name__
        raise
    finally:
        report['finished_at'] = datetime.now(timezone.utc).isoformat()
        write_report(args.report, report)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', default='travel-plan')
    parser.add_argument('--credentials', help='Private JSON file with admin email/password; defaults to local bootstrap')
    parser.add_argument('--report', default='work/verification/providers.json')
    try:
        run(parser.parse_args())
    except (VerificationError, OSError) as error:
        parser.exit(1, str(error) + '\n')


if __name__ == '__main__':
    main()
