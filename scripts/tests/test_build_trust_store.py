"""Exercise the build CA importer with disposable JDK certificate fixtures."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


@unittest.skipUnless(all(shutil.which(tool) for tool in ("java", "javac", "keytool")), "JDK tools required")
class BuildTrustStoreTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory(prefix="travel-plan-build-trust-")
        cls.addClassCleanup(cls.directory.cleanup)
        cls.root = Path(cls.directory.name)
        assert cls.root.resolve().is_relative_to(Path(tempfile.gettempdir()).resolve())
        cls.password = "disposable-fixture-password"
        cls.base = cls.root / "base.p12"
        cls.certificate = cls.root / "root.pem"
        source = Path(__file__).resolve().parents[2] / "infra/BuildTrustStore.java"
        cls.invoke("javac", "-J-Xmx64m", "--release", "17", "-d", str(cls.root), str(source), check=True)
        cls.invoke("keytool", "-J-Xmx64m", "-genkeypair", "-alias", "fixture-root", "-keyalg", "RSA",
                   "-keysize", "2048", "-dname", "CN=Disposable Travel Plan Test CA", "-ext", "bc:c",
                   "-validity", "1", "-keystore", str(cls.root / "key.p12"),
                   "-storepass", cls.password, "-keypass", cls.password, check=True)
        cls.invoke("keytool", "-J-Xmx64m", "-exportcert", "-rfc", "-alias", "fixture-root",
                   "-keystore", str(cls.root / "key.p12"), "-storepass", cls.password,
                   "-file", str(cls.certificate), check=True)
        cls.invoke("keytool", "-J-Xmx64m", "-importcert", "-noprompt", "-alias", "fixture-root",
                   "-file", str(cls.certificate), "-keystore", str(cls.base), "-storepass", "changeit", check=True)

    @staticmethod
    def invoke(*arguments, check=False):
        return subprocess.run(arguments, capture_output=True, timeout=30, check=check)

    def import_bundle(self, bundle, output):
        return self.invoke("java", "-Xmx64m", "-cp", str(self.root), "BuildTrustStore",
                           str(self.base), str(bundle), str(output))

    def test_import_preserves_existing_roots_and_does_not_modify_base(self):
        original = self.base.read_bytes()
        output = self.root / "combined.p12"
        self.assertEqual(0, self.import_bundle(self.certificate, output).returncode)
        for alias in ("fixture-root", "build-root-0"):
            result = self.invoke("keytool", "-J-Xmx64m", "-list", "-alias", alias,
                                 "-keystore", str(output), "-storepass", "changeit")
            self.assertEqual(0, result.returncode, "Expected public root is missing")
        self.assertEqual(original, self.base.read_bytes())

    def test_invalid_or_empty_bundle_fails_without_creating_a_trust_store(self):
        original = self.base.read_bytes()
        for label, data in (("invalid", b"not a certificate"), ("empty", b"")):
            with self.subTest(bundle=label):
                bundle = self.root / (label + ".pem")
                bundle.write_bytes(data)
                output = self.root / (label + ".p12")
                self.assertNotEqual(0, self.import_bundle(bundle, output).returncode)
                self.assertFalse(output.exists())
        self.assertEqual(original, self.base.read_bytes())
