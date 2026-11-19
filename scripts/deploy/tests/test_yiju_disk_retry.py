"""Safety regressions for the fixed root runner's transient disk-block recovery."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import DEFAULT, patch

RUNNER_PATH = Path(__file__).resolve().parents[1] / 'yiju_root_autodeploy.py'
spec = importlib.util.spec_from_file_location('yiju_root_autodeploy', RUNNER_PATH)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)

TARGET = '38644336f1a0236e291403710835d2ba1b5af69d'
PREVIOUS = 'f5e2f39b6d22e544ad38464c9fd2cfcb25f1c8bb'
DISK_ERROR = 'Less than 2GiB free, cannot preserve rollback'


class DiskBlockRetryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = Path(self.tmp.name)
        (self.state / 'deployed-manifest.json').write_text(json.dumps({'server.js': 'digest'}))
        (self.state / 'reconciliation-state.json').write_text(json.dumps({'sha': PREVIOUS}))
        for name in ('deployed-manifest.json', 'reconciliation-state.json'):
            (self.state / name).chmod(0o600)
        self.state_patch = patch.object(runner, 'STATE', self.state)
        self.state_patch.start()
        self.addCleanup(self.state_patch.stop)
        self.disk_patch = patch.object(runner.shutil, 'disk_usage',
                                       return_value=types.SimpleNamespace(free=4*1024**3))
        self.disk_patch.start()
        self.addCleanup(self.disk_patch.stop)

    def blocked(self, error=DISK_ERROR):
        return {'status': 'BLOCKED_SHA', 'sha': TARGET, 'error': error}

    def test_only_recovered_disk_block_with_verified_previous_sha_can_retry(self):
        self.assertEqual(runner.recover_previous_deployed_sha_after_disk_block(
            self.blocked(), TARGET), PREVIOUS)
        self.assertIsNone(runner.recover_previous_deployed_sha_after_disk_block(
            self.blocked('Production file changed'), TARGET))
        self.assertIsNone(runner.recover_previous_deployed_sha_after_disk_block(
            {'status':'ROLLED_BACK','sha':TARGET,'error':DISK_ERROR}, TARGET))
        self.assertIsNone(runner.recover_previous_deployed_sha_after_disk_block(
            self.blocked(), 'a'*40))

    def test_headroom_required_and_missing_manifest_cannot_retry(self):
        with patch.object(runner.shutil, 'disk_usage',
                          return_value=types.SimpleNamespace(free=2*1024**3)):
            self.assertIsNone(runner.recover_previous_deployed_sha_after_disk_block(
                self.blocked(), TARGET))
        (self.state / 'deployed-manifest.json').unlink()
        self.assertIsNone(runner.recover_previous_deployed_sha_after_disk_block(
            self.blocked(), TARGET))

    def test_recovered_target_replays_with_real_previous_deployed_sha(self):
        (self.state / 'status.json').write_text(json.dumps(self.blocked()))
        def fake_git(*args, **kwargs):
            return types.SimpleNamespace(stdout=TARGET if args[0]=='rev-parse' else '')
        with patch.multiple(runner, require_sqlite_online_backup=DEFAULT,
                            checks=DEFAULT, ensure_node=DEFAULT, git=DEFAULT,
                            release_gate=DEFAULT, run_deploy=DEFAULT) as mocks:
            mocks['git'].side_effect = fake_git
            mocks['release_gate'].return_value = True
            runner.one_cycle()
            mocks['release_gate'].assert_called_once_with(TARGET)
            mocks['run_deploy'].assert_called_once_with(TARGET, PREVIOUS, True)
        # State is left intact until the existing deployment path writes success/failure.
        self.assertEqual(json.loads((self.state / 'status.json').read_text())['status'],
                         'BLOCKED_SHA')

    def test_non_space_failure_returns_nonzero_instead_of_silent_success(self):
        (self.state / 'status.json').write_text(json.dumps(self.blocked('Integrity failure')))
        def fake_git(*args, **kwargs):
            return types.SimpleNamespace(stdout=TARGET if args[0]=='rev-parse' else '')
        with patch.multiple(runner, require_sqlite_online_backup=DEFAULT,
                            checks=DEFAULT, ensure_node=DEFAULT, git=DEFAULT,
                            release_gate=DEFAULT, run_deploy=DEFAULT) as mocks:
            mocks['git'].side_effect = fake_git
            mocks['release_gate'].return_value = True
            with self.assertRaisesRegex(runner.Abort, 'BLOCKED_SHA'):
                runner.one_cycle()
            mocks['run_deploy'].assert_not_called()


if __name__ == '__main__':
    unittest.main()
