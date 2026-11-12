"""Local-only integration tests for dirty production snapshot + isolated Git merge.

No production checkout, remote server, PM2 or network is used.
"""
import importlib.util
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest

FILE = Path(__file__).resolve().parents[1] / "scripts/deploy/yiju_prepare_production.py"
SPEC = importlib.util.spec_from_file_location("yiju_prepare_production", str(FILE))
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


def run(*args, cwd=None):
    result = subprocess.run(args, cwd=cwd, check=True, capture_output=True, text=True)
    return result.stdout.strip()


class RescueTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.repo = self.root / "live"
        self.repo.mkdir()
        run("git", "init", "-q", str(self.repo))
        run("git", "-C", str(self.repo), "config", "user.name", "Fixture")
        run("git", "-C", str(self.repo), "config", "user.email", "fixture@invalid.local")
        (self.repo / "page.txt").write_text("city title\nvalue zero\n", encoding="utf8")
        (self.repo / "data.txt").write_text("some old data\n", encoding="utf8")
        run("git", "-C", str(self.repo), "add", "page.txt", "data.txt")
        run("git", "-C", str(self.repo), "commit", "-qm", "base")
        self.old = run("git", "-C", str(self.repo), "rev-parse", "HEAD")

    def upstream_commit(self, updated_file, content):
        other = self.root / "upstream"
        run("git", "-C", str(self.repo), "worktree", "add", "-q", "-b", "release", str(other))
        (other / updated_file).write_text(content, encoding="utf8")
        run("git", "-C", str(other), "add", "-u")
        run("git", "-C", str(other), "commit", "-qm", "release change")
        return run("git", "-C", str(other), "rev-parse", "HEAD")

    def test_unconflicted_merge_never_changes_dirty_production(self):
        (self.repo / "page.txt").write_text("city title\nnew customer data\n", encoding="utf8")
        original = (self.repo / "page.txt").read_bytes()
        patch = self.root / "patch.diff"
        patch.write_bytes(MOD.git(self.repo, "diff", "--binary", "HEAD").stdout)
        latest = self.upstream_commit("data.txt", "new API content\n")
        status = MOD.prepare_git_staging(self.repo, self.old, latest, patch, self.root / "staging")
        self.assertEqual(status["result"], "MERGE_READY_FOR_REVIEW")
        self.assertFalse(status["conflict_files"])
        self.assertEqual((self.repo / "page.txt").read_bytes(), original)
        self.assertEqual(run("git", "-C", str(self.repo), "rev-parse", "HEAD"), self.old)
        self.assertIn("new customer data", (self.root / "staging/page.txt").read_text())
        self.assertIn("new API content", (self.root / "staging/data.txt").read_text())

    def test_conflict_stays_in_staging_and_preserves_live_changes(self):
        (self.repo / "page.txt").write_text("locally edited city title\nvalue zero\n", encoding="utf8")
        original = (self.repo / "page.txt").read_bytes()
        patch = self.root / "patch.diff"
        patch.write_bytes(MOD.git(self.repo, "diff", "--binary", "HEAD").stdout)
        latest = self.upstream_commit("page.txt", "remotely edited city title\nvalue zero\n")
        status = MOD.prepare_git_staging(self.repo, self.old, latest, patch, self.root / "staging")
        self.assertEqual(status["result"], "CONFLICTS_REQUIRE_REVIEW")
        self.assertIn("page.txt", status["conflict_files"])
        self.assertEqual((self.repo / "page.txt").read_bytes(), original)
        self.assertEqual(run("git", "-C", str(self.repo), "rev-parse", "HEAD"), self.old)

    def test_online_sqlite_backup_and_isolated_restore(self):
        db = self.root / "database.sqlite"
        with sqlite3.connect(str(db)) as conn:
            for n in range(6):
                conn.execute("CREATE TABLE t%d (value TEXT)" % n)
            conn.execute("INSERT INTO t0 VALUES ('original')")
        backup = self.root / "saved.sqlite"
        count = MOD.backup_database(db, backup)
        self.assertEqual(count, 6)
        with sqlite3.connect(str(backup)) as conn:
            self.assertEqual(conn.execute("SELECT value FROM t0").fetchone()[0], "original")
        with sqlite3.connect(str(db)) as conn:
            self.assertEqual(conn.execute("SELECT value FROM t0").fetchone()[0], "original")
        self.assertFalse((self.root / "restore-verified.sqlite").exists())


if __name__ == "__main__":
    unittest.main()
