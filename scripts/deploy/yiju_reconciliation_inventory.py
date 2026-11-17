#!/usr/bin/env python3
"""Capture a private CAS inventory under the existing release lock; never import data."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tarfile

APP = Path('/www/wwwroot/yijucity/ClaudeTest')
STATE = Path('/root/yiju-autodeploy')
DATA = {'data/city-competitiveness-ranking.csv',
        'server/crawlers/data_crawlers/filtered_data/city_data.json'}

def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''): h.update(block)
    return h.hexdigest()

def git(root,*args):
    return subprocess.check_output(['git','-c','core.hooksPath=/dev/null',*args],cwd=root).decode().strip('\n')

def capture(target, output):
    os.umask(0o077)
    with (STATE/'lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        # Keep the established manifest CAS before recording any replacement decision.
        spec=importlib.util.spec_from_file_location('live_runner','/root/yiju-autodeploy.py')
        runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
        runner.verify_local_drift()
        output.mkdir(mode=0o700,exist_ok=False)
        target_files=set(git(target,'ls-files','-z').split('\0'))-{''}
        live_tracked=set(git(APP,'ls-files','-z').split('\0'))-{''}
        changed=set(git(APP,'diff','--name-only','-z').split('\0'))-{''}
        untracked=set(git(APP,'ls-files','--others','--exclude-standard','-z').split('\0'))-{''}
        ignored=set(git(APP,'ls-files','--others','--ignored','--exclude-standard','-z').split('\0'))-{''}
        # Dependencies and SQLite/WAL are handled by the existing release backup.
        # Include all other private/ignored assets; never expose their contents.
        ignored={n for n in ignored if not (n.startswith('node_modules/') or
                 n.startswith('.yiju-modules-') or n.startswith('database.sqlite'))}
        successful = []
        for line in (STATE/'cron.log').read_text(errors='replace').splitlines():
            try: record=json.loads(line)
            except ValueError: continue
            if record.get('status')=='DEPLOYED': successful.append(record)
        if not successful:
            raise RuntimeError('Previous deployed SHA cannot be proven from cron history')
        inventory={'previous_deployed_sha':successful[-1]['sha'],'schema':1,'target_reference':git(target,'rev-parse','HEAD'),
                   'live_git_head':git(APP,'rev-parse','HEAD'),
                   'protected_data':{n:sha(APP/n) for n in DATA},'entries':{}}
        for name in sorted(changed|untracked|ignored|DATA):
            p=APP/name
            if p.is_symlink() or not p.is_file():
                raise RuntimeError('Non-regular production asset requires review: '+name)
            decision=('protected-data' if name in DATA else
                      'managed-code' if name in live_tracked else
                      'promote-tracked' if name in target_files else 'preserve-untracked')
            same=name in target_files and p.read_bytes()==(target/name).read_bytes()
            inventory['entries'][name]={'sha256':sha(p),'decision':decision,
                                       'equals_target':same,'size':p.stat().st_size}
        (output/'inventory.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2))
        with tarfile.open(output/'production-assets-before.tar.gz','w:gz') as arc:
            for n in sorted(inventory['entries']):
                arc.add(APP/n,arcname=n,recursive=False)
        for src in [Path('/root/yiju-autodeploy.py'),Path('/var/spool/cron/crontabs/root'),
                    STATE/'status.json',STATE/'deployed-manifest.json',
                    STATE/'production-tracked-rebased-e7f1fef.patch',
                    STATE/'production-tracked-rebased-cbee4c1d.patch']:
            shutil.copy2(src,output/src.name)
            (output/src.name).chmod(0o600)
        # Verified live DB_PATH is ./database.sqlite; use an online backup only.
        runner.backup_db(output)
        restored=output/'isolated-restored.sqlite'
        shutil.copy2(output/'database.sqlite',restored)
        with sqlite3.connect(restored) as db:
            if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
                raise RuntimeError('Isolated SQLite restoration failed')
            tables=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        for name,item in inventory['entries'].items():
            if sha(APP/name)!=item['sha256']:
                raise RuntimeError('Asset changed during capture: '+name)
        (output/'checksums.json').write_text(json.dumps({p.name:sha(p) for p in output.iterdir()
                                                        if p.is_file()},indent=2))
        print(json.dumps({'result':'PRIVATE_BASELINE_PASS','entries':len(inventory['entries']),
                          'promote_collisions':sum(v['decision']=='promote-tracked' for v in inventory['entries'].values()),
                          'preserved_assets':sum(v['decision']=='preserve-untracked' for v in inventory['entries'].values()),
                          'sqlite_tables':len(tables),'inventory_sha256':sha(output/'inventory.json'),
                          'output':str(output)}))

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--target',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    if os.geteuid()!=0:parser.error('Run as the existing deployment user')
    if args.output.parent.resolve()!=STATE.resolve():
        parser.error('Private baseline must be created inside the existing state directory')
    capture(args.target.resolve(),args.output)
