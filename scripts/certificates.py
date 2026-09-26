"""Development PKI with standard X.509 extensions and a complete JVM trust store."""

from pathlib import Path
import datetime as dt
import ipaddress
import os
import shutil
import subprocess
from cryptography import x509
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12


def generate(directory: Path, password: str):
    now = dt.datetime.now(dt.timezone.utc)
    key_path = directory / "ca.key"
    if key_path.exists():
        ca_key = serialization.load_pem_private_key(key_path.read_bytes(), None)
    else:
        ca_key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
        key_path.write_bytes(
            ca_key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            )
        )
    ca_path = directory / "ca.crt"
    ca = (
        x509.load_pem_x509_certificate(ca_path.read_bytes())
        if ca_path.exists()
        else None
    )
    renew = ca is None or ca.not_valid_after_utc < now + dt.timedelta(days=30)
    if ca is not None:
        try:
            ca.extensions.get_extension_for_class(x509.KeyUsage)
        except x509.ExtensionNotFound:
            renew = True
    if renew:
        name = x509.Name(
            [x509.NameAttribute(NameOID.COMMON_NAME, "Travel Plan Development CA")]
        )
        ca = (
            x509.CertificateBuilder()
            .subject_name(name)
            .issuer_name(name)
            .public_key(ca_key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - dt.timedelta(minutes=5))
            .not_valid_after(now + dt.timedelta(days=365))
            .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
            .add_extension(
                x509.KeyUsage(True, False, False, False, False, True, True, None, None),
                critical=True,
            )
            .add_extension(
                x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()),
                critical=False,
            )
            .add_extension(
                x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()),
                critical=False,
            )
            .sign(ca_key, hashes.SHA256())
        )
        ca_path.write_bytes(ca.public_bytes(serialization.Encoding.PEM))
    keytool = shutil.which("keytool")
    if not keytool:
        candidate = (
            Path(os.environ.get("JAVA_HOME", r"C:\Program Files\Java\jdk-17"))
            / "bin"
            / ("keytool.exe" if os.name == "nt" else "keytool")
        )
        if candidate.exists():
            keytool = str(candidate)
    if not keytool:
        raise SystemExit("Install JDK 17 or newer and put keytool on PATH.")
    java_home = Path(keytool).resolve().parent.parent
    cacerts = java_home / "lib" / "security" / "cacerts"
    for service in [
        "identity",
        "travel",
        "payments",
        "postgres",
        "neo4j",
        "vault",
        "dashboard",
        "jenkins",
        "tools",
        "loki",
        "sonarqube",
    ]:
        folder = directory / "certs" / service
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "ca.crt").write_bytes(ca.public_bytes(serialization.Encoding.PEM))
        leaf_path = folder / "tls.crt"
        leaf = (
            x509.load_pem_x509_certificate(leaf_path.read_bytes())
            if leaf_path.exists()
            else None
        )
        if (
            renew
            or leaf is None
            or leaf.not_valid_after_utc < now + dt.timedelta(days=14)
        ):
            key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
            leaf = (
                x509.CertificateBuilder()
                .subject_name(
                    x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, service)])
                )
                .issuer_name(ca.subject)
                .public_key(key.public_key())
                .serial_number(x509.random_serial_number())
                .not_valid_before(now - dt.timedelta(minutes=5))
                .not_valid_after(now + dt.timedelta(days=90))
                .add_extension(
                    x509.BasicConstraints(ca=False, path_length=None), critical=True
                )
                .add_extension(
                    x509.KeyUsage(
                        True, False, True, False, False, False, False, None, None
                    ),
                    critical=True,
                )
                .add_extension(
                    x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]),
                    critical=False,
                )
                .add_extension(
                    x509.SubjectKeyIdentifier.from_public_key(key.public_key()),
                    critical=False,
                )
                .add_extension(
                    x509.AuthorityKeyIdentifier.from_issuer_public_key(
                        ca_key.public_key()
                    ),
                    critical=False,
                )
                .add_extension(
                    x509.SubjectAlternativeName(
                        [
                            x509.DNSName(service),
                            x509.DNSName(
                                "sonar-db" if service == "postgres" else service
                            ),
                            x509.DNSName("localhost"),
                            x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
                        ]
                    ),
                    critical=False,
                )
                .sign(ca_key, hashes.SHA256())
            )
            (folder / "tls.key").write_bytes(
                key.private_bytes(
                    serialization.Encoding.PEM,
                    serialization.PrivateFormat.PKCS8,
                    serialization.NoEncryption(),
                )
            )
            leaf_path.write_bytes(leaf.public_bytes(serialization.Encoding.PEM))
            (folder / (service + ".p12")).write_bytes(
                pkcs12.serialize_key_and_certificates(
                    service.encode(),
                    key,
                    leaf,
                    [ca],
                    serialization.BestAvailableEncryption(password.encode()),
                )
            )
        trust = folder / "truststore.p12"
        if (
            renew
            or not trust.exists()
            or not (folder / ".public-roots-included").exists()
        ):
            # Copy the JDK public roots, then add the development CA. No external trust is lost.
            if cacerts.exists():
                shutil.copyfile(cacerts, trust)
            elif trust.exists():
                trust.unlink()
            subprocess.run(
                [
                    keytool,
                    "-importcert",
                    "-noprompt",
                    "-alias",
                    "travelplan-ca",
                    "-file",
                    str(ca_path),
                    "-keystore",
                    str(trust),
                    "-storepass",
                    "changeit",
                ],
                check=True,
                capture_output=True,
            )
            (folder / ".public-roots-included").write_text("1")

    provisioning = directory / "grafana" / "datasources"
    provisioning.mkdir(parents=True, exist_ok=True)
    public_ca = "".join(
        "        " + line + "\n" for line in ca_path.read_text().splitlines()
    )
    (provisioning / "loki.yml").write_text(
        "apiVersion: 1\ndatasources:\n  - name: Travel Plan logs\n    type: loki\n    access: proxy\n    url: https://loki:3100\n    isDefault: true\n    editable: false\n    jsonData:\n      tlsAuthWithCACert: true\n    secureJsonData:\n      tlsCACert: |\n"
        + public_ca,
        newline="\n",
    )
