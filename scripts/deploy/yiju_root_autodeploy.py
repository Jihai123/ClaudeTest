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
    return p


def pm2():
    arr=json.loads(run(['pm2','jlist'],timeout=30).stdout)
    apps=[x for x in arr if x.get('name')==SERVICE]
    if len(apps)!=1: raise Abort('Expected exactly one PM2 yijucity app')
    return apps[0]


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
        # Verify no traversal entries and extract into isolated /opt only.
        with tarfile.open(target,'r:gz') as tar:
            for member in tar.getmembers():
                parts=Path(member.name).parts
                if '..' in parts or len(parts)<2 or member.isln():
                    raise Abort('Unexpected member in Node archive')
                member.name='/'.join(parts[1:])
                target=(NODE_DIR/member.name).resolve()
                if str(target)!=str(NODE_DIR) and not str(target).startswith(str(NODE_DIR)+'/'):
                    raise Abort('Archive path traversal blocked')
                if member.issym():
                    symlink_target=(NODE_DIR/member.name).parent.joinpath(member.linkname).resolve()
                    if not str(symlink_target).startswith(str(NODE_DIR)+'/'):
                        raise Abort('Archive symlink escapes Node directory')
            if sys.version_info >= (3,12):
                tar.extractall(NODE_DIR,filter='data')
            else:
                tar.extractall(NODE_DIR)
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


def restore_code(directory,tracked):
    for name in json.loads((directory/'missing-before.json').read_text()):
        path=APP/name
        if path.is_file():path.unlink()
    with tarfile.open(directory/'tracked-old.tar.gz','r:gz') as arc:
        if sys.version_info >= (3,12): arc.extractall(APP,filter='data')
        else: arc.extractall(APP)


def health_smoke():
    def load(url):
        with urlopen(Request(url,headers={'User-Agent':'YijuReleaseCheck/1.0'}),timeout=12) as res:
            return res.read()
    obj=json.loads(load(BASE+'/api/health'))
    if obj.get('status')!='ok':raise Abort('Health check failed')
    robot=load(BASE+'/robots.txt').decode('utf8')
    if 'Sitemap: https://yiju.zhibeimao.com/sitemap.xml' not in robot:
        raise Abort('Old robots still served by reverse proxy')
    xml=ET.fromstring(load(BASE+'/sitemap.xml'))
    urls=[el.text for el in xml.findall('.//{*}loc')]
    if len(urls)<500 or len(set(urls))!=len(urls):raise Abort('Sitemap not ready')
    main=load(BASE+'/').decode('utf8')
    if 'href="upload-images.html"' not in main:raise Abort('Homepage still has dead upload link')
    compare=load(BASE+'/city-compare.html').decode('utf8')
    if 'https://yiju.zhibeimao.com/city-compare.html' not in compare:
        raise Abort('Compare canonical not fixed')
    return len(urls)


def ensure_free_space():
    if shutil.disk_usage(APP).free<2*1024**3:
        raise Abort('Less than 2GiB free, cannot preserve rollback')


def run_deploy(target, old, checks_done):
    if not checks_done: checks()
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
                    public_urls = health_smoke()
                    failure = None
                    break
                except Exception as exc:
                    failure = exc
            if failure is not None: raise failure
            write_state({'status':'DEPLOYED', 'sha':target, 'previous':old,
                         'backup':str(backup), 'sitemap_urls':public_urls})
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
            marker='# yiju-gpt-autodeploy'
            line='*/10 * * * * /usr/bin/python3 '+str(here)+' --once >> '+str(STATE/'cron.log')+' 2>&1 '+marker
            old=run(['crontab','-l'],check=False)
            if old.returncode not in (0,1):raise Abort('Cannot inspect crontab')
            if old.returncode==1 and 'no crontab for' not in old.stderr.lower():
                raise Abort('Crontab read failed; preserving existing jobs')
            old_text=old.stdout if old.returncode==0 else ''
            if marker not in old_text:
                fd,tmp=tempfile.mkstemp(prefix='yiju-cron-',dir=STATE)
                with os.fdopen(fd,'w') as f:f.write(old_text.rstrip()+'\n'+line+'\n')
                try:run(['crontab',tmp])
                finally:os.unlink(tmp)
            print('AUTODEPLOY_ENABLED: every 10 minutes, yijucity only')


if __name__=='__main__':
    try:main()
    except Exception as e:
        print(json.dumps({'status':'NO_GO','error':str(e)},ensure_ascii=False),file=sys.stderr)
        sys.exit(1)