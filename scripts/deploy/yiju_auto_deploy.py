#!/usr/bin/env python3
"""Yiju safe on-host deployment poller. Standard library; install a fixed copy outside the repo."""
import argparse
import configparser
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

REPO_SLUG = "Jihai123/ClaudeTest"
DEFAULT_BRANCH = "claude/livable-cities-ranking-0112UFYCzLLMXat6n8Tjc83c"
WORKFLOW = "yiju-release-gate.yml"
USER_AGENT = "YijuSafeAutodeploy/1.0"
EXTRA_TESTS = (
    "tests_js/seo-sitemap.test.js",
    "tests_js/seo-live-links.test.js",
    "tests_js/layflat-pagination.test.js",
)


def run(*argv, cwd=None, timeout=360, output=True):
    result = subprocess.run(
        list(argv), cwd=str(cwd) if cwd else None, check=True,
        capture_output=True, text=True, timeout=timeout
    )
    return result.stdout.strip() if output else ""


def fetch(url, timeout=20):
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"})
    with urlopen(request, timeout=timeout) as response:
        return response.read()


def config_at(location):
    location = Path(location).expanduser().resolve()
    if not location.is_file():
        raise RuntimeError("Missing configuration: " + str(location))
    if location.stat().st_mode & 0o077:
        raise RuntimeError("Config must be private (chmod 600): " + str(location))
    cfg = configparser.ConfigParser()
    cfg.read(str(location), encoding="utf8")
    section = cfg["deploy"]
    app_dir = Path(section["app_dir"]).expanduser().resolve()
    db_path = Path(section["db_path"]).expanduser().resolve()
    state_dir = Path(section.get("state_dir", str(Path.home() / ".local/state/yiju-autodeploy"))).expanduser().resolve()
    branch = section.get("branch", DEFAULT_BRANCH)
    if branch != DEFAULT_BRANCH:
        raise RuntimeError("Unexpected branch: " + branch)
    if not app_dir.is_dir() or not (app_dir / ".git").exists():
        raise RuntimeError("app_dir is not a Git checkout: " + str(app_dir))
    if not db_path.is_file() or not db_path.is_absolute():
        raise RuntimeError("db_path must point to an existing absolute SQLite file")
    if db_path.stat().st_size < 4096:
        raise RuntimeError("Unexpectedly small database; inspect db_path")
    name = section["pm2_name"].strip()
    if not name or name.startswith("-"):
        raise RuntimeError("Missing PM2 service name")
    base_url = section.get("public_url", "https://yiju.zhibeimao.com").rstrip("/")
    if base_url != "https://yiju.zhibeimao.com":
        raise RuntimeError("Unexpected public_url: " + base_url)
    state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    state_dir.chmod(0o700)
    return {"app_dir": app_dir, "db_path": db_path, "state_dir": state_dir,
            "pm2_name": name, "public_url": base_url, "branch": branch}


def ensure_preflight(cfg):
    # A GitHub pull-and-execute runner must never have server-wide root privileges.
    if os.geteuid() == 0:
        raise RuntimeError("Refusing root automatic deployment; isolate yijucity service user first")
    app = cfg["app_dir"]
    remote = run("git", "remote", "get-url", "origin", cwd=app)
    allowed = (
        "https://github.com/Jihai123/ClaudeTest",
        "https://github.com/Jihai123/ClaudeTest.git",
        "git@github.com:Jihai123/ClaudeTest.git",
        "ssh://git@github.com/Jihai123/ClaudeTest.git",
    )
    if remote not in allowed:
        raise RuntimeError("Unexpected origin URL; refusing untrusted remote")
    if run("git", "symbolic-ref", "--short", "HEAD", cwd=app) != cfg["branch"]:
        raise RuntimeError("Production checkout must be on the exact default branch")
    if run("git", "status", "--porcelain", "--untracked-files=no", cwd=app):
        raise RuntimeError("Production tracked files have local changes; stop, preserve changes")
    try:
        processes = json.loads(run("pm2", "jlist", timeout=30))
    except Exception as exc:
        raise RuntimeError("Unable to inspect PM2 processes") from exc
    matched = [p for p in processes if p.get("name") == cfg["pm2_name"]]
    if len(matched) != 1:
        raise RuntimeError("PM2 service not uniquely identifiable: " + cfg["pm2_name"])
    env = matched[0].get("pm2_env", {})
    pm_cwd = env.get("pm_cwd")
    pm_path = env.get("pm_exec_path") or matched[0].get("pm_exec_path")
    if (not pm_cwd or Path(pm_cwd).resolve() != app) and (
        not pm_path or Path(pm_path).resolve() != (app / "server.js")
    ):
        raise RuntimeError("PM2 process does not point to the declared app_dir")
    if env.get("status") != "online":
        raise RuntimeError("PM2 service is not online")
    conn = sqlite3.connect(f"file:{quote(str(cfg['db_path']))}?mode=ro", uri=True)
    try:
        tables = conn.execute("SELECT count(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
        integrity = conn.execute("PRAGMA quick_check").fetchone()[0]
        if integrity != "ok" or tables < 5:
            raise RuntimeError("Production SQLite integrity or table count check failed")
    finally:
        conn.close()
    return run("git", "rev-parse", "HEAD", cwd=app)


def gate_success(sha):
    params = urlencode({"head_sha": sha, "event": "push", "per_page": "20"})
    url = f"https://api.github.com/repos/{REPO_SLUG}/actions/workflows/{WORKFLOW}/runs?{params}"
    response = json.loads(fetch(url).decode("utf8"))
    runs = [x for x in response.get("workflow_runs", []) if
            x.get("head_sha") == sha and x.get("head_branch") == DEFAULT_BRANCH
            and x.get("event") == "push"]
    if not runs:
        return False, "Release CI workflow not found for exact SHA"
    latest = max(runs, key=lambda x: (x.get("run_attempt", 0), x.get("id", 0)))
    if latest.get("status") != "completed" or latest.get("conclusion") != "success":
        return False, "Release CI not green: " + str(latest.get("status")) + "/" + str(latest.get("conclusion"))
    return True, "Verified GitHub Actions release gate run " + str(latest["id"])


def backup_sqlite(cfg, target):
    db_path = cfg["db_path"]
    free = shutil.disk_usage(cfg["state_dir"]).free
    if free < max(512 * 1024 * 1024, db_path.stat().st_size * 3):
        raise RuntimeError("Not enough space to safely back up the database")
    destination = cfg["state_dir"] / ("before-" + target[:12] + "-" + dt.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ") + ".sqlite")
    source = sqlite3.connect(f"file:{quote(str(db_path))}?mode=ro", uri=True, timeout=30)
    dest = sqlite3.connect(str(destination), timeout=30)
    try:
        source.backup(dest, pages=300, sleep=0.1)
    finally:
        source.close()
        dest.close()
    conn = sqlite3.connect(str(destination))
    try:
        if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("Backup integrity check failed")
        tables = conn.execute("SELECT count(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
        # An isolated *restored copy* must be readable and identical to the backup.
        restored = Path(tempfile.mktemp(prefix="yiju-restore-", suffix=".sqlite", dir=cfg["state_dir"]))
        shutil.copyfile(destination, restored)
        restored_db = sqlite3.connect(str(restored))
        try:
            if restored_db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("Backup restore isolation check failed")
            if restored_db.execute("SELECT count(*) FROM sqlite_master WHERE type='table'").fetchone()[0] != tables:
                raise RuntimeError("Backup restore table count mismatch")
        finally:
            restored_db.close()
            restored.unlink(missing_ok=True)
        if tables < 5:
            raise RuntimeError("Backup missing expected tables")
    finally:
        conn.close()
    destination.chmod(0o600)
    env_file = cfg["app_dir"] / ".env"
    if env_file.is_file():
        env_backup = destination.with_suffix(".env")
        shutil.copy2(env_file, env_backup)
        env_backup.chmod(0o600)
    return str(destination), tables


def staged_tests(cfg, sha):
    root = cfg["app_dir"]
    tmp = Path(tempfile.mkdtemp(prefix="yiju-staged-", dir=str(cfg["state_dir"])))
    worktree = tmp / "src"
    added = False
    try:
        run("git", "worktree", "add", "--detach", str(worktree), sha, cwd=root)
        added = True
        run("npm", "ci", "--no-audit", "--no-fund", cwd=worktree, timeout=480)
        run("npm", "run", "test:city-data", cwd=worktree, timeout=240)
        run("npm", "run", "test:city-data:sqlite", cwd=worktree, timeout=360)
        for file in EXTRA_TESTS:
            if not (worktree / file).is_file():
                raise RuntimeError("Required regression test missing: " + file)
            run("node", "--test", file, cwd=worktree, timeout=180)
        return True
    finally:
        if added:
            run("git", "worktree", "remove", "--force", str(worktree), cwd=root)
        shutil.rmtree(tmp, ignore_errors=True)


def public_smoke(cfg):
    base = cfg["public_url"]
    def load(route):
        return fetch(base + route).decode("utf8", errors="replace")
    health = json.loads(load("/api/health"))
    if health.get("status") != "ok":
        raise RuntimeError("Public health check failed")
    robots = load("/robots.txt")
    if "Sitemap: https://yiju.zhibeimao.com/sitemap.xml" not in robots:
        raise RuntimeError("Public robots.txt still has no canonical sitemap")
    xml = load("/sitemap.xml")
    root = ET.fromstring(xml)
    locs = [node.text for node in root.findall(".//{*}loc")]
    if len(locs) < 500 or len(locs) != len(set(locs)):
        raise RuntimeError("Sitemap has too few or duplicate URLs")
    if not all(url.startswith(base + "/") for url in locs):
        raise RuntimeError("Sitemap has noncanonical URLs")
    home = load("/")
    if 'href="upload-images.html"' not in home or 'href="upload-image.html"' in home:
        raise RuntimeError("Upload link not fixed on public homepage")
    compare = load("/city-compare.html")
    if '<link rel="canonical" href="' + base + '/city-compare.html">' not in compare:
        raise RuntimeError("Compare page canonical not fixed")
    load("/upload-images.html")
    first = json.loads(load("/api/cities?list_type=china_layflat&page=1&limit=100"))
    total = first["pagination"]["total"]
    pages = (total + 99) // 100
    ids = [x["id"] for x in first["cities"]]
    for page in range(2, pages + 1):
        data = json.loads(load("/api/cities?list_type=china_layflat&page=" + str(page) + "&limit=100"))
        if data["pagination"]["total"] != total:
            raise RuntimeError("City total changed during pagination smoke")
        ids.extend(x["id"] for x in data["cities"])
    if len(ids) != total or len(ids) != len(set(ids)):
        raise RuntimeError("Layflat pagination has duplicates or missing IDs")
    return {"sitemapUrls": len(locs), "layflatUnique": len(ids), "health": "ok"}


def save_status(cfg, state, **details):
    state_file = cfg["state_dir"] / "latest-status.json"
    data = {"status": state, "at": dt.datetime.utcnow().isoformat() + "Z", **details}
    tmp = state_file.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf8")
    os.replace(tmp, state_file)
    print(json.dumps(data, ensure_ascii=False), flush=True)


def deploy(cfg, sha, old_sha):
    if not staged_tests(cfg, sha):
        raise RuntimeError("Staged tests failed")
    backup, tables = backup_sqlite(cfg, sha)
    save_status(cfg, "DEPLOYING", target=sha, previous=old_sha, backup=backup, backupTables=tables)
    touched = False
    try:
        run("git", "merge", "--ff-only", sha, cwd=cfg["app_dir"], timeout=120)
        touched = True
        run("npm", "ci", "--omit=dev", "--no-audit", "--no-fund", cwd=cfg["app_dir"], timeout=480)
        run("pm2", "restart", cfg["pm2_name"], "--update-env", timeout=100)
        # On busy production CDNs allow a short retry before declaring regression.
        failure = None
        for retry in range(3):
            try:
                metrics = public_smoke(cfg)
                save_status(cfg, "DEPLOYED", target=sha, previous=old_sha,
                            backup=backup, backupTables=tables, publicSmoke=metrics)
                return
            except Exception as exc:
                failure = exc
                if retry < 2:
                    time.sleep(4)
        raise RuntimeError("Public smoke failed: " + str(failure))
    except Exception as error:
        if not touched:
            raise
        rollback_error = None
        try:
            # The initial strict clean-worktree check makes resetting code safe here.
            # NEVER restore the DB automatically: active users may have written new data.
            run("git", "reset", "--hard", old_sha, cwd=cfg["app_dir"])
            run("npm", "ci", "--omit=dev", "--no-audit", "--no-fund",
                cwd=cfg["app_dir"], timeout=480)
            run("pm2", "restart", cfg["pm2_name"], "--update-env", timeout=100)
        except Exception as rollback_exc:
            rollback_error = str(rollback_exc)
        save_status(cfg, "ROLLED_BACK" if rollback_error is None else "FAILED_ROLLBACK",
                    target=sha, previous=old_sha, error=str(error),
                    rollbackError=rollback_error, backup=backup)
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="~/.config/yiju-autodeploy/config.ini")
    parser.add_argument("--preflight", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    cfg = config_at(args.config)
    lock = cfg["state_dir"] / "deploy.lock"
    with lock.open("w") as fd:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Deployment already running; skipping")
            return
        current = ensure_preflight(cfg)
        if args.preflight:
            save_status(cfg, "PREFLIGHT_PASS", current=current,
                        db=str(cfg["db_path"]), pm2=cfg["pm2_name"])
            return
        run("git", "fetch", "--no-tags", "origin",
            "refs/heads/" + cfg["branch"] + ":refs/remotes/origin/" + cfg["branch"],
            cwd=cfg["app_dir"], timeout=120)
        target = run("git", "rev-parse", "refs/remotes/origin/" + cfg["branch"], cwd=cfg["app_dir"])
        if current == target:
            print("Already at latest commit " + current[:12])
            return
        run("git", "merge-base", "--is-ancestor", current, target, cwd=cfg["app_dir"])
        verified, reason = gate_success(target)
        if not verified:
            save_status(cfg, "WAITING_CI", current=current, target=target, reason=reason)
            return
        deploy(cfg, target, current)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"status": "NO_GO", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
