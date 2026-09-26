"""Export bounded, redacted runtime diagnostics from disposable GitHub runners."""
import json
import os
from pathlib import Path
import re
import subprocess


def main():
    if os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('RUNNER_ENVIRONMENT') != 'github-hosted':
        raise SystemExit('Diagnostics are restricted to disposable GitHub-hosted runners.')
    root = Path(__file__).resolve().parents[1]
    private = set()

    def collect(value):
        if isinstance(value, dict):
            for item in value.values():
                collect(item)
        elif isinstance(value, list):
            for item in value:
                collect(item)
        elif isinstance(value, str) and len(value) >= 16:
            private.add(value)

    for name in ('bootstrap.json', 'vault-init.json', 'ci.json'):
        path = root / '.secrets' / name
        if path.exists():
            collect(json.loads(path.read_text()))
    for path in (root / '.secrets/approle').glob('*/*'):
        if path.is_file():
            private.add(path.read_text().strip())

    def command(*args):
        result = subprocess.run(args, cwd=root, capture_output=True, text=True, timeout=30)
        return result.stdout + result.stderr

    output = command('docker', 'ps', '-a', '--filter', 'label=com.docker.compose.project=travel-plan', '--format', '{{.Names}} {{.Status}}')
    names = [line.split()[0] for line in output.splitlines() if line.startswith('travel-plan-')]
    for name in names:
        output += '\n### ' + name + '\n'
        output += command('docker', 'inspect', '--format', '{{json .State}}', name)
        output += command('docker', 'logs', '--tail', '60', name)
    for value in sorted(private, key=len, reverse=True):
        if value:
            output = output.replace(value, '[REDACTED]')
    output = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', output)
    output = re.sub(r'\bhvs\.[A-Za-z0-9_-]+', '[REDACTED-VAULT-TOKEN]', output)
    destination = root / 'work/verification'
    destination.mkdir(parents=True, exist_ok=True)
    (destination / 'runtime-diagnostics.log').write_text(output)
    print(output[-18000:])


if __name__ == '__main__':
    main()
