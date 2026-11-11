import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch


PATH = Path(__file__).resolve().parents[1] / "scripts/deploy/yiju_auto_deploy.py"
SPEC = importlib.util.spec_from_file_location("yiju_auto_deploy", str(PATH))
DEPLOY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DEPLOY)


class DeploymentGateTests(unittest.TestCase):
    def _check(self, runs, requested="a" * 40):
        payload = json.dumps({"workflow_runs": runs}).encode()
        with patch.object(DEPLOY, "fetch", return_value=payload):
            return DEPLOY.gate_success(requested)

    def test_only_exact_sha_and_push_to_default_branch_can_unlock(self):
        sha = "a" * 40
        valid = {"head_sha": sha, "head_branch": DEPLOY.DEFAULT_BRANCH, "event": "push",
                 "status": "completed", "conclusion": "success", "run_attempt": 1, "id": 21}
        self.assertTrue(self._check([valid])[0])
        self.assertFalse(self._check([dict(valid, head_sha="b" * 40)])[0])
        self.assertFalse(self._check([dict(valid, event="pull_request")])[0])
        self.assertFalse(self._check([dict(valid, head_branch="evil")])[0])
        self.assertFalse(self._check([dict(valid, conclusion="failure")])[0])

    def test_latest_failed_re_run_blocks_release(self):
        sha = "a" * 40
        runs = [
            {"head_sha": sha, "head_branch": DEPLOY.DEFAULT_BRANCH, "event": "push",
             "status": "completed", "conclusion": "success", "run_attempt": 1, "id": 24},
            {"head_sha": sha, "head_branch": DEPLOY.DEFAULT_BRANCH, "event": "push",
             "status": "completed", "conclusion": "failure", "run_attempt": 2, "id": 24}
        ]
        self.assertFalse(self._check(runs)[0])

    def test_live_db_snapshot_isolated_and_valid(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db = root / "actual.sqlite"
            con = sqlite3.connect(db)
            con.execute("create table cities (id integer primary key, name text)")
            con.execute("insert into cities values (1,'测试城市')")
            for i in range(5):
                con.execute("create table t" + str(i) + " (value text)")
            con.commit()
            con.close()
            cfg = {"db_path": db, "state_dir": root, "app_dir": root}
            backup, tables = DEPLOY.backup_sqlite(cfg, "b" * 40)
            self.assertEqual(tables, 6)
            with sqlite3.connect(backup) as cloned:
                self.assertEqual(cloned.execute("select name from cities where id=1").fetchone()[0], "测试城市")
            with sqlite3.connect(db) as live:
                self.assertEqual(live.execute("select count(*) from cities").fetchone()[0], 1)
            self.assertFalse(list(root.glob("yiju-restore-*")))

    def test_refuses_root_and_uses_old_git_symbolic_ref(self):
        with patch.object(DEPLOY.os, "geteuid", return_value=0):
            with self.assertRaisesRegex(RuntimeError, "Refusing root"):
                DEPLOY.ensure_preflight({"app_dir": Path("/tmp/not-used")})
        source = PATH.read_text(encoding="utf8")
        self.assertIn('run("git", "symbolic-ref", "--short", "HEAD", cwd=app)', source)
        self.assertNotIn('"branch", "--show-current"', source)

    def test_preflight_fails_on_public_config_permissions(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cfg = root / "config.ini"
            cfg.write_text("[deploy]\napp_dir=/tmp\n", encoding="utf8")
            cfg.chmod(0o644)
            with self.assertRaisesRegex(RuntimeError, "private"):
                DEPLOY.config_at(cfg)


if __name__ == "__main__":
    unittest.main()
