"""No production paths: exercise the active runner's retired-patch gates and rollback."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest
from unittest.mock import patch

FILE = Path(__file__).resolve().parents[1] / 'scripts/deploy/yiju_root_autodeploy.py'
SPEC = importlib.util.spec_from_file_location('retirement_runner', FILE)
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)

class RetirementTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.app = self.root/'app'; self.state = self.root/'state'; self.stage = self.root/'stage'
        for p in (self.app, self.state, self.stage): p.mkdir()
        self.patches = [patch.object(M, 'APP', self.app), patch.object(M, 'STATE', self.state)]
        for p in self.patches: p.start(); self.addCleanup(p.stop)
        self.write(self.app/'server.js', 'old code')
        self.write(self.stage/'server.js', 'new code')
        self.write(self.app/'private-asset.txt', 'production asset')
        (self.stage/'node_modules').mkdir()
        (self.app/'node_modules').mkdir()
        self.write(self.app/'node_modules'/'fixture', 'old modules')
        self.write(self.stage/'node_modules'/'fixture', 'new modules')
        for name in M.PROTECTED_DATA:
            self.write(self.app/name, 'original production data: ' + name)
            self.write(self.stage/name, 'upstream sample must never be copied')
        self.json(self.state/'deployed-manifest.json', {'server.js': M.sha256_file(self.app/'server.js')})
        self.json(self.state/'status.json', {'status':'DEPLOYED','sha':'a'*40})
        self.inventory = {'previous_deployed_sha':'a'*40,
            'protected_data': {n:M.sha256_file(self.app/n) for n in M.PROTECTED_DATA},
            'entries': {'private-asset.txt':{'sha256':M.sha256_file(self.app/'private-asset.txt'),
                                           'decision':'preserve-untracked'}}}
        self.json(self.state/'reconciliation-inventory.json', self.inventory)
        self.policy = {'schema':1,'review':'APPROVED','merge_sha':'b'*40,
                       'legacy_patch_sha256':M.LEGACY_PATCH_SHA,
                       'inventory_sha256':M.sha256_file(self.state/'reconciliation-inventory.json')}
        self.json(self.state/'reconciled-mode.json', self.policy)
        self.pr = {'merged':True,'merge_commit_sha':'b'*40,'base':{'ref':M.BRANCH}}
        for p in [patch.object(M,'api_json',return_value=self.pr),
                  patch.object(M,'release_gate',return_value=True),
                  patch.object(M,'git',return_value=subprocess.CompletedProcess([],0,stdout='server.js\0',stderr=''))]:
            p.start();self.addCleanup(p.stop)

    def write(self,p,s):
        p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s)

    def json(self,p,obj):
        self.write(p,json.dumps(obj));p.chmod(0o600)

    def test_requires_merge_and_exact_merge_identity(self):
        for pr in [dict(self.pr,merged=False),dict(self.pr,merge_commit_sha='c'*40),
                   dict(self.pr,base={'ref':'other'})]:
            with patch.object(M,'api_json',return_value=pr):
                with self.assertRaises(M.Abort): M.retirement_policy('d'*40)

    def test_requires_descendant_and_successful_exact_push(self):
        with patch.object(M,'git',return_value=subprocess.CompletedProcess([],1)):
            with self.assertRaises(M.Abort): M.retirement_policy('d'*40)
        with patch.object(M,'release_gate',return_value=False):
            with self.assertRaises(M.Abort): M.retirement_policy('d'*40)

    def test_unreviewed_or_tampered_inventory_is_rejected(self):
        self.policy['review']='PENDING'; self.json(self.state/'reconciled-mode.json',self.policy)
        with self.assertRaises(M.Abort): M.retirement_policy('d'*40)
        self.policy['review']='APPROVED'; self.json(self.state/'reconciled-mode.json',self.policy)
        self.write(self.state/'reconciliation-inventory.json','{}')
        with self.assertRaises(M.Abort): M.retirement_policy('d'*40)

    def test_data_drift_blocks_even_noop(self):
        self.write(self.app/next(iter(M.PROTECTED_DATA)), 'changed')
        with self.assertRaises(M.Abort): M.retirement_policy()

    def test_inventory_and_policy_permissions_fail_closed(self):
        (self.state/'reconciliation-inventory.json').chmod(0o644)
        with self.assertRaises(M.Abort): M.retirement_policy('d'*40)

    def test_unknown_collision_and_symlink_parent_block(self):
        self.write(self.app/'new.js','unknown')
        with self.assertRaises(M.Abort):
            M.approved_stage_paths(self.stage, {'new.js'}, self.inventory)
        (self.app/'escape').symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(M.Abort): M.safe_relative('escape/file')

    def test_copy_and_restore_never_write_historical_data(self):
        tracked = {'server.js'} | M.PROTECTED_DATA
        before = {n:((self.app/n).read_bytes(),(self.app/n).stat().st_mtime_ns) for n in M.PROTECTED_DATA}
        backup = self.root/'backup';backup.mkdir()
        M.backup_code(backup,tracked);M.copy_code(self.stage,tracked)
        M.restore_code(backup,tracked)
        self.assertEqual((self.app/'server.js').read_text(),'old code')
        for n,(content,mtime) in before.items():
            self.assertEqual((self.app/n).read_bytes(),content)
            self.assertEqual((self.app/n).stat().st_mtime_ns,mtime)

    def test_failed_smoke_restores_real_code_modules_manifest_and_preserves_data(self):
        conn = sqlite3.connect(self.app/'database.sqlite')
        conn.execute('CREATE TABLE fixture(id INTEGER)')
        conn.execute('INSERT INTO fixture VALUES(1)');conn.commit();conn.close()
        before = (self.state/'deployed-manifest.json').read_bytes()
        tracked = {'server.js'} | M.PROTECTED_DATA
        def command(*a,**kw):
            return subprocess.CompletedProcess(a,0,stdout='',stderr='')
        with patch.object(M,'stage_release',return_value=(self.stage,tracked)), \
             patch.object(M,'test_stage'), patch.object(M,'ensure_free_space'), \
             patch.object(M,'pm2',side_effect=[{'pm2_env':{'exec_interpreter':'old-node'}},{'pm2_env':{'exec_interpreter':str(M.NODE_DIR/'bin/node')}}]), \
             patch.object(M,'run',side_effect=command), patch.object(M.time,'sleep'), \
             patch.object(M,'health_smoke',side_effect=M.Abort('injected smoke failure')):
            with self.assertRaises(M.Abort):
                M.run_deploy('d'*40,'a'*40,True)
        self.assertEqual((self.app/'server.js').read_text(),'old code')
        self.assertEqual((self.app/'node_modules'/'fixture').read_text(),'old modules')
        self.assertEqual((self.state/'deployed-manifest.json').read_bytes(),before)
        self.assertFalse((self.state/'reconciliation-state.json').exists())
        self.assertEqual(json.loads((self.state/'status.json').read_text())['status'],'ROLLED_BACK')
        self.assertIn('injected smoke failure',json.loads((self.state/'status.json').read_text())['error'])
        self.assertEqual((self.app/'private-asset.txt').read_text(),'production asset')
        for n,digest in self.inventory['protected_data'].items():
            self.assertEqual(M.sha256_file(self.app/n),digest)
        backups = list(self.state.glob('backup-*'))
        self.assertEqual(len(backups),1)
        with sqlite3.connect(backups[0]/'database.sqlite') as c:
            self.assertEqual(c.execute('SELECT id FROM fixture').fetchone(),(1,))

    def test_reviewed_mode_does_not_apply_legacy_patch(self):
        # stage_release uses real directory creation but synthetic git worktree output.
        def git(*args,**kwargs):
            if args[:2] == ('worktree','add'):
                destination=Path(args[-2]);destination.mkdir()
            return subprocess.CompletedProcess([],0,stdout='server.js\0',stderr='')
        with patch.object(M,'git',side_effect=git), patch.object(M,'run') as run:
            stage,tracked=M.stage_release('d'*40)
            self.assertIn('server.js',tracked)
            self.assertFalse(any('apply' in call.args[0] for call in run.call_args_list))
            __import__('shutil').rmtree(stage.parent)

    def test_old_git_index_cannot_bypass_new_collision_review(self):
        self.write(self.app/'new.js', 'unmanaged local content')
        with patch.object(M, 'git', return_value=subprocess.CompletedProcess([],0,stdout='new.js\\0')):
            with self.assertRaises(M.Abort):
                M.approved_stage_paths(self.stage, {'new.js'}, self.inventory)

    def test_legacy_mode_still_checks_pinned_patch(self):
        (self.state/'reconciled-mode.json').unlink()
        self.assertIsNone(M.retirement_policy('d'*40))
