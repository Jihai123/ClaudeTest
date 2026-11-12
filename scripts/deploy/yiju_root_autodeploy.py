#!/usr/bin/env python3
"""Yiju single-service auto pull + deploy on Ubuntu 18 / root PM2.

Only operates on the single existing PM2 app yijucity. One-time installed runner,
fixed Node22 glibc217 checksum, exact-SHA successful GitHub CI required, local
patch preserved, SQLite online backup, rollback and public smoke. Fail closed.

Requires existing private rescue backup and tracked local patch. It NEVER resets
live git, deletes untracked files, changes global Node, or touches other PM2 apps.
"""
import argparse
import datetime as datetime
import fcntl
import hashlib
import json
import os
import shlex
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time
from urllib.request import Request, urlopen
from urllib.parse import urlencode
import xml.etree.ElementTree as ET

APP = Path('/www/wwwroot/yijucity/ClaudeTest')
BRANCH = 'claude/livable-cities-ranking-0112UFYCzLLMXat6n8Tjc83c'
REPO = 'Jihai123/ClaudeTest'
RESCUE = Path('/root/yiju-rescue-20261112T011822Z-34044')
STATE = Path('/root/yiju-autodeploy')
NODE_DIR = Path('/opt/yiju-node22')
NODE_VER = 'v22.23.4'
TARBALL = f'node-{NODE_VER}-linux-x64-glibc-217.tar.gz'
NODE_SHA256 = 'd78ff597c40339cd3f40c7f33abe7a46a16c30899c3323a90263e4f028acf870'
ALLOWED_ORIGINS = {'https://github.com/Jihai123/ClaudeTest.git',
                   'https://github.com/Jihai123/ClaudeTest',
                   'git@github.com:Jihai123/ClaudeTest.git'}
SERVICE = 'yijucity'
BASE = 'https://yiju.zhibeimao.com'


class Abort(Exception):
    pass


def run(args, cwd=None, env=None, timeout=240, check=True):
    p = subprocess.run(args, cwd=str(cwd) if cwd else None, env=env,
                       universal_newlines=True, encoding='utf-8', errors='replace', stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                       timeout=timeout)
    if check and p.returncode:
        # Never echo subprocess stderr which may include secrets.
        raise Abort('Command failed: ' + ' '.join(args[:3]))
    return p


def git(*args, cwd=APP, check=True):
    return run(['git', '-c', 'core.hooksPath=/dev/null', *args], cwd=cwd, check=check)


def api_json(url):
    req = Request(url, headers={'User-Agent':'YijuAutoDeploy/1.0',
                                'Accept':'application/vnd.github+json'})
    with urlopen(req, timeout=20) as f:
        return json.load(f)


def sha256_file(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
    return h.hexdigest()


def write_state(obj):
    obj={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(), **obj}
    tmp=STATE/'status.tmp'; tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2))
    os.replace(tmp,STATE/'status.json')
    print(json.dumps(obj,ensure_ascii=False),flush=True)


def checks():
    if os.geteuid()!=0: raise Abort('Run as the existing root PM2 user')
    if run(['git','--version']).returncode: raise Abort('Git unavailable')
    if git('remote','get-url','origin').stdout.strip() not in ALLOWED_ORIGINS:
        raise Abort('Unexpected git origin')
    if git('symbolic-ref','--short','HEAD').stdout.strip()!=BRANCH:
        raise Abort('Unexpected git branch')
    if not APP.is_dir() or not RESCUE.is_dir():
        raise Abort('Expected live app or verified rescue directory missing')
    if not (RESCUE/'production-tracked.patch').is_file():
        raise Abort('Verified original production patch missing')
    if not (RESCUE/'untracked-files.tar.gz').is_file():
        raise Abort('Untracked file backup missing')
    if not (RESCUE/'production.sqlite').is_file():
        raise Abort('SQLite backup missing')
    p=pm2()
    if p['pm2_env'].get('status')!='online':
        raise Abort('yijucity is not currently online')
    if Path(p['pm2_env']['pm_exec_path']).resolve()!=APP/'server.js':
        raise Abort('PM2 script path changed')
    if p['pm2_env'].get('exec_mode','fork_mode') not in ('fork_mode','fork'):
        raise Abort('Only single fork mode PM2 supported')
    if (RESCUE/'summary.json').is_file():
        s=json.loads((RESCUE/'summary.json').read_text())
        if sha256_file(RESCUE/'production-tracked.patch') != s['patch_sha256']:
            raise Abort('Local override patch changed since backup')
        if not (STATE/'deployed-manifest.json').is_file():
            live_diff=git('diff','--binary','HEAD').stdout.encode('utf-8')
            if hashlib.sha256(live_diff).hexdigest()!=s['patch_sha256']:
                raise Abort('Live tracked changes differ from rescue patch; refusing first deployment')
    return p


def pm2():
    arr=json.loads(run(['pm2','jlist'],timeout=30).stdout)
    apps=[x for x in arr if x.get('name')==SERVICE]
    if len(apps)!=1: raise Abort('Expected exactly one PM2 yijucity app')
    return apps[0]


def safe_extract_node_tarball(archive, directory):
    """Extract a pinned, SHA-256-checked Node archive with a single root.

    Allow its legitimate top-level directory entry, but reject hardlinks,
    special files, sibling roots, traversal and escaping symlinks. This is
    compatible with Python 3.6 on Ubuntu 18.
    """
    expected='node-'+NODE_VER+'-linux-x64-glibc-217'
    dest=directory.resolve()
    members=[]
    with tarfile.open(archive,'r:gz') as tar:
        for member in tar.getmembers():
            raw=member.name
            parts=Path(raw).parts
            if raw.startswith('/') or '..' in parts or not parts or parts[0]!=expected:
                raise Abort('Unexpected member in Node archive')
            if len(parts)==1:
                if not member.isdir():
                    raise Abort('Unexpected member in Node archive')
                continue
            if not (member.isfile() or member.isdir() or member.issym()):
                raise Abort('Unexpected member in Node archive')
            member.name='/'.join(parts[1:])
            out=(dest/member.name).resolve()
            if not str(out).startswith(str(dest)+'/'):
                raise Abort('Archive path traversal blocked')
            if member.issym():
                if member.linkname.startswith('/'):
                    raise Abort('Archive symlink escapes Node directory')
                symlink_target=out.parent.joinpath(member.linkname).resolve()
                if not str(symlink_target).startswith(str(dest)+'/'):
                    raise Abort('Archive symlink escapes Node directory')
            members.append(member)
        if not members:
            raise Abort('Empty Node archive')
        if sys.version_info >= (3,12):
            tar.extractall(directory, members=members, filter='data')
        else:
            tar.extractall(directory, members=members)


def ensure_node():
    executable=NODE_DIR/'bin/node'
    if executable.is_file() and run([str(executable),'-v']).stdout.strip()==NODE_VER:
        return
    # Pin a community glibc2.17 build; official x64 builds require newer glibc.
    if run(['uname','-m']).stdout.strip()!='x86_64': raise Abort('Unsupported CPU for pinned Node binary')
    if NODE_DIR.exists(): raise Abort('Node path already occupied by another install')
    STATE.mkdir(parents=True,exist_ok=True,mode=0o700)
    target=STATE/TARBALL
    url=f'https://unofficial-builds.nodejs.org/download/release/{NODE_VER}/{TARBALL}'
    with urlopen(Request(url,headers={'User-Agent':'YijuAutoDeploy/1.0'}),timeout=90) as src, open(target,'wb') as dest:
        shutil.copyfileobj(src,dest)
    if sha256_file(target)!=NODE_SHA256: raise Abort('Pinned Node22 checksum mismatch')
    NODE_DIR.mkdir(parents=True,exist_ok=False,mode=0o755)
    try:
        # The official-style archive contains an entry for its top-level
        # directory, e.g. "node-v22.../". Path.parts has length 1 for it.
        # This is valid, not an attacker path; skip extracting just that root.
        safe_extract_node_tarball(target, NODE_DIR)
        if run([str(executable),'-v']).stdout.strip()!=NODE_VER:
            raise Abort('Node22 binary failed to start on host')
    except Exception:
        shutil.rmtree(NODE_DIR,ignore_errors=True)
        raise


def release_gate(sha):
    q=urlencode({'head_sha':sha,'event':'push','per_page':'20'})
    url=f'https://api.github.com/repos/{REPO}/actions/workflows/yiju-release-gate.yml/runs?{q}'
    j=api_json(url)
    matches=[r for r in j.get('workflow_runs',[]) if r.get('head_sha')==sha
             and r.get('event')=='push' and r.get('head_branch')==BRANCH]
    if not matches:return False
    latest=max(matches,key=lambda x:(x.get('run_attempt',1),x.get('id',0)))
    return latest.get('status')=='completed' and latest.get('conclusion')=='success'


def stage_release(sha):
    # Git 2.17-compatible separate worktree; live checkout stays dirty and untouched.
    work=Path(tempfile.mkdtemp(prefix='staging-',dir=STATE))/'src'
    git('worktree','add','--detach',str(work),sha)
    patch=RESCUE/'production-tracked.patch'
    if patch.stat().st_size:
        p=run(['git','apply','--3way','--index',str(patch)],cwd=work,check=False)
        if p.returncode:raise Abort('Local 13-file patch conflicted with upstream; production untouched')
    # Detect newly tracked file paths colliding with the archived untracked files.
    tracked={x for x in git('ls-files','-z',cwd=work).stdout.split('\0') if x}
    with tarfile.open(RESCUE/'untracked-files.tar.gz','r:gz') as arc:
        members={m.name.lstrip('./') for m in arc.getmembers() if m.isfile()}
        if tracked.intersection(members):raise Abort('New Git files collide with existing untracked assets')
    return work,tracked


def test_stage(work):
    env=dict(os.environ)
    env['PATH']=str(NODE_DIR/'bin')+':'+env.get('PATH','')
    env['NODE_ENV']='test'
    run(['npm','ci','--no-audit','--no-fund'],cwd=work,env=env,timeout=600)
    run(['npm','run','test:city-data'],cwd=work,env=env,timeout=240)
    run(['npm','run','test:city-data:sqlite'],cwd=work,env=env,timeout=360)
    for file in ('tests_js/seo-sitemap.test.js','tests_js/seo-live-links.test.js','tests_js/layflat-pagination.test.js'):
        run(['node','--test',file],cwd=work,env=env,timeout=120)


def require_sqlite_online_backup():
    """Never run production deployment with a Python sqlite3 lacking online backup."""
    connection = sqlite3.connect(':memory:')
    try:
        if not callable(getattr(connection, 'backup', None)):
            raise Abort('Python interpreter ' + sys.executable +
                        ' lacks sqlite3.Connection.backup (requires Python 3.7+); '
                        'use a verified newer Python interpreter and re-install the cron entry')
    finally:
        connection.close()


def backup_db(directory):
    db=APP/'database.sqlite'
    if not db.is_file() or db.stat().st_size<4096:raise Abort('Live SQLite database path missing')
    clone=directory/'database.sqlite'
    s=sqlite3.connect('file:'+str(db)+'?mode=ro',uri=True,timeout=30)
    d=sqlite3.connect(str(clone),timeout=30)
    try:s.backup(d,pages=100,sleep=.1)
    finally:s.close();d.close()
    with sqlite3.connect(clone) as c:
        if c.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise Abort('SQLite backup corrupt')
    clone.chmod(0o600)


def backup_code(directory,tracked):
    missing=[]
    with tarfile.open(directory/'tracked-old.tar.gz','w:gz') as arc:
        for name in sorted(tracked):
            path=APP/name
            if path.is_symlink():raise Abort('Live tracked file symlink; manual review required: '+name)
            if path.is_file():arc.add(path,arcname=name,recursive=False)
            elif path.exists():raise Abort('Non-file blocks Git path: '+name)
            else:missing.append(name)
    (directory/'missing-before.json').write_text(json.dumps(missing))


def copy_code(stage,tracked):
    for name in sorted(tracked):
        src=stage/name;dst=APP/name
        if src.is_symlink():raise Abort('Git-managed symlink requires review: '+name)
        if not src.is_file():raise Abort('Missing staged Git file: '+name)
        dst.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(src,dst)
        if Path(name).parts[0] == 'public':
            # Git worktree checkout under umask 077 leaves static files at 0600.
            # Nginx serves APP/public as an unprivileged worker, not root.
            # Change permissions ONLY for tracked public web assets, not source,
            # database, .env, existing untracked files or backup directories.
            current = APP / 'public'
            while True:
                if current.is_symlink() or not current.is_dir():
                    raise Abort('Unsafe public static directory: ' + str(current))
                current.chmod(0o755)
                if current == dst.parent:
                    break
                relative = dst.parent.relative_to(current)
                current = current / relative.parts[0]
            dst.chmod(0o644)



def restore_code(directory,tracked):
    for name in json.loads((directory/'missing-before.json').read_text()):
        path=APP/name
        if path.is_file():path.unlink()
    with tarfile.open(directory/'tracked-old.tar.gz','r:gz') as arc:
        if sys.version_info >= (3,12): arc.extractall(APP,filter='data')
        else: arc.extractall(APP)


def sitemap_urls(payload):
    xml=ET.fromstring(payload)
    urls=[el.text for el in xml.findall('.//{*}loc')]
    if len(urls)<500 or len(set(urls))!=len(urls):
        raise Abort('Sitemap missing city URLs or contains duplicates')
    return len(urls)


def health_smoke(target):
    """Hard gate: deployed origin files + public application health.

    Cloudflare may independently inject or cache robots.txt and sitemap.xml,
    even for SHA-qualified requests. CDN SEO status is audited and reported as
    pending, not mistaken for an application rollback condition.
    """
    if not isinstance(target,str) or len(target)!=40 or any(c not in '0123456789abcdef' for c in target):
        raise Abort('Invalid release SHA for smoke')

    def load(route):
        with urlopen(Request(BASE+route,headers={
            'User-Agent':'YijuReleaseCheck/3.0',
            'Cache-Control':'no-cache',
            'Pragma':'no-cache'
        }),timeout=12) as res:
            return res.read()

    expected='Sitemap: https://yiju.zhibeimao.com/sitemap.xml'
    # Nginx static document root confirmed on the actual host:
    # /www/wwwroot/yijucity/ClaudeTest/public
    origin=APP/'public'
    local_robots=(origin/'robots.txt').read_text(encoding='utf8')
    if expected not in local_robots or 'tangping.com' in local_robots:
        raise Abort('Origin robots.txt is not the new version')
    origin_urls=sitemap_urls((origin/'sitemap.xml').read_bytes())
    if 'href="upload-images.html"' not in (origin/'index.html').read_text(encoding='utf8'):
        raise Abort('Origin homepage still has dead upload link')
    if 'https://yiju.zhibeimao.com/city-compare.html' not in (origin/'city-compare.html').read_text(encoding='utf8'):
        raise Abort('Origin compare canonical not fixed')

    # Root can read mode-0600 files, but the unprivileged Nginx worker cannot.
    # Reject a deployment that would appear healthy to root while hiding pages.
    public_root = APP / 'public'
    if not (public_root.stat().st_mode & 0o001):
        raise Abort('Origin public static directory is not traversable by Nginx')
    for asset in ('robots.txt', 'sitemap.xml', 'index.html',
                  'city-compare.html', 'verified-city-facts.html'):
        path = public_root / asset
        if path.is_file() and not (path.stat().st_mode & 0o004):
            raise Abort('Origin static file not readable by Nginx: ' + asset)

    # Public, externally routed API health is critical for working business
    # features. A failure here still triggers full code/PM2 rollback.
    health=json.loads(load('/api/health'))
    if health.get('status')!='ok':
        raise Abort('Public health endpoint not responding')

    def probe(path, check):
        try:
            return bool(check(load(path)))
        except Exception:
            return False

    def robots_ok(data):
        robot=data.decode('utf8')
        return expected in robot and 'Sitemap: https://tangping.com' not in robot

    def sitemap_ok(data):
        return sitemap_urls(data)==origin_urls

    def homepage_ok(data):
        return 'href="upload-images.html"' in data.decode('utf8')

    def compare_ok(data):
        return 'https://yiju.zhibeimao.com/city-compare.html' in data.decode('utf8')

    cache_key='?__yiju_release='+target
    cdn={
        'robotsFresh':probe('/robots.txt'+cache_key,robots_ok),
        'sitemapFresh':probe('/sitemap.xml'+cache_key,sitemap_ok),
        'homepageFresh':probe('/'+cache_key,homepage_ok),
        'compareFresh':probe('/city-compare.html'+cache_key,compare_ok),
        'robotsPublic':probe('/robots.txt',robots_ok),
        'sitemapPublic':probe('/sitemap.xml',sitemap_ok),
    }
    pending=[name for name,ok in cdn.items() if not ok]
    if pending:
        print('CDN_PENDING: externally served paths need independent Cloudflare/origin review: '+
              ','.join(pending),flush=True)

    return {
        'sitemapUrls':origin_urls,
        'originSitemapUrls':origin_urls,
        'publicAppHealth':True,
        'cdnUnversionedFresh':cdn['robotsPublic'] and cdn['sitemapPublic'],
        'cdnCacheBustedFresh':all(cdn[name] for name in
            ('robotsFresh','sitemapFresh','homepageFresh','compareFresh')),
        'cdnChecks':cdn,
        'cdnPendingPaths':pending,
    }

def ensure_free_space():
    if shutil.disk_usage(APP).free<2*1024**3:
        raise Abort('Less than 2GiB free, cannot preserve rollback')



def verify_local_drift():
    manifest = STATE / 'deployed-manifest.json'
    if not manifest.is_file(): return
    expected = json.loads(manifest.read_text(encoding='utf-8'))
    for name, digest in expected.items():
        path = APP / name
        if not path.is_file() or sha256_file(path) != digest:
            raise Abort('Deployed tracked file has new local edits; refusing to overwrite: ' + name)


def save_local_manifest(tracked):
    expected = {}
    for name in sorted(tracked):
        path = APP / name
        if not path.is_file(): raise Abort('Missing tracked file after deployment: ' + name)
        expected[name] = sha256_file(path)
    temp = STATE / 'deployed-manifest.tmp'
    temp.write_text(json.dumps(expected, ensure_ascii=False), encoding='utf-8')
    os.replace(temp, STATE / 'deployed-manifest.json')


def run_deploy(target, old, checks_done):
    if not checks_done: checks()
    verify_local_drift()
    ensure_free_space()
    stage = None
    try:
        stage, tracked = stage_release(target)
        test_stage(stage)
        backup = STATE / ('backup-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S'))
        backup.mkdir(mode=0o700)
        backup_db(backup)
        backup_code(backup, tracked)
        # Keep the old modules and files recoverable, and prepare new ones before downtime.
        next_modules = APP / '.yiju-modules-next'
        if next_modules.exists(): raise Abort('Pending modules directory already exists')
        shutil.copytree(stage / 'node_modules', next_modules, symlinks=True)
        old_pm = pm2()['pm2_env'].get('exec_interpreter', 'node')
        (backup / 'previous-interpreter.txt').write_text(old_pm)
        modules_old = backup / 'node_modules'
        changed = False
        try:
            run(['pm2', 'stop', SERVICE], timeout=50)
            changed = True
            if (APP / 'node_modules').is_dir():
                shutil.move(str(APP / 'node_modules'), str(modules_old))
            shutil.move(str(next_modules), str(APP / 'node_modules'))
            copy_code(stage, tracked)
            run(['pm2', 'restart', SERVICE, '--interpreter', str(NODE_DIR / 'bin/node'), '--update-env'], timeout=70)
            interpreter = pm2()['pm2_env'].get('exec_interpreter', '')
            if interpreter != str(NODE_DIR / 'bin/node'):
                raise Abort('PM2 interpreter did not switch to isolated Node22')
            failure = None
            for _ in range(3):
                time.sleep(4)
                try:
                    smoke = health_smoke(target)
                    failure = None
                    break
                except Exception as exc:
                    failure = exc
            if failure is not None: raise failure
            save_local_manifest(tracked)
            write_state({'status':'DEPLOYED', 'sha':target, 'previous':old,
                         'backup':str(backup), 'sitemap_urls':smoke['sitemapUrls'], 'cdn':smoke})
        except Exception as exc:
            if changed:
                try:
                    run(['pm2', 'stop', SERVICE], timeout=40, check=False)
                    restore_code(backup, tracked)
                    if (APP / 'node_modules').is_dir(): shutil.rmtree(APP / 'node_modules')
                    if modules_old.is_dir(): shutil.move(str(modules_old), str(APP / 'node_modules'))
                    run(['pm2', 'restart', SERVICE, '--interpreter', old_pm, '--update-env'], timeout=70)
                except Exception as rollback_exc:
                    write_state({'status':'FAILED_ROLLBACK', 'sha':target,
                                 'error':str(exc), 'rollback_error':str(rollback_exc)})
                    raise
            write_state({'status':'ROLLED_BACK', 'sha':target, 'error':str(exc)})
            raise
        finally:
            if next_modules.exists(): shutil.rmtree(next_modules, ignore_errors=True)
    finally:
        if stage is not None:
            try: git('worktree', 'remove', '--force', str(stage))
            except Exception: pass
            # Remove only our generated staging directory, not any live checkout.
            if stage.parent.parent == STATE:
                shutil.rmtree(stage.parent, ignore_errors=True)


def one_cycle():
    require_sqlite_online_backup()
    checks()
    ensure_node()
    git('fetch','--no-tags','origin',f'refs/heads/{BRANCH}:refs/remotes/origin/{BRANCH}')
    target=git('rev-parse',f'refs/remotes/origin/{BRANCH}').stdout.strip()
    latest=json.loads((STATE/'status.json').read_text()) if (STATE/'status.json').exists() else {}
    if latest.get('status')=='DEPLOYED' and latest.get('sha')==target:
        print('UP_TO_DATE',target[:12]);return
    if latest.get('status') in ('ROLLED_BACK','FAILED_ROLLBACK','BLOCKED_SHA') and latest.get('sha')==target:
        print('BLOCKED_SHA',target[:12]);return
    if not release_gate(target):
        print('WAITING_FOR_CI',target[:12]);return
    try:
        run_deploy(target,latest.get('sha','2c34c3fc3406302514de722bd3843a97575cfdb4'),True)
    except Exception as exc:
        current=json.loads((STATE/'status.json').read_text()) if (STATE/'status.json').exists() else {}
        if current.get('status') not in ('ROLLED_BACK','FAILED_ROLLBACK'):
            write_state({'status':'BLOCKED_SHA','sha':target,'error':str(exc)})
        raise


def cron_release_line(here):
    """Pin the working Python and PM2/Node directories; cron has a minimal PATH."""
    pm2_executable = shutil.which('pm2')
    node_executable = shutil.which('node')
    if not pm2_executable or not node_executable:
        raise Abort('Cannot install cron: pm2 or node missing from current PATH')
    paths = [str(Path(pm2_executable).parent), str(Path(node_executable).parent),
             '/usr/local/sbin', '/usr/local/bin', '/usr/sbin', '/usr/bin',
             '/sbin', '/bin']
    if any(not p.startswith('/') or '\n' in p or '\r' in p or '%' in p for p in paths):
        raise Abort('Unsafe executable directory in cron PATH')
    cron_path = ':'.join(dict.fromkeys(paths))
    python_executable = str(Path(sys.executable).resolve())
    if not Path(python_executable).is_file():
        raise Abort('Python interpreter does not exist: ' + python_executable)
    return ('*/10 * * * * PATH=' + shlex.quote(cron_path) +
            ' ' + shlex.quote(python_executable) +
            ' ' + shlex.quote(str(here)) +
            ' --once >> ' + shlex.quote(str(STATE / 'cron.log')) +
            ' 2>&1 # yiju-gpt-autodeploy')


def updated_yiju_crontab(old_text, desired, here):
    """Replace only the known Yiju line; preserve every unrelated cron entry."""
    marker = '# yiju-gpt-autodeploy'
    lines = old_text.splitlines(keepends=True)
    matches = [i for i, line in enumerate(lines) if marker in line]
    if len(matches) > 1:
        raise Abort('Multiple Yiju cron entries; refusing to change crontab')
    if not matches:
        return old_text.rstrip('\n') + '\n' + desired + '\n'
    i = matches[0]
    existing = lines[i].rstrip('\r\n')
    if existing == desired:
        return old_text
    if (not existing.startswith('*/10 * * * * ') or
            str(here) + ' --once' not in existing or
            not existing.endswith(marker)):
        raise Abort('Unexpected Yiju cron command; preserving existing crontab')
    lines[i] = desired + '\n'
    return ''.join(lines)


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--install',action='store_true')
    ap.add_argument('--once',action='store_true')
    ap.add_argument('--status',action='store_true')
    a=ap.parse_args()
    os.umask(0o077)
    STATE.mkdir(mode=0o700,parents=True,exist_ok=True)
    if a.status:
        p=STATE/'status.json'; print(p.read_text() if p.exists() else 'NOT_INSTALLED');return
    if not a.install and not a.once:ap.error('Use --install or --once or --status')
    with open(STATE/'lock','w') as lk:
        try:fcntl.flock(lk,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:print('ALREADY_RUNNING');return
        one_cycle()
        if a.install:
            current=STATE/'status.json'
            if not current.is_file() or json.loads(current.read_text()).get('status')!='DEPLOYED':
                raise Abort('First successful deployment required before enabling cron')
            here=Path(__file__).resolve()
            line=cron_release_line(here)
            old=run(['crontab','-l'],check=False)
            if old.returncode not in (0,1):raise Abort('Cannot inspect crontab')
            if old.returncode==1 and 'no crontab for' not in old.stderr.lower():
                raise Abort('Crontab read failed; preserving existing jobs')
            old_text=old.stdout if old.returncode==0 else ''
            next_text=updated_yiju_crontab(old_text,line,here)
            if next_text!=old_text:
                snapshot=STATE/('crontab-before-runtime-fix-' +
                                datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.txt')
                snapshot.write_text(old_text,encoding='utf-8')
                snapshot.chmod(0o600)
                fd,tmp=tempfile.mkstemp(prefix='yiju-cron-',dir=STATE)
                with os.fdopen(fd,'w') as f:f.write(next_text)
                try:run(['crontab',tmp])
                finally:os.unlink(tmp)
            print('AUTODEPLOY_ENABLED: every 10 minutes, yijucity only')


if __name__=='__main__':
    try:main()
    except Exception as e:
        print(json.dumps({'status':'NO_GO','error':str(e)},ensure_ascii=False),file=sys.stderr)
        sys.exit(1)