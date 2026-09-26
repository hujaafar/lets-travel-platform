"""Protect host provisioning secrets while retaining scoped container access.

Importing this module has no filesystem, process, or Docker side effects.
Windows keeps the existing user-profile ACL; only POSIX modes are changed.
"""

import os
from pathlib import Path


def _reject_symlink(path: Path) -> None:
    if path.is_symlink():
        raise ValueError("Secret storage and exports must not use symbolic links")


def prepare_secret_storage(directory: Path, environment_file: Path) -> None:
    """Set a private process umask before creating or rewriting any secrets.

    The caller intentionally retains umask 077 for the bootstrap process.
    Existing top-level provisioning files are tightened before being read or
    rewritten; scoped runtime exports are published separately after generation.
    """
    if os.name != "posix":
        directory.mkdir(exist_ok=True)
        return

    _reject_symlink(directory)
    _reject_symlink(environment_file)
    os.umask(0o077)
    directory.mkdir(mode=0o700, exist_ok=True)
    directory.chmod(0o700)
    for entry in directory.iterdir():
        _reject_symlink(entry)
        if entry.is_file():
            entry.chmod(0o600)
    if environment_file.exists():
        environment_file.chmod(0o600)


def publish_runtime_exports(directory: Path) -> None:
    """Allow non-root containers to read only their explicitly mounted exports.

    Docker mounts service certificate/AppRole directories, PostgreSQL's init
    script, and Grafana provisioning directly. These need readable modes inside
    their containers. The containing host .secrets directory remains 0700;
    operator credentials, the Vault root token and CA private key stay 0600.
    """
    if os.name != "posix":
        return

    _reject_symlink(directory)
    directory.chmod(0o700)

    def publish_tree(root: Path) -> None:
        _reject_symlink(root)
        if not root.exists():
            return
        root.chmod(0o755)
        for entry in root.iterdir():
            _reject_symlink(entry)
            if entry.is_dir():
                publish_tree(entry)
            elif entry.is_file():
                entry.chmod(0o644)

    for group in ("certs", "approle"):
        root = directory / group
        _reject_symlink(root)
        if root.exists():
            for service in root.iterdir():
                _reject_symlink(service)
                if service.is_dir():
                    publish_tree(service)

    publish_tree(directory / "grafana")
    for name in ("ca.crt", "000-roles.sql"):
        export = directory / name
        _reject_symlink(export)
        if export.exists():
            export.chmod(0o644)
