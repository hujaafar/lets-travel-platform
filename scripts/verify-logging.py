"""Prove authenticated request correlation and optional-profile Loki ingestion."""

import argparse
from datetime import datetime, timezone
import time
import uuid

from runtime_checks import (
    AuthenticatedProbe, VerificationError, loki_records, matching_records,
    running_replicas, service_logs, validate_project, write_report,
)


def run(args):
    project = validate_project(args.project)
    since = datetime.now(timezone.utc).isoformat()
    start_ns = time.time_ns()
    report = {"started_at":since,"project":project,"passed":False,
              "loki_required":not args.service_logs_only,"requests":[]}
    try:
        if not args.service_logs_only:
            for service in ("loki", "log-collector"):
                if not running_replicas(project, service):
                    raise VerificationError("Start the monitoring profile first: " + service + " is not running")
            # The collector discovers containers every five seconds and follows new lines.
            time.sleep(6)
        with AuthenticatedProbe(project, args.credentials) as probe:
            for service, path in (("travel", "/api/travels"), ("payments", "/api/payments")):
                request_id = "tpverify-" + uuid.uuid4().hex
                result = probe.read(path, request_id)
                if not result.get("ok"):
                    raise VerificationError("Authenticated request failed for " + service)
                entry = {"service":service,"request_id":request_id,"service_logs":False,"loki":False}
                report["requests"].append(entry)
                deadline = time.monotonic() + 20
                while time.monotonic() < deadline:
                    target = matching_records(service_logs(project, service, since), request_id, path)
                    identity = matching_records(service_logs(project, "identity", since), request_id, "/internal/session")
                    if target and identity:
                        entry["service_logs"] = True
                        break
                    time.sleep(1)
                if not entry["service_logs"]:
                    raise VerificationError("Request ID did not correlate " + service + " with identity logs")
                if not args.service_logs_only:
                    deadline = time.monotonic() + 40
                    while time.monotonic() < deadline:
                        streams = loki_records(project, request_id, start_ns)
                        found = set()
                        for stream in streams:
                            name = stream.get("stream", {}).get("service")
                            expected = "/internal/session" if name == "identity" else path
                            if name in {"identity",service} and any(
                                matching_records(line, request_id, expected)
                                for _, line in stream.get("values", [])
                            ):
                                found.add(name)
                        if {"identity",service} <= found:
                            entry["loki"] = True
                            break
                        time.sleep(2)
                    if not entry["loki"]:
                        raise VerificationError("Loki did not ingest both correlated services for " + service)
                print("PASS " + service + " -> identity request correlation" +
                      (" and verified-TLS Loki ingestion" if entry["loki"] else " (Loki explicitly skipped)"))
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
    parser.add_argument("--project", default="travel-plan")
    parser.add_argument("--credentials", help="Private JSON with email/password, otherwise local bootstrap account")
    parser.add_argument("--service-logs-only", action="store_true", help="Explicitly skip Loki when monitoring is not running")
    parser.add_argument("--report", default="work/verification/logging.json")
    try:
        run(parser.parse_args())
    except VerificationError as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()
