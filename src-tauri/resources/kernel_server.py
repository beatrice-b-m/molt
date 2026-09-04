#!/usr/bin/env python3
"""
Molt kernel server — a thin REPL server communicating via newline-delimited JSON
on stdin/stdout. Pure stdlib, no third-party imports.

Protocol:
  Request:  {"id": "<uuid>", "type": "execute"|"restart"|"ping", "code": "<string>"}
  Response: {"id": "<uuid>", "type": "result", "stdout": "...", "stderr": "...", "error": null|"...", "output_type": "text"}
"""

import ast
import io
import json
import signal
import sys
import traceback

# Persistent execution namespace (shared across cells within a tab)
_globals = {"__builtins__": __builtins__, "__name__": "__main__"}


def _handle_sigint(signum, frame):
    raise KeyboardInterrupt("Execution interrupted")


def execute_code(code):
    """Execute code in the persistent namespace, capturing stdout/stderr/errors.

    Jupyter-style: if the last statement is a bare expression, its value is
    printed (via repr) unless it is None.
    """
    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()

    old_stdin = sys.stdin
    old_stdout = sys.stdout
    old_stderr = sys.stderr

    error = None
    try:
        # stdin belongs to the JSON protocol, not interactive cell input.
        sys.stdin = io.StringIO()
        sys.stdout = stdout_capture
        sys.stderr = stderr_capture

        tree = ast.parse(code, "<cell>", "exec")

        # Split off the last statement if it is a bare expression,
        # so we can capture and display its value.
        last_expr = None
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            last_expr = tree.body.pop()

        # Execute preceding statements.
        if tree.body:
            exec(compile(tree, "<cell>", "exec"), _globals)

        # Evaluate the trailing expression and display if non-None.
        if last_expr is not None:
            expr_ast = ast.Expression(body=last_expr.value)
            ast.fix_missing_locations(expr_ast)
            result = eval(compile(expr_ast, "<cell>", "eval"), _globals)
            if result is not None:
                _globals["_"] = result
                print(repr(result))
    except KeyboardInterrupt:
        error = "KeyboardInterrupt: Execution interrupted"
    except BaseException:
        # SystemExit from user code is a cell error, not an app shutdown request.
        error = traceback.format_exc()
    finally:
        sys.stdin = old_stdin
        sys.stdout = old_stdout
        sys.stderr = old_stderr

    return {
        "stdout": stdout_capture.getvalue(),
        "stderr": stderr_capture.getvalue(),
        "error": error,
    }


def handle_request(request):
    """Process a single JSON request and return a response dict."""
    global _globals

    if not isinstance(request, dict):
        request = {}
    req_id = request.get("id", "")
    if not isinstance(req_id, str):
        req_id = ""
    req_type = request.get("type", "")

    if req_type == "execute":
        code = request.get("code", "")
        result = execute_code(code)
        return {
            "id": req_id,
            "type": "result",
            "stdout": result["stdout"],
            "stderr": result["stderr"],
            "error": result["error"],
            "output_type": "text",
        }
    elif req_type == "restart":
        _globals = {"__builtins__": __builtins__, "__name__": "__main__"}
        return {
            "id": req_id,
            "type": "result",
            "stdout": "",
            "stderr": "",
            "error": None,
            "output_type": "text",
        }
    elif req_type == "ping":
        return {
            "id": req_id,
            "type": "result",
            "stdout": "pong",
            "stderr": "",
            "error": None,
            "output_type": "text",
        }
    else:
        return {
            "id": req_id,
            "type": "result",
            "stdout": "",
            "stderr": "",
            "error": f"Unknown request type: {req_type}",
            "output_type": "text",
        }


def main():
    # Install SIGINT handler for interrupting execution
    signal.signal(signal.SIGINT, _handle_sigint)

    # Use raw stdin/stdout to avoid encoding issues
    # Read from stdin line by line, write responses to stdout
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            # Send error response for malformed JSON
            response = {
                "id": "",
                "type": "result",
                "stdout": "",
                "stderr": "",
                "error": f"Invalid JSON: {e}",
                "output_type": "text",
            }
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()
            continue

        response = handle_request(request)
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
