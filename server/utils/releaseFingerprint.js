'use strict';
// Root deployment copies tracked files from a detached staging worktree without
// advancing the live checkout's .git HEAD. Never mistake git rev-parse HEAD for
// the deployed build. Only the existing protected deployer's DEPLOYED status is
// authoritative. Public API exposes the validated SHA only, never private paths.
const fs = require('node:fs');
const path = require('node:path');
const STATE = '/root/yiju-autodeploy/status.json';
const SHA = /^[a-f0-9]{40}$/;
function getDeployedSha(statusFile = STATE) {
  try {
    const info = fs.statSync(statusFile);
    if (!info.isFile() || info.size < 30 || info.size > 16384) return null;
    const obj = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    if (obj?.status !== 'DEPLOYED' || typeof obj.sha !== 'string' ||
        !SHA.test(obj.sha)) return null;
    // Require the same protected rollback archive the original root deployer
    // creates and verifies before writing the final DEPLOYED status.
    const backup = obj.backup;
    if (typeof backup !== 'string' ||
        !backup.startsWith('/root/yiju-autodeploy/backup-') ||
        path.dirname(backup) !== '/root/yiju-autodeploy') return null;
    if (!fs.statSync(path.join(backup, 'database.sqlite')).isFile() ||
        !fs.statSync(path.join(backup, 'tracked-old.tar.gz')).isFile()) return null;
    return obj.sha;
  } catch (_) {
    // Missing permission/status, rollback or blocked publish must not break
    // health. A null SHA is explicitly NOT a successful release attestation.
    return null;
  }
}
module.exports = {getDeployedSha};
