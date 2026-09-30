"""Bound local command deadlines, including Windows CLI wrapper descendants."""

import os
import signal
import subprocess
import tempfile


def run_command(arguments, *, timeout=None, capture_output=False, input=None, check=False, **kwargs):
    # Files avoid waiting forever for EOF when a CLI plugin inherits stdout and
    # outlives its launcher. All temporary output is closed on return/failure.
    with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
        if capture_output:
            if "stdout" in kwargs or "stderr" in kwargs:
                raise ValueError("capture_output conflicts with stdout/stderr")
            kwargs.update(stdout=output, stderr=errors)
        if input is not None:
            if "stdin" in kwargs:
                raise ValueError("input conflicts with stdin")
            kwargs["stdin"] = subprocess.PIPE
        if os.name == "nt":
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            kwargs["start_new_session"] = True
        process = subprocess.Popen(arguments, **kwargs)
        try:
            process.communicate(input=input, timeout=timeout)
        except BaseException:
            # Stop only descendants of the command launched here. Never signal
            # a shared Docker daemon, WSL distribution, or existing app process.
            try:
                if os.name == "nt" and process.poll() is None:
                    subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
                elif os.name != "nt":
                    os.killpg(process.pid, signal.SIGKILL)
            except (OSError, subprocess.TimeoutExpired):
                pass
            if process.poll() is None:
                process.kill()
            process.wait(timeout=5)
            raise
        finally:
            if process.stdin is not None:
                process.stdin.close()
        stdout = stderr = None
        if capture_output:
            output.seek(0)
            errors.seek(0)
            stdout, stderr = output.read(), errors.read()
            if kwargs.get("text") or kwargs.get("encoding") or kwargs.get("universal_newlines"):
                encoding = kwargs.get("encoding") or "utf-8"
                error_mode = kwargs.get("errors") or "replace"
                stdout = stdout.decode(encoding, errors=error_mode).replace("\r\n", "\n")
                stderr = stderr.decode(encoding, errors=error_mode).replace("\r\n", "\n")
        result = subprocess.CompletedProcess(arguments, process.returncode, stdout, stderr)
        if check:
            result.check_returncode()
        return result
