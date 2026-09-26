"""Bounded runtime readiness checks; importing never contacts Docker."""

import subprocess
import time
from process_runtime import run_command


def wait_for_postgres(timeout=90, run=run_command, clock=time.monotonic, sleep=time.sleep):
    deadline = clock() + timeout
    # The image's temporary initialization server accepts local SQL queries but
    # has no TCP listeners and shuts down before the final server starts.
    command = ["docker", "compose", "exec", "-T", "postgres", "psql", "-At",
               "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "travelplan", "-c",
               "SELECT 1 WHERE current_setting('listen_addresses') <> ''"]
    while clock() < deadline:
        try:
            result = run(command, capture_output=True, timeout=max(0.1, min(10, deadline-clock())))
            if result.returncode == 0 and result.stdout.strip() == b"1":
                return
        except subprocess.TimeoutExpired:
            pass
        remaining = deadline-clock()
        if remaining > 0:
            sleep(min(1, remaining))
    raise RuntimeError("PostgreSQL did not become query-ready within the startup deadline; migration was not attempted")
