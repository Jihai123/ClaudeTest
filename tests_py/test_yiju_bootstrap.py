"""Conservative one-shot bootstrap behavior; never execute commands on CI host."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch, Mock


FILE = Path(__file__).resolve().parents[1] / "scripts/deploy/bootstrap_yiju_autodeploy.py"
SPEC = importlib.util.spec_from_file_location("bootstrap_yiju_autodeploy", str(FILE))
BOOTSTRAP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BOOTSTRAP)


class BootstrapTests(unittest.TestCase):
    def test_pinned_runner_source_and_unique_expected_branch(self):
        self.assertEqual(len(BOOTSTRAP.PINNED_RUNNER_SHA), 40)
        self.assertEqual(BOOTSTRAP.PINNED_RUNNER_SHA,
                         "69d42ad3a12db191d674a2fe8c68380c8c182392")
        self.assertEqual(BOOTSTRAP.BRANCH,
                         "claude/livable-cities-ranking-0112UFYCzLLMXat6n8Tjc83c")

    def test_bootstrap_git_217_compatibility(self):
        source = FILE.read_text(encoding="utf8")
        self.assertIn('"symbolic-ref", "--short", "HEAD"', source)
        self.assertNotIn('"branch", "--show-current"', source)

    def test_refuses_root(self):
        with patch.object(BOOTSTRAP.os, "geteuid", return_value=0):
            with self.assertRaisesRegex(BOOTSTRAP.Blocked, "Refusing root"):
                BOOTSTRAP.discover()

    def test_cron_read_error_is_fail_closed(self):
        cases = [
            (subprocess.CompletedProcess(["crontab", "-l"], 0, "0 1 * * * echo retain\n", ""),
             "0 1 * * * echo retain\n"),
            (subprocess.CompletedProcess(["crontab", "-l"], 1, "", "no crontab for appuser"),
             ""),
        ]
        for result, expected in cases:
            with patch.object(BOOTSTRAP.subprocess, "run", return_value=result):
                self.assertEqual(BOOTSTRAP.read_crontab(), expected)
        with patch.object(BOOTSTRAP.subprocess, "run",
                          return_value=subprocess.CompletedProcess(
                              ["crontab", "-l"], 1, "", "Permission denied")):
            with self.assertRaisesRegex(BOOTSTRAP.Blocked, "refusing"):
                BOOTSTRAP.read_crontab()

    def test_check_mode_never_installs(self):
        with patch.object(BOOTSTRAP, "discover", return_value={
            "pm2_name": "yijucity", "sha": "c" * 40,
            "table_count": 15
        }), patch.object(BOOTSTRAP, "bootstrap") as install:
            with patch.object(sys, "argv", ["bootstrap", "--check"]):
                BOOTSTRAP.main()
            install.assert_not_called()


if __name__ == "__main__":
    unittest.main()
