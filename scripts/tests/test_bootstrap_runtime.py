import subprocess
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bootstrap_runtime import wait_for_postgres


class PostgresReadinessTest(unittest.TestCase):
    def setUp(self):
        self.now = 0

    def sleep(self, seconds):
        self.now += seconds

    def check(self, run, timeout=3):
        wait_for_postgres(timeout, run, lambda: self.now, self.sleep)

    def test_retries_recovering_database_until_a_real_query_succeeds(self):
        run = Mock(side_effect=[subprocess.CompletedProcess([], 2, b''),
                                subprocess.CompletedProcess([], 0, b'1\n')])
        self.check(run)
        self.assertEqual(run.call_count, 2)
        self.assertEqual(run.call_args.args[0][-2:],
                         ['-c', "SELECT 1 WHERE current_setting('listen_addresses') <> ''"])

    def test_temporary_init_server_and_shutdown_do_not_release_migration(self):
        run = Mock(side_effect=[subprocess.CompletedProcess([], 0, b''),
                                subprocess.CompletedProcess([], 2, b''),
                                subprocess.CompletedProcess([], 0, b'1\n')])
        self.check(run)
        self.assertEqual(run.call_count, 3)
        self.assertEqual(self.now, 2)

    def test_missing_query_result_cannot_satisfy_readiness(self):
        run = Mock(return_value=subprocess.CompletedProcess([], 0, b''))
        with self.assertRaisesRegex(RuntimeError, 'migration was not attempted'):
            self.check(run)
        self.assertEqual(self.now, 3)

    def test_hung_docker_queries_are_bounded_and_never_report_ready(self):
        run = Mock(side_effect=subprocess.TimeoutExpired('docker', 1))
        with self.assertRaisesRegex(RuntimeError, 'startup deadline'):
            self.check(run)
        self.assertTrue(all(call.kwargs['timeout'] <= 3 for call in run.call_args_list))


if __name__ == '__main__':
    unittest.main()
