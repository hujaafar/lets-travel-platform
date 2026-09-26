"""Build sequentially, provision secrets, and wait for the local app to be ready."""

import argparse
import os
from pathlib import Path
import subprocess
import sys
from process_runtime import run_command

ROOT = Path(__file__).resolve().parents[1]


def start(replicas=1, build=True, run=run_command):
    def command(arguments, timeout):
        run(arguments, cwd=ROOT, check=True, timeout=timeout)

    command(["docker", "info", "--format", "Docker {{.ServerVersion}}"], 20)
    if build:
        files = ["-f", "compose.build.yml"]
        if os.environ.get("BUILD_CA_FILE"):
            files += ["-f", "compose.build-ca.yml"]
        for service in ("identity", "travel", "payments", "dashboard"):
            command(["docker", "compose", *files, "build", service], 600)
    command([sys.executable, "scripts/bootstrap.py"], 600)
    files = ["-f", "compose.yml"]
    if replicas == 1:
        files += ["-f", "compose.local.yml"]
    command(["docker", "compose", *files, "up", "-d", "--no-build", "--wait", "--wait-timeout", "240"], 300)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--replicas", type=int, choices=(1, 2), default=1)
    parser.add_argument("--no-build", action="store_true", help="Use images already built from this revision")
    args = parser.parse_args()
    try:
        start(args.replicas, not args.no_build)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as error:
        print("Startup did not complete: " + type(error).__name__ + ". Data volumes were preserved.", file=sys.stderr)
        return 1
    print("Ready: https://localhost:8443. Login details: .secrets/admin-login.txt")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
