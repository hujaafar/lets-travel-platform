"""Load gate failures must not be hidden by averages, grace periods or logs."""
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
spec = importlib.util.spec_from_file_location('load_check', Path(__file__).resolve().parents[1] / 'verify-load.py')
load = importlib.util.module_from_spec(spec)
spec.loader.exec_module(load)


class LoadGateTest(unittest.TestCase):
    def rows(self):
        return [{'path': p, 'started': 12, 'elapsed_ms': 100, 'ok': True}
                for p in load.PATHS for _ in range(20)]

    def test_all_paths_need_steady_successful_samples(self):
        rows = self.rows()
        self.assertTrue(load.summarize(rows, 20, 10, 1000)['passed'])
        rows[-1]['ok'] = False
        self.assertFalse(load.summarize(rows, 20, 10, 1000)['passed'])
        self.assertFalse(load.summarize(rows[:20], 20, 10, 1000)['passed'])
        self.assertFalse(load.summarize([], 20, 10, 1000)['passed'])

    def test_early_failures_are_reported_but_late_failures_fail_the_gate(self):
        rows = self.rows() + [{'path': load.PATHS[0], 'started': 1, 'elapsed_ms': 8000, 'ok': False}]
        report = load.summarize(rows, 20, 10, 1000)
        self.assertTrue(report['passed'])
        self.assertEqual(report['paths'][load.PATHS[0]]['failures'], 1)
        self.assertFalse(load.summarize(rows, 20, 0, 1000)['passed'])

    def test_slow_responses_fail_even_when_http_succeeds(self):
        rows = self.rows()
        for row in rows:
            row['elapsed_ms'] = 5000
        self.assertFalse(load.summarize(rows, 20, 10, 1000)['passed'])

    def test_opt_in_is_required_before_docker_contact(self):
        with patch.object(load, 'running_replicas') as replicas, patch('builtins.print'):
            load.run(SimpleNamespace(run_load=False))
        replicas.assert_not_called()

    def test_distribution_requires_matching_successful_request_and_path(self):
        samples = [{'request_id': 'load1', 'path': '/api/travels', 'ok': True}]
        logs = '\n'.join([
            '{"requestId":"load1","message":"request method=GET path=/api/travels status=200 durationMs=1"}',
            '{"requestId":"other","message":"request method=GET path=/api/travels status=200 durationMs=1"}',
            '{"requestId":"load1","message":"request method=GET path=/api/travels status=503 durationMs=1"}',
        ])
        with patch.object(load, 'docker', return_value=logs):
            self.assertEqual(load.replica_distribution({'travel': ['a']}, samples, 'now'), {'travel': {'a': 1}})
