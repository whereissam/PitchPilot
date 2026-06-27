#!/usr/bin/env python3
"""PitchPilot demo preflight — checks the system plumbing the demo depends on.

This does NOT test "AI quality". It answers one question: will the demo path
survive? Run it before every demo, then run the manual 5x voice rehearsal in
docs/demo-rehearsal.md (the part that can't be automated cheaply).

    python scripts/stability_check.py

Exit 0 = preflight stable. Exit 1 = something on the critical path is broken.
Warnings (yellow) never fail the run — they flag things that degrade the demo
to a fallback (e.g. scoring returns a dummy 0/100) without breaking it.
"""
import os
import subprocess
import sys
from pathlib import Path
from urllib.request import urlopen

WEB_URL = os.getenv("PITCHPILOT_WEB_URL", "http://localhost:3000")

# Repo root = parent of this scripts/ dir, so the harness works from any cwd.
ROOT = Path(__file__).resolve().parent.parent

checks = []


def _load_env_file(path):
    """Minimal .env loader (no python-dotenv dependency). Real shell env always
    wins — we only fill in keys the current process doesn't already have."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = val.strip().strip('"').strip("'")


def _load_project_env():
    # The demo reads env from these files; load them so a fresh shell sees the
    # same config the app does. agent/.env is the superset (adds OPENAI_API_KEY).
    _load_env_file(ROOT / "agent" / ".env")
    _load_env_file(ROOT / "web" / ".env")


def _agent_python():
    """The agent's venv interpreter (where openai/livekit are installed), so the
    scoring/feedback checks test the same Python the agent actually runs on."""
    venv = ROOT / "agent" / ".venv" / "bin" / "python"
    return str(venv) if venv.exists() else sys.executable


def check(name):
    def deco(fn):
        checks.append((name, fn))
        return fn

    return deco


def ok(msg=""):
    return "ok", msg


def warn(msg):
    return "warn", msg


def fail(msg):
    return "fail", msg


@check("required env vars")
def check_env():
    required = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]
    missing = [k for k in required if not os.getenv(k)]
    if missing:
        return fail("missing: " + ", ".join(missing))
    return ok("LiveKit env present")


@check("openai key (scoring)")
def check_openai_key():
    # Soft: score_pitch falls back to a 0/100 "not scored" card without this, so
    # the demo survives but the scorecard is a dud. Worth knowing before you pitch.
    if not os.getenv("OPENAI_API_KEY"):
        return warn("OPENAI_API_KEY unset — scoring will return a dummy 0/100 card")
    return ok("OPENAI_API_KEY present")


@check("web server responds")
def check_web():
    try:
        with urlopen(WEB_URL, timeout=3) as r:
            if r.status < 400:
                return ok(f"{WEB_URL} status {r.status}")
            return fail(f"{WEB_URL} status {r.status}")
    except Exception as e:
        return fail(f"{WEB_URL}: {e} (is `npm run dev` up in web/?)")


@check("token endpoint works")
def check_token():
    url = WEB_URL.rstrip("/") + "/api/token"
    try:
        with urlopen(url, timeout=5) as r:
            body = r.read().decode("utf-8")
            if r.status >= 400:
                return fail(f"status {r.status}: {body[:120]}")
            if '"token"' not in body and "accessToken" not in body:
                return fail(f"no token in response: {body[:120]}")
            return ok("token returned")
    except Exception as e:
        return fail(str(e))


@check("agent scoring fixture works")
def check_scoring():
    agent_dir = ROOT / "agent"
    if not agent_dir.exists():
        return fail("agent/ not found")
    code = (
        "from scoring import score_pitch\n"
        "card = score_pitch('We built a realtime voice judge with a rubric and a "
        "before/after benchmark. Score me.')\n"
        "assert hasattr(card, 'total'), 'no total on scorecard'\n"
        "print('total', card.total)\n"
    )
    return _run_py(agent_dir, code, "score_pitch")


@check("agent feedback fixture works")
def check_feedback():
    agent_dir = ROOT / "agent"
    if not (agent_dir / "feedback.py").exists():
        return warn("feedback.py not found — feedback is optional, skipping")
    # write_feedback is best-effort: returns None (not an exception) without an
    # OpenAI key, so we only assert the module imports and the call path runs.
    code = (
        "from scoring import score_pitch\n"
        "from feedback import write_feedback\n"
        "card = score_pitch('test pitch')\n"
        "fb = write_feedback('test pitch', card)\n"
        "print('feedback', 'present' if fb else 'skipped (None)')\n"
    )
    status, msg = _run_py(agent_dir, code, "write_feedback")
    # An import/code error is a real fail; a None result is an expected skip.
    return (status, msg)


@check("data directory writable")
def check_data_writable():
    # Pitches save under <web cwd>/data/pitches, i.e. web/data/pitches from root.
    data_dir = ROOT / "web" / "data" / "pitches"
    try:
        data_dir.mkdir(parents=True, exist_ok=True)
        probe = data_dir / ".stability-write-test"
        probe.write_text("ok")
        probe.unlink()
        return ok(str(data_dir.relative_to(ROOT)))
    except Exception as e:
        return fail(str(e))


def _run_py(cwd, code, label):
    try:
        result = subprocess.run(
            [_agent_python(), "-c", code],
            cwd=cwd,
            env=os.environ.copy(),
            capture_output=True,
            text=True,
            timeout=30,
        )
    except subprocess.TimeoutExpired:
        return fail(f"{label} timed out")
    except Exception as e:
        return fail(str(e))
    if result.returncode != 0:
        return fail((result.stderr.strip() or result.stdout.strip())[:300])
    return ok(result.stdout.strip().splitlines()[-1] if result.stdout.strip() else f"{label} ran")


ICON = {"ok": "✅", "warn": "⚠️ ", "fail": "❌"}


def main():
    _load_project_env()
    print("PitchPilot stability check\n")
    print(f"  web url: {WEB_URL}\n")
    passed = warned = failed = 0
    for name, fn in checks:
        try:
            status, msg = fn()
        except Exception as e:  # a check itself should never crash the harness
            status, msg = "fail", f"check raised: {e}"
        if status == "ok":
            passed += 1
        elif status == "warn":
            warned += 1
        else:
            failed += 1
        print(f"{ICON[status]} {name}: {msg}")

    total = passed + warned + failed
    print(f"\nResult: {passed}/{total} ok, {warned} warn, {failed} fail")
    if failed:
        print("\nNot demo-stable. Fix the failed checks before adding features.")
        sys.exit(1)
    if warned:
        print("\nPreflight passes with warnings — read them, then run the 5x voice rehearsal")
        print("(docs/demo-rehearsal.md).")
        sys.exit(0)
    print("\nPreflight stable. Now run the 5x voice rehearsal (docs/demo-rehearsal.md).")
    sys.exit(0)


if __name__ == "__main__":
    main()
