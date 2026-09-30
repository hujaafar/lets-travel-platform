from pathlib import Path
import subprocess
import sys
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from process_runtime import run_command


class CommandDeadlineTest(unittest.TestCase):
    def test_capture_preserves_input_and_nonzero_error(self):
        with self.assertRaises(subprocess.CalledProcessError) as result:
            run_command([sys.executable, "-c", "import sys; print(sys.stdin.read()); print('failed', file=sys.stderr); sys.exit(7)"],
                        input="fixture", capture_output=True, text=True, check=True, timeout=5)
        self.assertEqual(result.exception.returncode, 7)
        self.assertEqual(result.exception.stdout, "fixture\n")
        self.assertEqual(result.exception.stderr, "failed\n")

    def test_slow_wrapper_and_inherited_output_do_not_defeat_timeout(self):
        wrapper = "import subprocess,sys,time; subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(8)']); time.sleep(8)"
        started = time.monotonic()
        with self.assertRaises(subprocess.TimeoutExpired):
            run_command([sys.executable, "-c", wrapper], capture_output=True, timeout=0.5)
        self.assertLess(time.monotonic() - started, 5)

    def test_completed_launcher_does_not_wait_for_inherited_pipe(self):
        # The fixture child exits by itself after a short bounded interval.
        wrapper = "import subprocess,sys; subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(2)']); print('done')"
        started = time.monotonic()
        result = run_command([sys.executable, "-c", wrapper], capture_output=True, text=True, timeout=1)
        self.assertEqual(result.stdout, "done\n")
        self.assertLess(time.monotonic() - started, 1.5)


if __name__ == "__main__":
    unittest.main()
