#!/usr/bin/env python3
"""HandyOS-only outbound auto-release gate. Fail closed, no credentials, no writes in --check."""
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.request

REPO = pathlib.Path("/home/ubuntu/HandyOS")
STATE = pathlib.Path("/home/ubuntu/.local/state/handyos/deployed-sha")
API = "https://api.github.com/repos/buithinh2000/HandyOS/actions/runs"
ALLOWED = {
    "HandyOS single-package build (NO DEPLOY)",
    "HandyOS backend source checks",
    "HandyOS PostgreSQL Integration",
    "HandyOS Workspace smoke tests",
}
BUILD = "HandyOS single-package build (NO DEPLOY)"


def git(*args):
    return subprocess.check_output(["git", "-C", str(REPO), *args], text=True, timeout=20).strip()


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("--check", "--deploy"):
        raise ValueError("usage: poll-release.py --check|--deploy")
    target = git("ls-remote", "origin", "refs/heads/main").split()[0]
    if not re.fullmatch(r"[0-9a-f]{40}", target):
        raise ValueError("BLOCKED: invalid main SHA")
    # Fetch metadata only; never merge or rebuild until CI and scope checks pass.
    git("fetch", "--no-tags", "origin", "main")
    if git("rev-parse", "FETCH_HEAD") != target:
        raise ValueError("BLOCKED: main changed during preflight")
    base = git("rev-parse", "HEAD")
    subprocess.run(["git", "-C", str(REPO), "merge-base", "--is-ancestor", base, target],
                   check=True, timeout=15)
    changed = git("diff", "--name-only", base, target).splitlines()
    if any(p.startswith(("backend/migrations/", "cloud/", "deploy/internal/private/"))
           or p == "deploy/internal/compose.yaml" for p in changed):
        print("BLOCKED: migration or infrastructure change requires manual release review")
        return 0
    request = urllib.request.Request(
        API + "?head_sha=" + target + "&per_page=100",
        headers={"Accept": "application/vnd.github+json", "User-Agent": "HandyOS-release-gate"},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        data = json.load(response)
    runs = [r for r in data.get("workflow_runs", [])
            if r.get("head_sha") == target
            and r.get("event") == "push"
            and r.get("name") in ALLOWED]
    build = [r for r in runs if r.get("name") == BUILD]
    if not build or any(r.get("status") != "completed" or r.get("conclusion") != "success" for r in runs):
        print("BLOCKED: build CI missing, other CI pending or failed")
        return 0
    if (not any(r.get("conclusion") == "success" for r in build)):
        print("BLOCKED: successful build CI missing")
        return 0
    if STATE.exists() and STATE.read_text().strip() == target:
        print("NO_CHANGE: verified release marker matches GitHub main")
        return 0
    print("ELIGIBLE: verified main SHA " + target[:12], flush=True)
    if sys.argv[1] == "--check":
        return 0
    # No secret is stored or transmitted. Existing release script re-verifies exact SHA.
    subprocess.run(["bash", str(REPO / "deploy/internal/release-app.sh"), target],
                   cwd=REPO, check=True, timeout=870)
    STATE.parent.mkdir(parents=True, exist_ok=True)
    temp = STATE.with_suffix(".tmp")
    temp.write_text(target + "\n")
    os.replace(temp, STATE)
    print("HANDYOS_OUTBOUND_RELEASE_PASS " + target[:12])
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print("HANDYOS_OUTBOUND_RELEASE_BLOCKED: " + type(exc).__name__)
        sys.exit(1)
