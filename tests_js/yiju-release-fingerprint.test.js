const {test} = require('node:test');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const {getCheckedOutSha} = require('../server/utils/releaseFingerprint');

test('read-only health fingerprint equals the checked-out public commit', () => {
  const expected = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: root, encoding: 'utf8'
  }).trim();
  assert.match(expected, /^[a-f0-9]{40}$/);
  assert.equal(getCheckedOutSha(root), expected);
  assert.equal(getCheckedOutSha('/definitely/not/a/yiju/git/repo'), null,
    'absent Git checkout must not interrupt the health endpoint');
});

test('health API exposes only the release SHA alongside existing health fields', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(server, /status: 'ok', timestamp: new Date\(\)\.toISOString\(\), release_sha: LIVE_RELEASE_SHA/);
  const probe = fs.readFileSync(path.join(root, 'scripts/ops/yiju_public_api_probe.mjs'), 'utf8');
  assert.match(probe, /releaseSha: json\.release_sha/);
});
