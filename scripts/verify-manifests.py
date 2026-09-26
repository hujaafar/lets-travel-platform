"""Validate CI/deployment configuration without secrets, downloads or Docker startup."""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from runtime_checks import ROOT, VerificationError, write_report
from process_runtime import run_command


def compose(files, environment_file, profiles=()):
    environment = os.environ.copy()
    for key in ("COMPOSE_FILE", "COMPOSE_PROJECT_NAME", "COMPOSE_PROFILES", "COMPOSE_ENV_FILES"):
        environment.pop(key, None)
    for key in ("POSTGRES_PASSWORD", "NEO4J_PASSWORD", "TLS_PASSWORD", "JENKINS_ADMIN_PASSWORD", "SONAR_DB_PASSWORD", "GRAFANA_ADMIN_PASSWORD"):
        environment[key] = "manifest-validation-only"
    arguments = ["docker", "compose", "--project-directory", str(ROOT), "--env-file", str(environment_file)]
    for file in files:
        arguments += ["-f", str(ROOT / file)]
    for profile in profiles:
        arguments += ["--profile", profile]
    result = run_command(arguments + ["config", "--format", "json"],
                            capture_output=True, text=True, env=environment, timeout=30)
    if result.returncode:
        raise VerificationError("Compose validation failed for " + ", ".join(files))
    return json.loads(result.stdout)


def stage(jenkinsfile, name):
    stages = list(re.finditer(r"stage\('([^']+)'\)\s*\{", jenkinsfile))
    for index, match in enumerate(stages):
        if match.group(1) == name:
            return jenkinsfile[match.end():stages[index+1].start() if index+1 < len(stages) else len(jenkinsfile)]
    raise VerificationError("Missing Jenkins stage: " + name)


def check_models(runtime, local, tools, build):
    checks = []
    def require(condition, label):
        if not condition:
            raise VerificationError(label)
        checks.append(label)
    application = {"identity", "travel", "payments", "dashboard"}
    require(set(build["services"]) == application, "Build model contains exactly the application images")
    for name in application:
        image = build["services"][name]
        actual = runtime["services"][name]
        require(image["image"] == actual["image"] and image["build"] == actual["build"], name + " build matches runtime image/context/Dockerfile/args")
        require(not any(field in image for field in ("environment", "volumes", "ports", "secrets")), name + " build model needs no runtime credentials or mounts")
        require("manifest-validation-only" not in json.dumps(image), name + " build does not consume runtime-secret placeholders")
        require(Path(image["build"]["context"], image["build"]["dockerfile"]).is_file(), name + " Dockerfile exists")
    for name in ("identity", "travel", "payments"):
        require(runtime["services"][name]["deploy"]["replicas"] >= 2, name + " base profile has multiple replicas")
        require(local["services"][name]["deploy"]["replicas"] == 1, name + " laptop profile remains single-replica")
        require(not runtime["services"][name].get("ports"), name + " is not published directly")
    require(runtime["networks"]["backend"]["internal"], "Backend network is internal")
    for name in ("postgres", "neo4j"):
        require(not runtime["services"][name].get("ports"), name + " has no host port")
    require(runtime["services"]["neo4j"]["environment"]["NEO4J_server_bolt_tls__level"] == "REQUIRED", "Neo4j requires Bolt TLS")
    require(bool(runtime["services"]["neo4j"].get("healthcheck", {}).get("test")), "Neo4j startup waits for its Bolt listener")
    for name, service in tools["services"].items():
        for port in service.get("ports", []):
            require(port.get("host_ip") == "127.0.0.1", name + " host endpoint stays loopback-bound")
    require(tools["networks"]["monitoring"]["internal"], "Monitoring network is internal")
    return checks


def check_kubernetes_assets():
    checks = []

    def require(condition, label):
        if not condition:
            raise VerificationError(label)
        checks.append(label)

    base = ROOT / "infra" / "kubernetes" / "base"
    production = ROOT / "infra" / "kubernetes" / "production"
    required = {
        "namespace.yaml", "service-accounts.yaml", "services.yaml",
        "dashboard-config.yaml", "deployments.yaml", "availability.yaml",
        "network-policies.yaml", "kustomization.yaml",
    }
    require(required <= {path.name for path in base.glob("*.yaml")}, "Kubernetes base contains every required application manifest")
    rendered_source = "\n".join(path.read_text(encoding="utf-8") for path in sorted(base.glob("*.yaml")))
    require(len(re.findall(r"(?m)^kind: Deployment$", rendered_source)) == 4,
            "Kubernetes base declares four application deployments")
    require(rendered_source.count("replicas: 3") >= 4, "Every Kubernetes application deployment starts with three replicas")
    require(rendered_source.count("topology.kubernetes.io/zone") >= 4, "Kubernetes workloads spread across zones")
    require(rendered_source.count("kubernetes.io/hostname") >= 4, "Kubernetes workloads spread across hosts")
    require(rendered_source.count("readOnlyRootFilesystem: true") >= 4, "Kubernetes application filesystems are read-only")
    require(rendered_source.count("allowPrivilegeEscalation: false") >= 4, "Kubernetes containers deny privilege escalation")
    require(rendered_source.count("automountServiceAccountToken: false") >= 8, "Kubernetes workloads do not receive unused API tokens")
    require(len(re.findall(r"(?m)^kind: PodDisruptionBudget$", rendered_source)) == 4,
            "Kubernetes workloads have disruption budgets")
    require(len(re.findall(r"(?m)^kind: HorizontalPodAutoscaler$", rendered_source)) == 3,
            "Java services have autoscaling policies")
    require(len(re.findall(r"(?m)^kind: NetworkPolicy$", rendered_source)) >= 6 and "name: default-deny" in rendered_source,
            "Kubernetes networking is default-deny with explicit paths")
    require("kind: Secret\n" not in rendered_source and "stringData:" not in rendered_source,
            "Kubernetes base contains no committed secret payloads")
    require(all((production / name).is_file() for name in
                ("postgres-cluster.yaml", "vault-values.yaml", "external-secrets.yaml", "neo4j-values.yaml")),
            "Production HA operator inputs cover PostgreSQL, Vault, external secrets and Neo4j")
    require("instances: 3" in (production / "postgres-cluster.yaml").read_text(encoding="utf-8"),
            "Production PostgreSQL template has three instances")
    require("replicas: 3" in (production / "vault-values.yaml").read_text(encoding="utf-8"),
            "Production Vault template has three Raft replicas")
    neo4j = (production / "neo4j-values.yaml").read_text(encoding="utf-8")
    require("minimumClusterSize: 3" in neo4j and 'acceptLicenseAgreement: "no"' in neo4j,
            "Neo4j cluster template requires explicit license acceptance")
    return checks


def run(args):
    report = {"started_at":datetime.now(timezone.utc).isoformat(), "passed":False,
              "scope":"Configuration contracts and optional Ansible syntax; not a running deployment or Jenkins execution",
              "checks":[], "ansible":{"status":"not-run"}}
    try:
        (ROOT / "work").mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="manifest-check-", dir=ROOT / "work") as scratch:
            empty = Path(scratch) / "empty.env"
            empty.write_text("")
            runtime = compose(["compose.yml"], empty)
            local = compose(["compose.yml", "compose.local.yml"], empty)
            tools = compose(["compose.yml", "compose.tools.yml"], empty, ("tools", "monitoring"))
            build = compose(["compose.build.yml"], empty)
            report["checks"] += check_models(runtime, local, tools, build)
        report["checks"] += check_kubernetes_assets()
        jenkins = (ROOT / "Jenkinsfile").read_text()
        for name in ("SonarQube analysis", "Quality gate"):
            if not re.search(r"when\s*\{\s*branch\s+'main'\s*\}", stage(jenkins, name)):
                raise VerificationError(name + " must remain main-only for Community Build")
        if "compose.build.yml" not in stage(jenkins, "Container build") or "bootstrap.py" in stage(jenkins, "Container build"):
            raise VerificationError("PR container builds must use the secret-free build model")
        if not re.search(r"when\s*\{\s*not\s*\{\s*changeRequest\(\)\s*\}\s*\}", stage(jenkins, "Integration and browsers")):
            raise VerificationError("Runtime bootstrap must stay outside untrusted PR jobs")
        report["checks"].append("Jenkins Community scoping and PR/runtime separation contracts")
        ansible = args.ansible or shutil.which("ansible-playbook")
        if ansible:
            try:
                result = run_command([ansible, "--syntax-check", "-i", "infra/ansible/inventory.example.ini", "infra/ansible/deploy.yml"],
                                     cwd=ROOT, capture_output=True, text=True, timeout=60)
            except (subprocess.TimeoutExpired, OSError) as error:
                report["ansible"] = {"status":"failed", "reason":type(error).__name__}
                raise VerificationError("Ansible controller did not complete within its startup deadline") from error
            report["ansible"] = {"status":"passed" if result.returncode == 0 else "failed", "command":"ansible-playbook --syntax-check (example inventory; no host contact)",
                                 "stdout":result.stdout[-5000:],"stderr":result.stderr[-5000:]}
            if result.returncode:
                print(result.stderr[-5000:] or result.stdout[-5000:])
                raise VerificationError("Ansible syntax validation failed; verify the declared collection is installed")
        else:
            report["ansible"] = {"status":"not-run", "reason":"ansible-playbook is not available on this host"}
            if args.require_ansible:
                raise VerificationError("Ansible syntax validation was required but its executable is unavailable")
        report["passed"] = True
        print("PASS " + str(len(report["checks"])) + " configuration contracts. Ansible syntax: " + report["ansible"]["status"])
    finally:
        report["finished_at"] = datetime.now(timezone.utc).isoformat()
        write_report(args.report, report)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ansible", help="Path to an already installed ansible-playbook executable")
    parser.add_argument("--require-ansible", action="store_true")
    parser.add_argument("--report", default="work/verification/manifests.json")
    try:
        run(parser.parse_args())
    except (VerificationError, subprocess.TimeoutExpired, OSError) as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()
