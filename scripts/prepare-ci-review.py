"""Create the public, immutable Git archive consumed by Jenkinsfile.review."""
import hashlib
from pathlib import Path
from process_runtime import run_command

ROOT = Path(__file__).resolve().parents[1]
destination = ROOT / "work" / "ci-review"
if run_command(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True,
               text=True, check=True, timeout=15).stdout.strip():
    raise SystemExit("Commit the intended review revision before creating its CI archive.")
revision = run_command(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True,
                       text=True, check=True, timeout=15).stdout.strip()
destination.mkdir(parents=True, exist_ok=True)
archive = destination / "source.tar"
run_command(["git", "archive", "--format=tar", "--output=" + str(archive), "HEAD"],
            cwd=ROOT, check=True, timeout=30)
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(destination / "source.sha256").write_text(digest + "  source.tar\n", encoding="ascii")
(destination / "revision.txt").write_text(revision + "\n", encoding="ascii")
print("Prepared committed source " + revision + " in work/ci-review (no working files or secrets).")
