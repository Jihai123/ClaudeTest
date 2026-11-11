#!/usr/bin/env python3
"""One-time, no-Codex installer for the existing Yiju PM2 service.

Run as the actual PM2 process owner, NOT root. --check is strictly read-only.
--install performs the same fail-closed preflight, pins a known reviewed poller,
checks its own configuration, runs the first deployment, then enables a cron job.
No SSH secrets, API credentials or .env values are ever printed.
"""
import argparse
import configparser
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import sqlite3
import subprocess
import sys
import tempfile

ORIGIN = "https://github.com/Jihai123/ClaudeTest.git"
BRANCH = "claude/livable-cities-ranking-0112UFYCzLLMXat6n8Tjc83c"
# Verified merge of PR #120: independent, immutable deployer source.
PINNED_RUNNER_SHA = "8e10e73a45bad72007cc3c9ab1a1b81d16d388c3"
CRON_MARKER = "# yiju-autodeploy managed"
CRON_SCHEDULE = "*/10 * * * *"


class Blocked(Exception):
    pass


def run(*args, cwd=None, timeout=60):
    try:
        p = subprocess.run(args, cwd=str(cwd) if cwd else None, capture_output=True,
                           text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise Blocked("Command failed to start safely: " + args[0]) from exc
    if p.returncode:
        # Output may contain environment details; do not copy it to chat or logs.
        raise Blocked("Command failed: " + args[0] + " " +
                      (" ".join(str(x) for x in args[1:3]))[:100])
    return p.stdout.strip()


def which(name):
    p = shutil.which(name)
    if not p:
        raise Blocked("Missing command in PATH: " + name)
    return p


def discover():
    if os.geteuid() == 0:
        raise Blocked("Refusing root; run as the existing PM2 service user.")
    for command in ("git", "node", "npm", "pm2", "crontab"):
        which(command)

    try:
        processes = json.loads(run("pm2", "jlist", timeout=30))
    except ValueError as exc:
        raise Blocked("PM2 process metadata unreadable") from exc
    candidates = [p for p in processes if p.get("name") == "yijucity"]
    if len(candidates) != 1:
        # Only allow a unique yiju-named application, never an arbitrary PM2 app.
        candidates = [p for p in processes if
                      re.fullmatch(r"yiju[-_a-zA-Z0-9]*", p.get("name", ""), re.I)]
    if len(candidates) != 1:
        raise Blocked("Cannot identify exactly one Yiju PM2 service; no changes made")
    proc = candidates[0]
    env = proc.get("pm2_env", {})
    name = proc["name"]
    if env.get("status") != "online":
        raise Blocked("PM2 service is not online")
    pm_path = env.get("pm_exec_path") or proc.get("pm_exec_path")
    cwd = env.get("pm_cwd")
    if not pm_path:
        raise Blocked("PM2 executable path unknown")
    script = Path(pm_path).resolve()
    if script.name != "server.js":
        raise Blocked("PM2 does not run the expected server.js")
    app = script.parent
    if cwd and Path(cwd).resolve() != app:
        raise Blocked("PM2 process cwd differs from server.js directory")
    if not (app / ".git").exists():
        raise Blocked("PM2 app is not a Git checkout")
    remotes = run("git", "-C", str(app), "remote", "get-url", "origin")
    if remotes not in (ORIGIN, ORIGIN[:-4],
                       "git@github.com:Jihai123/ClaudeTest.git",
                       "ssh://git@github.com/Jihai123/ClaudeTest.git"):
        raise Blocked("Git origin not approved")
    if run("git", "-C", str(app), "branch", "--show-current") != BRANCH:
        raise Blocked("Production is not on the exact expected branch")
    if run("git", "-C", str(app), "status", "--porcelain", "--untracked-files=no"):
        raise Blocked("Production tracked worktree contains local changes")

    # Prefer the *running PM2 process* environment to .env, never print values.
    db_setting = env.get("DB_PATH")
    if not db_setting and (app / ".env").is_file():
        for line in (app / ".env").read_text(encoding="utf8").splitlines():
            if line.strip().startswith("DB_PATH="):
                db_setting = line.split("=", 1)[1].strip().strip("'\"")
    db = Path(db_setting or str(app / "database.sqlite")).expanduser()
    if not db.is_absolute():
        db = app / db
    db = db.resolve()
    if not db.is_file() or db.stat().st_size < 4096:
        raise Blocked("Production SQLite file missing or unexpectedly small")
    conn = sqlite3.connect(db.as_uri() + "?mode=ro", uri=True)
    try:
        if conn.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise Blocked("Production SQLite quick_check failed")
        tables = conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
        if tables < 5:
            raise Blocked("Unexpected number of SQLite tables")
    finally:
        conn.close()
    # Check obvious capacity and prevent backup accidentally landing elsewhere.
    if shutil.disk_usage(Path.home()).free < max(512 * 1024 * 1024, db.stat().st_size * 3):
        raise Blocked("Insufficient free disk for safe backup and isolated tests")
    sha = run("git", "-C", str(app), "rev-parse", "HEAD")
    # Do not print DB path or PM2 environment, only non-secret facts.
    return {"app": app, "db": db, "pm2_name": name, "sha": sha,
            "table_count": tables}


def read_crontab():
    cron_read = subprocess.run(["crontab", "-l"], capture_output=True, text=True, timeout=20)
    if cron_read.returncode == 0:
        return cron_read.stdout
    if cron_read.returncode == 1 and "no crontab for" in cron_read.stderr.lower():
        return ""
    raise Blocked("Cannot inspect existing crontab; refusing to replace other jobs")


def bootstrap(info):
    home = Path.home()
    lib = home / ".local/lib/yiju-autodeploy"
    config_dir = home / ".config/yiju-autodeploy"
    state = home / ".local/state/yiju-autodeploy"
    for d in (lib, config_dir, state):
        d.mkdir(parents=True, exist_ok=True, mode=0o700)
        d.chmod(0o700)
    runner = lib / "runner.py"
    config = config_dir / "config.ini"
    wrapper = lib / "run.sh"

    # Fetch source only, do NOT update the production checkout here.
    run("git", "-C", str(info["app"]), "fetch", "--no-tags", "origin",
        "refs/heads/" + BRANCH + ":refs/remotes/origin/" + BRANCH, timeout=120)
    # Immutable bootstrap-reviewed version, not a dynamically fetched current branch script.
    contents = run("git", "-C", str(info["app"]), "show",
                   PINNED_RUNNER_SHA + ":scripts/deploy/yiju_auto_deploy.py")
    if "def gate_success(sha):" not in contents or "def backup_sqlite(cfg, target):" not in contents:
        raise Blocked("Pinned source did not match expected deployment implementation")
    if runner.exists():
        if runner.read_text(encoding="utf8") != contents + "\n" and runner.read_text(encoding="utf8") != contents:
            raise Blocked("Existing installed deployer differs; refusing to replace it")
    else:
        runner.write_text(contents + "\n", encoding="utf8")
        runner.chmod(0o700)

    desired = configparser.ConfigParser()
    desired["deploy"] = {
        "app_dir": str(info["app"]),
        "db_path": str(info["db"]),
        "pm2_name": info["pm2_name"],
        "branch": BRANCH,
        "public_url": "https://yiju.zhibeimao.com",
        "state_dir": str(state),
    }
    if config.exists():
        if config.stat().st_mode & 0o077:
            raise Blocked("Existing deployment config permissions are insecure")
        old = configparser.ConfigParser()
        old.read(str(config), encoding="utf8")
        if not old.has_section("deploy") or dict(old["deploy"]) != dict(desired["deploy"]):
            raise Blocked("Existing deployment config differs; refusing to overwrite")
    else:
        with config.open("w", encoding="utf8") as f:
            desired.write(f)
        config.chmod(0o600)

    shell = (f"#!/bin/sh\nexport PATH={shlex.quote(os.environ.get('PATH', ''))}\n"
             f"exec {shlex.quote(sys.executable)} {shlex.quote(str(runner))} "
             f"--config {shlex.quote(str(config))}\n")
    if wrapper.exists() and wrapper.read_text(encoding="utf8") != shell:
        raise Blocked("Existing cron wrapper differs; refusing to overwrite")
    wrapper.write_text(shell, encoding="utf8")
    wrapper.chmod(0o700)

    print("Local preflight", flush=True)
    run(sys.executable, str(runner), "--config", str(config), "--preflight", timeout=60)
    print("First CI-gated deployment and real public smoke", flush=True)
    # If CI is still pending, runner reports WAITING_CI. Do not enable unattended cron yet.
    run(sys.executable, str(runner), "--config", str(config), timeout=900)
    status_file = state / "latest-status.json"
    if not status_file.exists():
        raise Blocked("Deployment has no recorded verified status")
    result = json.loads(status_file.read_text(encoding="utf8"))
    if result.get("status") != "DEPLOYED":
        raise Blocked("First deployment not verified; cron not installed. Status: " + str(result.get("status")))
    latest = run("git", "-C", str(info["app"]), "rev-parse", "HEAD")
    if latest != result.get("target"):
        raise Blocked("Git checkout does not match deployed target")
    if not result.get("publicSmoke", {}).get("sitemapUrls", 0) >= 500:
        raise Blocked("Public sitemap acceptance missing")
    # Install the cron job only after a real, green first release.
    old_cron = read_crontab()
    line = CRON_SCHEDULE + " " + shlex.quote(str(wrapper)) + \
        " >> " + shlex.quote(str(state / "cron.log")) + " 2>&1"
    if CRON_MARKER not in old_cron:
        with tempfile.NamedTemporaryFile("w", delete=False, prefix="yiju-cron-", encoding="utf8") as f:
            cron_file = Path(f.name)
            f.write(old_cron.rstrip() + "\n" if old_cron.strip() else "")
            f.write(line + "\n" + CRON_MARKER + "\n")
        try:
            run("crontab", str(cron_file))
        finally:
            cron_file.unlink(missing_ok=True)
    elif line not in old_cron:
        raise Blocked("Existing cron marker does not match this installation")

    print(json.dumps({"result": "GO", "cron": "enabled every 10 minutes",
                      "production_sha": latest, "sitemap_urls": result["publicSmoke"]["sitemapUrls"],
                      "layflat_unique": result["publicSmoke"]["layflatUnique"]},
                     ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--install", action="store_true")
    args = parser.parse_args()
    if args.check == args.install:
        parser.error("Choose exactly one of --check (read-only) or --install")
    try:
        info = discover()
        if args.check:
            print(json.dumps({"result": "PREFLIGHT_PASS", "pm2_name": info["pm2_name"],
                              "git_sha": info["sha"], "sqlite_tables": info["table_count"],
                              "note": "No server changes made."}, ensure_ascii=False))
            return
        bootstrap(info)
    except (Blocked, OSError, RuntimeError, ValueError, sqlite3.Error) as exc:
        print(json.dumps({"result": "NO_GO", "reason": str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
