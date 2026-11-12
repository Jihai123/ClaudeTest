"""Synthetic tests: root autopull cannot overwrite live Git while constructing staging."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

FILE=Path(__file__).resolve().parents[1]/'scripts/deploy/yiju_root_autodeploy.py'
SPEC=importlib.util.spec_from_file_location('yiju_root_autodeploy',str(FILE))
M=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)

def git(*args,cwd=None):
    return subprocess.check_output(['git',*args],cwd=cwd).decode().strip()

class ReleaseTests(unittest.TestCase):
    def test_exact_sha_green_push_only(self):
        good={'head_sha':'a'*40,'event':'push','head_branch':M.BRANCH,
              'conclusion':'success','status':'completed','run_attempt':1,'id':7}
        with patch.object(M,'api_json',return_value={'workflow_runs':[good]}):
            self.assertTrue(M.release_gate('a'*40))
            self.assertFalse(M.release_gate('b'*40))
        for key,value in [('event','pull_request'),('conclusion','failure'),('status','queued'),('head_branch','evil')]:
            with patch.object(M,'api_json',return_value={'workflow_runs':[dict(good,**{key:value})]}):
                self.assertFalse(M.release_gate('a'*40))

    def test_staged_patch_merge_preserves_dirty_live_checkout(self):
        with tempfile.TemporaryDirectory() as tmp:
            d=Path(tmp); app=d/'app';app.mkdir();rescue=d/'rescue';rescue.mkdir();state=d/'state';state.mkdir()
            git('init','-q',str(app))
            git('config','user.name','Fixture',cwd=app)
            git('config','user.email','test@example.invalid',cwd=app)
            (app/'a.txt').write_text('a\noriginal\n')
            (app/'b.txt').write_text('old\n')
            git('add','.',cwd=app);git('commit','-qm','base',cwd=app)
            (app/'a.txt').write_text('a\nlocal customer edit\n')
            patchbytes=subprocess.check_output(['git','diff','--binary','HEAD'],cwd=app)
            (rescue/'production-tracked.patch').write_bytes(patchbytes)
            with tarfile.open(rescue/'untracked-files.tar.gz','w:gz'):pass
            (app/'b.txt').write_text('new upstream code\n')
            git('add','b.txt',cwd=app);git('commit','-qm','upstream',cwd=app)
            sha=git('rev-parse','HEAD',cwd=app)
            old_git=M.git
            def localgit(*args,cwd=app,check=True):
                return M.run(['git','-c','core.hooksPath=/dev/null',*args],cwd=cwd,check=check)
            with patch.object(M,'git',side_effect=localgit),patch.object(M,'RESCUE',rescue),patch.object(M,'STATE',state):
                path,files=M.stage_release(sha)
                self.assertEqual((path/'a.txt').read_text(),'a\nlocal customer edit\n')
                self.assertEqual((path/'b.txt').read_text(),'new upstream code\n')
                self.assertEqual((app/'a.txt').read_text(),'a\nlocal customer edit\n')
                self.assertIn('a.txt',files)
                M.git('worktree','remove','--force',str(path))

    def test_path_and_pinned_runtime_are_fixed(self):
        self.assertEqual(M.NODE_VER,'v22.23.4')
        self.assertEqual(len(M.NODE_SHA256),64)
        self.assertEqual(M.SERVICE,'yijucity')
        self.assertIn('Jihai123/ClaudeTest',M.REPO)

if __name__=='__main__':unittest.main()
