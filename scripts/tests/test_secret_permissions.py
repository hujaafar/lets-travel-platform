"""Permission checks use temporary fixtures only; bootstrap is never imported."""

import importlib
import os
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import secret_permissions


class ImportSafetyTest(unittest.TestCase):
    def test_import_does_not_change_process_or_files(self):
        with (
            patch("os.umask") as umask,
            patch.object(Path, "mkdir") as mkdir,
            patch.object(Path, "chmod") as chmod,
        ):
            importlib.reload(secret_permissions)
        umask.assert_not_called()
        mkdir.assert_not_called()
        chmod.assert_not_called()


@unittest.skipUnless(os.name == "posix", "POSIX filesystem modes required")
class SecretPermissionsTest(unittest.TestCase):
    def setUp(self):
        self.original_umask = os.umask(0o022)
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.directory = self.root / ".secrets"
        self.environment_file = self.root / ".env"

    def tearDown(self):
        os.umask(self.original_umask)
        self.temporary.cleanup()

    def mode(self, path):
        return stat.S_IMODE(path.stat().st_mode)

    def test_existing_and_new_operator_secrets_are_private(self):
        self.directory.mkdir(mode=0o755)
        for name in ("bootstrap.json", "admin-login.txt", "vault-init.json", "ca.key"):
            (self.directory / name).write_text("fixture")
        self.environment_file.write_text("fixture")

        secret_permissions.prepare_secret_storage(self.directory, self.environment_file)

        self.assertEqual(self.mode(self.directory), 0o700)
        for name in ("bootstrap.json", "admin-login.txt", "vault-init.json", "ca.key"):
            self.assertEqual(self.mode(self.directory / name), 0o600)
        self.assertEqual(self.mode(self.environment_file), 0o600)
        created = self.directory / "new-secret.json"
        created.write_text("fixture")
        self.assertEqual(self.mode(created), 0o600)

    def test_fresh_storage_is_private_before_any_secret_is_written(self):
        secret_permissions.prepare_secret_storage(self.directory, self.environment_file)
        self.assertEqual(self.mode(self.directory), 0o700)
        self.environment_file.write_text("fixture")
        self.assertEqual(self.mode(self.environment_file), 0o600)

    def test_scoped_container_exports_remain_readable_behind_private_parent(self):
        secret_permissions.prepare_secret_storage(self.directory, self.environment_file)
        for name in ("bootstrap.json", "vault-init.json", "ca.key"):
            (self.directory / name).write_text("fixture")
        exports = [
            self.directory / "certs" / "identity" / "identity.p12",
            self.directory / "certs" / "neo4j" / "tls.key",
            self.directory / "approle" / "identity" / "secret-id",
            self.directory / "grafana" / "datasources" / "loki.yml",
            self.directory / "000-roles.sql",
            self.directory / "ca.crt",
        ]
        for export in exports:
            export.parent.mkdir(parents=True, exist_ok=True)
            export.write_text("fixture")

        secret_permissions.publish_runtime_exports(self.directory)

        self.assertEqual(self.mode(self.directory), 0o700)
        for export in exports:
            self.assertEqual(self.mode(export), 0o644)
            if export.parent != self.directory:
                self.assertEqual(self.mode(export.parent), 0o755)
        for name in ("bootstrap.json", "vault-init.json", "ca.key"):
            self.assertEqual(self.mode(self.directory / name), 0o600)

    def test_symlink_storage_cannot_change_an_unrelated_directory(self):
        unrelated = self.root / "unrelated"
        unrelated.mkdir(mode=0o755)
        self.directory.symlink_to(unrelated, target_is_directory=True)
        with self.assertRaises(ValueError):
            secret_permissions.prepare_secret_storage(self.directory, self.environment_file)
        self.assertEqual(self.mode(unrelated), 0o755)

    def test_symlink_runtime_export_cannot_change_an_unrelated_file(self):
        secret_permissions.prepare_secret_storage(self.directory, self.environment_file)
        unrelated = self.root / "unrelated-key"
        unrelated.write_text("fixture")
        export = self.directory / "certs" / "identity"
        export.mkdir(parents=True)
        (export / "tls.key").symlink_to(unrelated)
        with self.assertRaises(ValueError):
            secret_permissions.publish_runtime_exports(self.directory)
        self.assertEqual(self.mode(unrelated), 0o600)


if __name__ == "__main__":
    unittest.main()
