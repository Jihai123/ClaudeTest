const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const {getDeployedSha} = require('../server/utils/releaseFingerprint');
const target = '0123456789abcdef0123456789abcdef01234567';

test('exact live release SHA comes only from the protected success record plus rollback artifacts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yiju-release-fp-'));
  try {
    const state = path.join(dir, 'status.json');
    const backup = path.join(dir, 'backup-20261121T180000');
    fs.mkdirSync(backup);
    fs.writeFileSync(path.join(backup, 'database.sqlite'), 'fixture');
    fs.writeFileSync(path.join(backup, 'tracked-old.tar.gz'), 'fixture');
    const write = (status, sha=target, folder=backup) => fs.writeFileSync(state,
      JSON.stringify({status, sha, backup: folder, at: new Date().toISOString()}));
    write('DEPLOYED');
    assert.equal(getDeployedSha(state), target);
    for (const status of ['ROLLED_BACK', 'FAILED_ROLLBACK', 'BLOCKED_SHA', 'UP_TO_DATE']) {
      write(status);
      assert.equal(getDeployedSha(state), null, 'must fail closed on ' + status);
    }
    write('DEPLOYED', 'bad-sha');
    assert.equal(getDeployedSha(state), null);
    write('DEPLOYED', target, path.join(dir, 'outside'));
    assert.equal(getDeployedSha(state), null);
    write('DEPLOYED');
    fs.unlinkSync(path.join(backup, 'database.sqlite'));
    assert.equal(getDeployedSha(state), null, 'missing backup cannot attest success');
    fs.unlinkSync(state);
    assert.equal(getDeployedSha(state), null, 'missing private status cannot break health');
  } finally {
    fs.rmSync(dir, {recursive:true,force:true});
  }
});

test('health maintains prior contract and resolves the real deployment state dynamically', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(server, /status: 'ok', timestamp: new Date\(\)\.toISOString\(\), release_sha: getDeployedSha\(\)/);
  assert.doesNotMatch(server, /LIVE_RELEASE_SHA|git rev-parse HEAD/);
  const helper = fs.readFileSync(path.join(root, 'server/utils/releaseFingerprint.js'), 'utf8');
  assert.match(helper, /\/root\/yiju-autodeploy\/status\.json/);
  assert.doesNotMatch(helper, /execFileSync|git.*rev-parse/);
  const probe = fs.readFileSync(path.join(root, 'scripts/ops/yiju_public_api_probe.mjs'), 'utf8');
  assert.match(probe, /hasReleaseShaField: Object\.prototype\.hasOwnProperty\.call\(json, 'release_sha'\)/);
});
