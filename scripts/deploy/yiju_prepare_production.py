#!/usr/bin/env python3
"""Prepare (never deploy) an isolated Yiju release preserving the running root PM2 app.

This script may be run by the server administrator. It writes only under a new
0700 rescue directory and Git administrative worktree/fetch refs. It NEVER edits,
resets, merges, restarts or changes ownership of the live service checkout.
No shell=True, no remote-sourced secrets and no changes to other PM2 processes.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
from urllib.parse import quote

REPO = "Jihai123/ClaudeTest"
BRANCH = "claude/livable-cities-ranking-0112UFYCzLLMXat6n8Tjc83c"
APP = Path("/www/wwwroot/yijucity/ClaudeTest")
ORIGINS = {
    "https://github.com/Jihai123/ClaudeTest",
    "https://github.com/Jihai123/ClaudeTest.git",
    "git@github.com:Jihai123/ClaudeTest.git",
    "ssh://git@github.com/Jihai123/ClaudeTest.git",
}
ALLOWED_DB_BASENAME = "database.sqlite"


class StopRelease(RuntimeError):
    pass


def command(args, *, cwd=None, timeout=180, check=True, input_data=None):
    p = subprocess.run(args, cwd=str(cwd) if cwd else None, input=input_data,
                       capture_output=True, timeout=timeout)
    if check and p.returncode:
        # Avoid displaying stdout/stderr because PM2 and Git may contain secrets.
        raise StopRelease("Command failed (details kept local): " + str(args[0:2]))
    return p


def git(app, *args, check=True, timeout=180):
    return command(["git", "-C", str(app), "-c", "core.hooksPath=/dev/null",
                    "-c", "commit.gpgsign=false", *args], timeout=timeout,
                   check=check)


def text(cmd):
    return cmd.stdout.decode("utf8", errors="replace").strip()


def verified_git(app):
    if not (app / ".git").exists():
        raise StopRelease("Production app has no Git working tree")
    origin = text(git(app, "remote", "get-url", "origin"))
    if origin not in ORIGINS:
        raise StopRelease("Origin not allowlisted")
    branch = text(git(app, "symbolic-ref", "--short", "HEAD"))
    if branch != BRANCH:
        raise StopRelease("Unexpected production branch")
    sha = text(git(app, "rev-parse", "HEAD"))
    if len(sha) != 40:
        raise StopRelease("Unexpected production HEAD")
    return sha


def inspect_pm2(app):
    p = command(["pm2", "jlist"], timeout=30)
    try:
        entries = json.loads(p.stdout)
    except ValueError as exc:
        raise StopRelease("PM2 service list cannot be parsed") from exc
    services = [x for x in entries if x.get("name") == "yijucity"]
    if len(services) != 1:
        raise StopRelease("Expected exactly one yijucity service")
    item = services[0]
    env = item.get("pm2_env", {})
    if env.get("status") != "online":
        raise StopRelease("yijucity PM2 process is not online")
    path = env.get("pm_exec_path") or item.get("pm_exec_path")
    if not path or Path(path).resolve() != (app / "server.js").resolve():
        raise StopRelease("PM2 script is not expected server.js")
    cwd = env.get("pm_cwd")
    if cwd and Path(cwd).resolve() != app.resolve():
        raise StopRelease("PM2 cwd differs from project checkout")
    pid = item.get("pid")
    if not isinstance(pid, int) or pid <= 0:
        raise StopRelease("PM2 did not expose a valid running PID")
    return pid, env


def candidate_db(app, pid, pm_env):
    dbsetting = pm_env.get("DB_PATH")
    env_file = app / ".env"
    if not dbsetting and env_file.is_file():
        for line in env_file.read_text(encoding="utf8", errors="replace").splitlines():
            if line.lstrip().startswith("DB_PATH="):
                dbsetting = line.split("=", 1)[1].strip().strip("'\"")
                break
    db = Path(dbsetting or "database.sqlite").expanduser()
    if not db.is_absolute():
        db = app / db
    db = db.resolve()
    if db.name != ALLOWED_DB_BASENAME or not db.is_file():
        raise StopRelease("Database path unexpected; refusing to guess live DB")
    if db.stat().st_size < 4096:
        raise StopRelease("Unexpectedly small SQLite database")
    # A sqlite connection may be present in /proc, but not always visible.
    observed_open = False
    fd_path = Path("/proc") / str(pid) / "fd"
    try:
        for entry in fd_path.iterdir():
            try:
                link = os.readlink(str(entry)).replace(" (deleted)", "")
                if Path(link).resolve() == db:
                    observed_open = True
                    break
            except (OSError, RuntimeError):
                pass
    except OSError:
        pass
    certainty = ("open_fd_and_configuration" if observed_open and dbsetting
                 else "open_fd" if observed_open else
                 "configured" if dbsetting else "default_path_unverified")
    return db, certainty


def backup_database(db, destination):
    source = sqlite3.connect("file:" + quote(str(db)) + "?mode=ro", uri=True, timeout=30)
    clone = sqlite3.connect(str(destination), timeout=30)
    try:
        source.backup(clone, pages=100, sleep=0.1)
    finally:
        clone.close()
        source.close()
    with sqlite3.connect(str(destination)) as check:
        result = check.execute("PRAGMA integrity_check").fetchone()[0]
        tables = check.execute(
            "SELECT count(*) FROM sqlite_master WHERE type='table'"
        ).fetchone()[0]
        if result != "ok" or tables < 5:
            raise StopRelease("SQLite backup integrity/table-count failed")
    # An isolated copy is opened and checked before any publish could be planned.
    restored = destination.with_name("restore-verified.sqlite")
    shutil.copyfile(str(destination), str(restored))
    try:
        with sqlite3.connect(str(restored)) as check:
            if check.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise StopRelease("Isolated SQLite restore integrity failed")
            count = check.execute(
                "SELECT count(*) FROM sqlite_master WHERE type='table'"
            ).fetchone()[0]
            if count != tables:
                raise StopRelease("Isolated SQLite restore table count mismatch")
    finally:
        restored.unlink(missing_ok=True)
    destination.chmod(0o600)
    return tables


def prepare_git_staging(app, old_sha, target_sha, patch, stage):
    """Apply the original tracked-file patch to a detached old-SHA worktree;
    merge newer branch *there*. Conflicts stay in staging for careful review.
    Production files are never reset, patched or merged.
    """
    command(["git", "-C", str(app), "-c", "core.hooksPath=/dev/null",
             "worktree", "add", "--detach", str(stage), old_sha], timeout=120)
    patch_bytes = patch.read_bytes()
    if patch_bytes:
        git(stage, "apply", "--index", "--binary", str(patch))
        git(stage, "add", "-u")
        git(stage, "-c", "user.name=Yiju Rescue", "-c",
            "user.email=yiju-rescue@localhost.invalid",
            "commit", "--no-gpg-sign", "--no-verify",
            "-m", "local-only snapshot of current production tracked modifications")
    result = git(stage, "merge", "--no-commit", "--no-ff", target_sha, check=False)
    conflict_text = text(git(stage, "diff", "--name-only", "--diff-filter=U"))
    conflicts = [x for x in conflict_text.splitlines() if x]
    if result.returncode and not conflicts:
        raise StopRelease("Staging merge failed without ordinary conflicts")
    return {
        "result": "CONFLICTS_REQUIRE_REVIEW" if conflicts else "MERGE_READY_FOR_REVIEW",
        "conflict_files": conflicts,
        "staging_path": str(stage),
        "staging_only": True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", default=str(APP))
    parser.add_argument("--backup-root", default="/root")
    args = parser.parse_args()
    os.umask(0o077)
    app = Path(args.app).resolve()
    old_sha = verified_git(app)
    pid, env = inspect_pm2(app)
    db, db_certainty = candidate_db(app, pid, env)
    free_bytes = shutil.disk_usage(str(app)).free
    if free_bytes < max(1024**3, db.stat().st_size * 5):
        raise StopRelease("Not enough free disk for backup and private staging")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target_dir = Path(args.backup_root).resolve() / ("yiju-rescue-" + stamp + "-" + str(os.getpid()))
    target_dir.mkdir(mode=0o700, parents=False, exist_ok=False)
    # Everything here remains private on the server; never upload to public GitHub.
    patch = target_dir / "production-tracked.patch"
    patch.write_bytes(git(app, "diff", "--binary", "HEAD").stdout)
    patch.chmod(0o600)
    stat = git(app, "diff", "--stat", "HEAD").stdout
    (target_dir / "changes-stat.txt").write_bytes(stat)
    tracked = text(git(app, "diff", "--name-only", "HEAD")).splitlines()
    untracked = text(git(app, "ls-files", "--others", "--exclude-standard")).splitlines()
    (target_dir / "tracked-files.json").write_text(json.dumps(tracked, ensure_ascii=False, indent=2))
    (target_dir / "untracked-files.json").write_text(json.dumps(untracked, ensure_ascii=False, indent=2))
    (target_dir / "old-head.txt").write_text(old_sha + "\n")
    if (app / ".env").is_file():
        env_copy = target_dir / "private-env.backup"
        shutil.copy2(str(app / ".env"), str(env_copy))
        env_copy.chmod(0o600)
    db_backup = target_dir / "production.sqlite"
    db_tables = backup_database(db, db_backup)
    patch_hash = hashlib.sha256(patch.read_bytes()).hexdigest()

    # Fetch remote refs, not checkout/merge of production files.
    git(app, "fetch", "--no-tags", "origin",
        "refs/heads/" + BRANCH + ":refs/remotes/origin/" + BRANCH, timeout=150)
    target = text(git(app, "rev-parse", "refs/remotes/origin/" + BRANCH))
    ancestor = git(app, "merge-base", "--is-ancestor", old_sha, target, check=False)
    if ancestor.returncode:
        raise StopRelease("Production history diverged; original files are preserved in " + str(target_dir))
    stage = target_dir / "staging"
    merged = prepare_git_staging(app, old_sha, target, patch, stage)
    if text(git(app, "rev-parse", "HEAD")) != old_sha:
        raise StopRelease("Unexpected production HEAD change detected")
    new_patch_sha = hashlib.sha256(git(app, "diff", "--binary", "HEAD").stdout).hexdigest()
    if new_patch_sha != patch_hash:
        raise StopRelease("Production tracked changes differed during preparation")

    summary = {
        "status": merged["result"],
        "live_production_untouched": True,
        "old_production_sha": old_sha,
        "target_upstream_sha": target,
        "tracked_modified": len(tracked),
        "untracked_count": len(untracked),
        "conflicts": merged["conflict_files"],
        "backup_directory": str(target_dir),
        "sqlite_backup_integrity": "ok",
        "sqlite_tables": db_tables,
        "sqlite_identity_certainty": db_certainty,
        "patch_sha256": patch_hash,
        "new_service_deployed": False,
        "pm2_restart": False,
        "auto_deploy_cron_added": False,
    }
    (target_dir / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, sqlite3.Error, ValueError,
            subprocess.SubprocessError) as err:
        print(json.dumps({"status": "NO_GO", "reason": str(err)},
                         ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
