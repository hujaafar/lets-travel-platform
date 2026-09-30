"""Redeployment verification cannot contact a workstation or hide data loss."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
spec = importlib.util.spec_from_file_location('redeploy', Path(__file__).resolve().parents[1] / 'verify-redeploy.py')
redeploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(redeploy)


class RedeployTest(unittest.TestCase):
    def test_workstation_is_rejected_before_docker_contact(self):
        with patch.dict(redeploy.os.environ, {}, clear=True), patch.object(redeploy, 'docker') as docker:
            with self.assertRaises(redeploy.VerificationError):
                redeploy.run(SimpleNamespace())
        docker.assert_not_called()

    def test_snapshots_contain_only_digests(self):
        with patch.object(redeploy, 'docker', return_value=('private fixture\n' * len(redeploy.TABLES))):
            result = redeploy.fingerprints()
        self.assertEqual(set(result), set(redeploy.TABLES))
        self.assertTrue(all(len(value) == 32 for value in result.values()))
        self.assertNotIn('private fixture', str(result))

    def test_changed_data_fails_even_if_session_survives(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / 'report.json'
            args = SimpleNamespace(report=str(report), inventory='test-inventory')
            original = dict.fromkeys(redeploy.TABLES, b'original')
            changed = {**original, 'identity.users': b'changed'}
            with (
                patch.dict(redeploy.os.environ, {'GITHUB_ACTIONS': 'true', 'RUNNER_ENVIRONMENT': 'github-hosted'}),
                patch.object(redeploy, 'fingerprints', side_effect=[original, changed]),
                patch.object(redeploy, 'AuthenticatedProbe') as probe,
                patch.object(redeploy.subprocess, 'run', return_value=SimpleNamespace(returncode=0)),
            ):
                probe.return_value.__enter__.return_value.read.return_value = {'ok': True}
                with self.assertRaises(redeploy.VerificationError):
                    redeploy.run(args)
            result = json.loads(report.read_text())
            self.assertFalse(result['passed'])
            self.assertFalse(result['tables_preserved']['identity.users'])
            self.assertNotIn('original', report.read_text())
