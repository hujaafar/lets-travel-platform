"""Run reproducible local checks and optional live gates; never imply human approval.

Reports and logs stay under ignored work/. Missing live/external gates remain
explicitly unverified even when every executed local check passes.
"""

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from process_runtime import run_command

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "work/submission-checks")
    parser.add_argument("--offline", action="store_true", help="Use cached Maven dependencies")
    parser.add_argument("--browser", choices=["chrome", "firefox"], default="chrome")
    parser.add_argument("--skip-browser", action="store_true", help="Record preview checks as unverified")
    parser.add_argument("--ansible", help="Explicit Ansible executable for the syntax check")
    parser.add_argument("--live", action="store_true", help="Check an already running local test stack")
    parser.add_argument("--run-failover", action="store_true", help="Temporarily stop/restore one Java replica; requires --live")
    args = parser.parse_args()
    if args.run_failover and not args.live:
        parser.error("--run-failover requires --live and an already running replicated test stack")
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    stages = []
    env = os.environ.copy()
    env["DESIGN_BROWSER"] = args.browser
    env["DESIGN_SHOTS"] = str(output / args.browser)
    env["PREVIEW_PATH"] = str(output / "Travel-Plan-Preview.html")
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm") or "npm"
    node = shutil.which("node") or "node"
    wrapper = str(ROOT / ("mvnw.cmd" if os.name == "nt" else "mvnw"))

    def run(name, command, cwd=ROOT, timeout=300):
        log = output / (name + ".log")
        print("Running " + name, flush=True)
        try:
            with log.open("w", encoding="utf-8") as stream:
                if timeout is None:
                    # The failover verifier must own restoration, including on
                    # console interruption. Do not force-kill its process tree.
                    process = subprocess.Popen(command, cwd=cwd, env=env, stdout=stream,
                                               stderr=subprocess.STDOUT, text=True)
                    interrupted = False
                    while True:
                        try:
                            returncode = process.wait()
                            break
                        except KeyboardInterrupt:
                            interrupted = True
                            print("Waiting for the failover verifier to restore its replica", flush=True)
                    if interrupted:
                        raise KeyboardInterrupt()
                    result = subprocess.CompletedProcess(command, returncode)
                else:
                    result = run_command(command, cwd=cwd, env=env, stdout=stream,
                                         stderr=subprocess.STDOUT, text=True, timeout=timeout)
            status = "passed" if result.returncode == 0 else "failed"
            detail = {"return_code": result.returncode}
        except (OSError, subprocess.TimeoutExpired) as error:
            status, detail = "failed", {"error": type(error).__name__}
        stages.append({"name": name, "status": status, "log": log.name, **detail})
        print(name + ": " + status, flush=True)
        return status == "passed"

    def unverified(name, reason):
        stages.append({"name": name, "status": "unverified", "reason": reason})

    java_args = [wrapper, "-B", "-ntp"] + (["-o"] if args.offline else []) + ["verify"]
    run("java-tests-and-build", java_args)
    run("provisioning-unit-tests", [sys.executable, "-m", "unittest", "discover", "-s", "scripts/tests", "-v"])
    if os.name != "posix":
        unverified("native-posix-permissions", "Run the provisioning tests on native Linux files; Windows skips POSIX modes")
    run("frontend-unit-tests", [npm, "test"], ROOT / "dashboard")
    built = run("frontend-build", [npm, "run", "build"], ROOT / "dashboard")
    run("frontend-format", [node, "node_modules/prettier/bin/prettier.cjs", "--check", "src", "e2e", "scripts"], ROOT / "dashboard")
    run("frontend-dependency-audit", [npm, "audit", "--audit-level=moderate"], ROOT / "dashboard")
    manifests = [sys.executable, "scripts/verify-manifests.py", "--report", str(output / "manifests.json"), "--require-ansible"]
    if args.ansible:
        manifests += ["--ansible", args.ansible]
    run("manifest-and-ansible-validation", manifests)
    if not args.skip_browser and built:
        exported = run("export-portable-preview", [sys.executable, "scripts/export-preview.py", env["PREVIEW_PATH"]])
        if exported:
            for script in ["verify-admin-flows", "verify-design", "verify-orbit", "verify-consistency"]:
                run(script, [node, "scripts/" + script + ".mjs"], ROOT / "dashboard", timeout=300)
    else:
        unverified("portable-browser-checks", "Explicitly skipped or frontend build failed")
    unverified("second-browser", "Run this command in the other browser environment and retain both reports")

    if args.live:
        # Read-only engine probe before any verifier or test touches the stack.
        available = run("docker-engine", ["docker", "info", "--format", "{{.ServerVersion}}"], timeout=15)
        if available:
            run("live-infrastructure", [sys.executable, "scripts/verify-infrastructure.py"])
            run("live-api-browser-tests", [node, "node_modules/@playwright/test/cli.js", "test", "--project=" + args.browser], ROOT / "dashboard")
            run("live-logging", [sys.executable, "scripts/verify-logging.py", "--report", str(output / "logging.json")])
            if args.run_failover:
                # The verifier owns its deadlines and finally restoration. Do not
                # kill it from an outer timeout while a replica is stopped.
                run("live-replica-failover", [sys.executable, "scripts/verify-failover.py", "--run-failover", "--report", str(output / "failover.json")], timeout=None)
            else:
                unverified("live-replica-failover", "Requires explicit --run-failover on a replicated test deployment")
        else:
            unverified("live-stack-gates", "Docker engine is unavailable; no live success is claimed")
    else:
        unverified("live-stack-gates", "Run --live on an already running test environment; failover also requires --run-failover")
    for name, reason in [
        ("jenkins-sonar-execution", "Attach successful real pipeline and main quality-gate evidence"),
        ("ansible-deployment", "Syntax checking is separate from an executed deployment"),
        ("independent-pr-review", "A reviewer other than the author and enforced Git-host branch protection are required"),
        ("provider-sandbox-verification", "Verify owner-supplied Stripe/PayPal sandbox credentials through the protected provider endpoint"),
        ("data-secret-ingress-ha", "Two Java replicas do not prove redundant databases, Vault, ingress or tested restoration"),
        ("neo4j-least-privilege", "Verify scoped runtime privileges on a deployment that supports them; Community users imply admin")
    ]:
        unverified(name, reason)
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    dirty = bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True).strip())
    failed = [stage["name"] for stage in stages if stage["status"] == "failed"]
    report = {"checked_at": datetime.now(timezone.utc).isoformat(), "source_revision": revision,
              "working_tree_has_changes": dirty, "browser": args.browser, "stages": stages,
              "executed_checks_passed": not failed, "submission_ready": False,
              "note": "Unverified gates require separate evidence; this script cannot issue independent approval"}
    destination = output / "submission-checks.json"
    destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("Report: " + str(destination), flush=True)
    print("Submission sign-off remains unverified. Failed executed checks: " + str(len(failed)), flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
