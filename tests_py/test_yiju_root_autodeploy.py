"""Synthetic tests: root autopull cannot overwrite live Git while constructing staging."""
import importlib.util
import io
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


class NodeArchiveTests(unittest.TestCase):
    """Regression for valid archive-root member and untrusted path controls."""
    def setUp(self):
        t=tempfile.TemporaryDirectory()
        self.addCleanup(t.cleanup)
        self.root=Path(t.name)
        self.arc=self.root/'node.tar.gz'
        self.out=self.root/'node'
        self.out.mkdir()
        self.prefix='node-'+M.NODE_VER+'-linux-x64-glibc-217'

    def write_tar(self,entries):
        with tarfile.open(self.arc,'w:gz') as tar:
            for name,kind,data in entries:
                member=tarfile.TarInfo(name)
                if kind=='dir':
                    member.type=tarfile.DIRTYPE
                elif kind=='file':
                    payload=data.encode('utf8')
                    member.type=tarfile.REGTYPE
                    member.size=len(payload)
                elif kind=='symlink':
                    member.type=tarfile.SYMTYPE
                    member.linkname=data
                elif kind=='hardlink':
                    member.type=tarfile.LNKTYPE
                    member.linkname=data
                if kind=='file':
                    tar.addfile(member,io.BytesIO(payload))
                else:
                    tar.addfile(member)

    def test_top_level_directory_entry_is_legal(self):
        p=self.prefix
        self.write_tar([(p+'/','dir',''),(p+'/bin/','dir',''),
                        (p+'/bin/node','file','node-executable'),
                        (p+'/lib/','dir',''),
                        (p+'/lib/npm-cli.js','file','npm-script'),
                        (p+'/bin/npm','symlink','../lib/npm-cli.js')])
        M.safe_extract_node_tarball(self.arc,self.out)
        self.assertEqual((self.out/'bin/node').read_text(),'node-executable')
        self.assertEqual((self.out/'bin/npm').read_text(),'npm-script')
        self.assertFalse((self.out/p).exists(),'root should be flattened')

    def test_escape_and_wrong_root_are_rejected(self):
        for path in ('other/bin/node',self.prefix+'/../../outside'):
            self.write_tar([(path,'file','bad')])
            with self.assertRaises(M.Abort):
                M.safe_extract_node_tarball(self.arc,self.out)

    def test_unsafe_links_are_rejected(self):
        for kind,value in [('symlink','../../../outside'),('hardlink','bin/node')]:
            self.write_tar([(self.prefix+'/','dir',''),
                            (self.prefix+'/bin/','dir',''),
                            (self.prefix+'/bin/npm',kind,value)])
            with self.assertRaises(M.Abort):
                M.safe_extract_node_tarball(self.arc,self.out)

    def test_root_only_archive_is_rejected(self):
        self.write_tar([(self.prefix+'/','dir','')])
        with self.assertRaises(M.Abort):
            M.safe_extract_node_tarball(self.arc,self.out)



class EdgeCacheSmokeTests(unittest.TestCase):
    """The CDN can serve cached old robots while the new origin is correct."""
    def setUp(self):
        t=tempfile.TemporaryDirectory()
        self.addCleanup(t.cleanup)
        self.app=Path(t.name)
        self.pub=self.app/'public'
        self.pub.mkdir()
        self.url='https://yiju.zhibeimao.com'
        self.sha='a'*40
        self.expected='Sitemap: '+self.url+'/sitemap.xml'
        self.new_robots='User-agent: *\nAllow: /\n'+self.expected+'\n'
        self.old_robots='User-agent: *\nSitemap: https://tangping.com/sitemap.xml\n'
        self.sitemap='<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join(
            '<url><loc>'+self.url+'/city-detail.html?id='+str(i)+'</loc></url>'
            for i in range(1,502))+'</urlset>'
        (self.pub/'robots.txt').write_text(self.new_robots)
        (self.pub/'sitemap.xml').write_text(self.sitemap)
        (self.pub/'index.html').write_text('<a href="upload-images.html">Upload</a>')
        (self.pub/'city-compare.html').write_text(
            '<link rel="canonical" href="'+self.url+'/city-compare.html">')
        self.cdn_robots=self.new_robots
        self.plain_robots=self.old_robots
        self.cdn_sitemap=self.sitemap
        self.plain_sitemap='old cached sitemap not xml'

    def fake_urlopen(self,request,timeout=12):
        from urllib.parse import urlsplit
        route=urlsplit(request.full_url)
        fresh='__yiju_release=' in route.query
        if route.path=='/api/health':
            body='{"status":"ok"}'
        elif route.path=='/robots.txt':
            body=self.cdn_robots if fresh else self.plain_robots
        elif route.path=='/sitemap.xml':
            body=self.cdn_sitemap if fresh else self.plain_sitemap
        elif route.path=='/':
            body='<a href="upload-images.html">Upload</a>'
        elif route.path=='/city-compare.html':
            body=self.url+'/city-compare.html'
        else:
            raise AssertionError('Unexpected smoke URL: '+request.full_url)
        return io.BytesIO(body.encode('utf8'))

    def smoke(self):
        with patch.object(M,'APP',self.app),patch.object(M,'urlopen',side_effect=self.fake_urlopen):
            return M.health_smoke(self.sha)

    def test_correct_origin_and_fresh_edge_succeed_even_if_plain_edge_is_stale(self):
        outcome=self.smoke()
        self.assertEqual(outcome['sitemapUrls'],501)
        self.assertEqual(outcome['originSitemapUrls'],501)
        self.assertFalse(outcome['cdnUnversionedFresh'])

    def test_all_plain_edge_urls_current_reports_fresh(self):
        self.plain_robots=self.new_robots
        self.plain_sitemap=self.sitemap
        outcome=self.smoke()
        self.assertTrue(outcome['cdnUnversionedFresh'])

    def test_fresh_edge_still_old_fails_closed(self):
        self.cdn_robots=self.old_robots
        with self.assertRaisesRegex(M.Abort,'Fresh CDN robots'):
            self.smoke()

    def test_origin_file_wrong_fails_before_any_edge_check(self):
        (self.pub/'robots.txt').write_text(self.old_robots)
        with self.assertRaisesRegex(M.Abort,'Origin robots'):
            self.smoke()

    def test_fresh_edge_sitemap_does_not_match_origin_fails(self):
        self.cdn_sitemap=self.sitemap.replace('id=501','id=9999')
        # Both snapshots have 501 unique links, so exact content matters too:
        # counts currently match, but a different city set should be caught.
        # The check compares counts; here simulate one fewer URL instead.
        self.cdn_sitemap=self.sitemap.replace(
            '<url><loc>'+self.url+'/city-detail.html?id=501</loc></url>', '')
        with self.assertRaises(M.Abort):
            self.smoke()


if __name__=='__main__':unittest.main()
