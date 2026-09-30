import subprocess
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from start import start


class StartupFailureTest(unittest.TestCase):
    def test_build_failure_never_provisions_or_starts_runtime(self):
        run = Mock(side_effect=[None, subprocess.CalledProcessError(1, "build")])
        with self.assertRaises(subprocess.CalledProcessError):
            start(run=run)
        self.assertEqual(run.call_count, 2)
        self.assertFalse(any("scripts/bootstrap.py" in call.args[0] for call in run.call_args_list))

    def test_bootstrap_failure_never_starts_application(self):
        run = Mock(side_effect=[None, subprocess.TimeoutExpired("bootstrap", 600)])
        with self.assertRaises(subprocess.TimeoutExpired):
            start(build=False, run=run)
        self.assertEqual(run.call_count, 2)

    def test_readiness_failure_propagates_instead_of_reporting_ready(self):
        run = Mock(side_effect=[None, None, subprocess.CalledProcessError(1, "up")])
        with self.assertRaises(subprocess.CalledProcessError):
            start(build=False, run=run)
        self.assertIn("--wait", run.call_args.args[0])

    def test_replicated_deployment_omits_laptop_override(self):
        run = Mock()
        with patch.dict("os.environ", {}, clear=True):
            start(replicas=2, run=run)
        arguments = [call.args[0] for call in run.call_args_list]
        self.assertEqual([a[-1] for a in arguments if "build" in a], ["identity", "travel", "payments", "dashboard"])
        self.assertNotIn("compose.local.yml", arguments[-1])


if __name__ == "__main__":
    unittest.main()
