'use strict';
// Read-only production fingerprint for the existing health endpoint.
// Exposes only the public Git commit hash, never local paths or credentials.
const {execFileSync} = require('node:child_process');
const path = require('node:path');
function getCheckedOutSha(cwd = path.resolve(__dirname, '../..')) {
  try {
    const value = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd, encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return /^[a-f0-9]{40}$/.test(value) ? value : null;
  } catch (_) {
    return null; // Never turn a missing Git binary/worktree into a health outage.
  }
}
module.exports = {getCheckedOutSha};
