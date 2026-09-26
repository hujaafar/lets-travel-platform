"""Failure-path checks use mocks; no Docker daemon, credentials or records."""

import importlib.util
from contextlib import contextmanager
import json
import subprocess
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import runtime_checks


def verifier(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parents[1] / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RestorationTest(unittest.TestCase):
    def test_failed_probe_restores_replica_and_reports_restoration(self):
        state = {"restored":False}
        with patch.object(runtime_checks, "docker") as docker, patch.object(runtime_checks, "wait_healthy") as healthy:
            with self.assertRaisesRegex(RuntimeError, "request failed"):
                with runtime_checks.temporarily_stop("replica123", restoration=state):
                    raise RuntimeError("request failed")
        self.assertEqual([call.args[:2] for call in docker.call_args_list], [("stop","--time"),("start","replica123")])
        healthy.assert_called_once_with("replica123", 180)
        self.assertTrue(state["restored"])

    def test_interruption_during_stop_still_attempts_restore(self):
        def action(command, *args, **kwargs):
            if command == "stop":
                raise KeyboardInterrupt()
        with patch.object(runtime_checks, "docker", side_effect=action) as docker, patch.object(runtime_checks, "wait_healthy"):
            with self.assertRaises(KeyboardInterrupt):
                with runtime_checks.temporarily_stop("replica123"):
                    self.fail("Stop never completed")
        self.assertEqual(docker.call_args_list[-1].args, ("start", "replica123"))

    def test_restore_failure_is_explicit_and_never_reports_success(self):
        state = {"restored":False}
        with patch.object(runtime_checks, "docker"), patch.object(runtime_checks, "wait_healthy", side_effect=RuntimeError("offline")):
            with self.assertRaisesRegex(runtime_checks.VerificationError, "RESTORATION NEEDS ATTENTION"):
                with runtime_checks.temporarily_stop("replica123", restoration=state):
                    pass
        self.assertFalse(state["restored"])


class CorrelationTest(unittest.TestCase):
    def test_exact_successful_request_matches_plain_and_collector_json(self):
        line = json.dumps({"requestId":"tpverify-abc", "message":"request method=GET path=/api/travels status=200 durationMs=5"})
        self.assertEqual(len(runtime_checks.matching_records(line, "tpverify-abc", "/api/travels")), 1)
        self.assertEqual(len(runtime_checks.matching_records("2026-09-14T00:00:00Z " + line, "tpverify-abc", "/api/travels")), 1)

    def test_wrong_request_path_or_failed_status_cannot_satisfy_gate(self):
        line = json.dumps({"requestId":"other", "message":"request method=GET path=/api/travels status=200 durationMs=5"})
        self.assertFalse(runtime_checks.matching_records(line, "tpverify-abc", "/api/travels"))
        line = json.dumps({"requestId":"tpverify-abc", "message":"request method=GET path=/api/travels status=401 durationMs=5"})
        self.assertFalse(runtime_checks.matching_records(line, "tpverify-abc", "/api/travels"))
        self.assertFalse(runtime_checks.matching_records("unstructured log line", "tpverify-abc", "/api/travels"))


class ManifestDeadlineTest(unittest.TestCase):
    def test_controller_timeout_cannot_be_reported_as_a_skipped_or_passed_check(self):
        module = verifier("verify-manifests")
        with tempfile.TemporaryDirectory() as scratch:
            report = Path(scratch) / "report.json"
            args = SimpleNamespace(ansible="ansible-playbook", require_ansible=True, report=str(report))
            with patch.object(module, "compose", return_value={}), \
                 patch.object(module, "check_models", return_value=[]), \
                 patch.object(module, "run_command", side_effect=subprocess.TimeoutExpired("ansible", 60)):
                with self.assertRaisesRegex(runtime_checks.VerificationError, "startup deadline"):
                    module.run(args)
            result = json.loads(report.read_text())
            self.assertFalse(result["passed"])
            self.assertEqual(result["ansible"], {"status":"failed", "reason":"TimeoutExpired"})


class PreflightTest(unittest.TestCase):
    def test_failover_requires_opt_in_before_any_engine_contact(self):
        module = verifier("verify-failover")
        with patch.object(module, "running_replicas") as replicas, patch("builtins.print"):
            module.run(SimpleNamespace(run_failover=False))
        replicas.assert_not_called()

    def test_failed_engine_preflight_replaces_failover_report_with_failure(self):
        module = verifier("verify-failover")
        with tempfile.TemporaryDirectory() as scratch:
            report = Path(scratch) / "report.json"
            report.write_text('{"passed":true}')
            args = SimpleNamespace(run_failover=True, project="travel-plan", report=str(report))
            with patch.object(module, "running_replicas", side_effect=runtime_checks.VerificationError("offline")):
                with self.assertRaises(runtime_checks.VerificationError):
                    module.run(args)
            result = json.loads(report.read_text())
            self.assertFalse(result["passed"])
            self.assertEqual(result["tests"], [])

    def test_missing_monitoring_cannot_leave_a_stale_success_report(self):
        module = verifier("verify-logging")
        with tempfile.TemporaryDirectory() as scratch:
            report = Path(scratch) / "report.json"
            report.write_text('{"passed":true}')
            args = SimpleNamespace(project="travel-plan", report=str(report), service_logs_only=False)
            with patch.object(module, "running_replicas", return_value=[]):
                with self.assertRaises(runtime_checks.VerificationError):
                    module.run(args)
            result = json.loads(report.read_text())
            self.assertFalse(result["passed"])
            self.assertTrue(result["loki_required"])


class CleanupReportTest(unittest.TestCase):
    def test_failover_cleanup_failure_cannot_report_success_after_restoration(self):
        module = verifier("verify-failover")

        @contextmanager
        def restored_replica(container, restoration):
            try:
                yield
            finally:
                restoration["restored"] = True

        with tempfile.TemporaryDirectory() as scratch:
            report = Path(scratch) / "report.json"
            args = SimpleNamespace(run_failover=True, project="travel-plan", report=str(report),
                                   credentials=None, recovery_timeout=45)
            with (
                patch.object(module, "running_replicas", return_value=["replica1", "replica2"]),
                patch.object(module, "wait_healthy"),
                patch.object(module, "temporarily_stop", side_effect=restored_replica),
                patch.object(module.time, "sleep"),
                patch.object(module, "AuthenticatedProbe") as probe,
                patch("builtins.print"),
            ):
                probe.return_value.__enter__.return_value.read.return_value = {"ok":True}
                probe.return_value.__exit__.side_effect = runtime_checks.VerificationError("private-cleanup-detail")
                with self.assertRaises(runtime_checks.VerificationError):
                    module.run(args)
            result = json.loads(report.read_text())
            self.assertFalse(result["passed"])
            self.assertEqual(result["failure"], "VerificationError")
            self.assertEqual(len(result["tests"]), 3)
            self.assertTrue(all(test["passed"] and test["restored"] for test in result["tests"]))
            self.assertNotIn("private-cleanup-detail", report.read_text())

    def test_logging_cleanup_failure_cannot_report_success_after_correlation(self):
        module = verifier("verify-logging")
        with tempfile.TemporaryDirectory() as scratch:
            report = Path(scratch) / "report.json"
            args = SimpleNamespace(project="travel-plan", report=str(report),
                                   service_logs_only=True, credentials=None)
            with (
                patch.object(module, "service_logs", return_value="mocked logs"),
                patch.object(module, "matching_records", return_value=[{}]),
                patch.object(module, "AuthenticatedProbe") as probe,
                patch("builtins.print"),
            ):
                probe.return_value.__enter__.return_value.read.return_value = {"ok":True}
                probe.return_value.__exit__.side_effect = runtime_checks.VerificationError("private-cleanup-detail")
                with self.assertRaises(runtime_checks.VerificationError):
                    module.run(args)
            result = json.loads(report.read_text())
            self.assertFalse(result["passed"])
            self.assertEqual(result["failure"], "VerificationError")
            self.assertEqual(len(result["requests"]), 2)
            self.assertTrue(all(request["service_logs"] for request in result["requests"]))
            self.assertNotIn("private-cleanup-detail", report.read_text())


if __name__ == "__main__":
    unittest.main()
