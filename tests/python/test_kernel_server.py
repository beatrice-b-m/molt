"""
Tests for src-tauri/resources/kernel_server.py.

Spawns the server as a subprocess and communicates via newline-delimited JSON
on stdin/stdout.  Each test is independent; the `kernel` fixture provides a
fresh process so state cannot leak between tests.
"""

import json
import subprocess
import sys
import uuid
from pathlib import Path

import pytest

KERNEL_PATH = Path(__file__).parent.parent.parent / "src-tauri" / "resources" / "kernel_server.py"

# Seconds to wait for a single response line.  Generous enough for slow CI,
# tight enough to surface hangs quickly.
READ_TIMEOUT = 10


class KernelClient:
    """Thin wrapper around a kernel_server subprocess."""

    def __init__(self, proc: subprocess.Popen):
        self._proc = proc

    def send(self, request: dict) -> dict:
        """Write *request* as a JSON line and block until a response line arrives."""
        line = json.dumps(request) + "\n"
        self._proc.stdin.write(line.encode())
        self._proc.stdin.flush()

        raw = self._proc.stdout.readline()
        if not raw:
            raise RuntimeError("Kernel process closed stdout unexpectedly")
        return json.loads(raw.decode())

    def send_raw(self, text: str) -> dict:
        """Write arbitrary bytes (bypassing JSON encoding) — for malformed-input tests."""
        self._proc.stdin.write((text + "\n").encode())
        self._proc.stdin.flush()

        raw = self._proc.stdout.readline()
        if not raw:
            raise RuntimeError("Kernel process closed stdout unexpectedly")
        return json.loads(raw.decode())


@pytest.fixture
def kernel():
    """Spawn a fresh kernel_server process, yield a KernelClient, then kill it."""
    assert KERNEL_PATH.exists(), f"kernel_server.py not found at {KERNEL_PATH}"

    proc = subprocess.Popen(
        [sys.executable, str(KERNEL_PATH)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        # Collect stderr separately so Python startup warnings don't corrupt
        # the stdout JSON stream.  We don't assert on stderr here.
        stderr=subprocess.PIPE,
    )

    client = KernelClient(proc)

    # Apply a timeout at the socket level so individual reads cannot block
    # forever if the server stalls.
    proc.stdout._timeout = READ_TIMEOUT  # type: ignore[attr-defined]

    yield client

    proc.kill()
    proc.wait()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _req(req_type: str, code: str = "") -> dict:
    return {"id": str(uuid.uuid4()), "type": req_type, "code": code}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_ping(kernel):
    req = _req("ping")
    resp = kernel.send(req)

    assert resp["id"] == req["id"]
    assert resp["type"] == "result"
    assert resp["stdout"] == "pong"
    assert resp["error"] is None


def test_execute_simple(kernel):
    req = _req("execute", "print('hello')")
    resp = kernel.send(req)

    assert resp["id"] == req["id"]
    assert resp["stdout"] == "hello\n"
    assert resp["error"] is None


def test_execute_expression(kernel):
    """State persists across successive execute requests within the same kernel."""
    kernel.send(_req("execute", "x = 42"))
    resp = kernel.send(_req("execute", "print(x)"))

    assert resp["stdout"] == "42\n"
    assert resp["error"] is None


def test_execute_error(kernel):
    resp = kernel.send(_req("execute", "1/0"))

    assert resp["error"] is not None
    assert "ZeroDivisionError" in resp["error"]
    # stdout/stderr must still be present (possibly empty)
    assert "stdout" in resp
    assert "stderr" in resp


def test_execute_stderr(kernel):
    resp = kernel.send(_req("execute", "import sys; sys.stderr.write('warn')"))

    assert resp["stderr"] == "warn"
    assert resp["error"] is None


def test_restart(kernel):
    """After a restart the previous namespace is wiped; references raise NameError."""
    kernel.send(_req("execute", "y = 99"))
    kernel.send(_req("restart"))
    resp = kernel.send(_req("execute", "print(y)"))

    assert resp["error"] is not None
    assert "NameError" in resp["error"]


def test_unknown_type(kernel):
    req = {"id": str(uuid.uuid4()), "type": "unknown", "code": ""}
    resp = kernel.send(req)

    assert resp["id"] == req["id"]
    assert resp["error"] is not None
    assert "Unknown request type" in resp["error"]


def test_invalid_json(kernel):
    resp = kernel.send_raw("not valid json {{{{")

    # id will be empty string (server default for unparseable input)
    assert resp["type"] == "result"
    assert resp["error"] is not None
    assert "Invalid JSON" in resp["error"]
