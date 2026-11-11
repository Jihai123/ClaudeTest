// GPT-hosted Yiju operations bridge: read city data and submit source-backed candidates.
// This router has no admin JWT, publishing, approval, rollback or score-editing path.
// The long-lived API credential is stored only as SHA-256 in the server environment.
const express = require('express');
const crypto = require('crypto');
const db = require('../models/database');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const cityData = require('./city-data-management');

const router = express.Router();
const adminRouter = express.Router();
const ALLOWED_TYPES = new Set(['government', 'research', 'housing_market', 'media', 'community', 'other']);
const PROPOSAL_TYPES = new Set(['government', 'research', 'housing_market']);
const MAX_BODY_CHARS = 6000;
const AUTO_FIELDS = new Set(['slogan', 'location_intro', 'key_points', 'notes']);
function autoPolicy() {
  const enabled = process.env.YIJU_AGENT_AUTO_APPLY === 'true';
  const count = Number(process.env.YIJU_AGENT_AUTO_APPLY_DAILY_LIMIT || '10');
  return { enabled, fields: [...AUTO_FIELDS],
    daily_limit: Number.isInteger(count) && count >= 1 && count <= 100 ? count : 10,
    requires: 'two independent government source domains matching city and metric value' };
}
function governmentAuthority(sourceUrl) {
  const host = new URL(sourceUrl).hostname.toLowerCase();
  const parts = host.split('.');
  if (parts.length < 3 || parts.slice(-2).join('.') !== 'gov.cn') return null;
  return parts.slice(-3).join('.');
}
function containsMetric(text, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  // Compare complete numeric tokens: 11391, -1391 and 1391.5 do not attest 1391.
  const tokens = String(text || '').replace(/−/g, '-').match(
    /[+-]?(?:\d{1,3}(?:[,，]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/g
  ) || [];
  return tokens.some(token => Number(token.replace(/[,，]/g, '')) === value);
}
async function canAutoApply(body) {
  const policy = autoPolicy();
  if (!body.proposal?.auto_apply || !policy.enabled || !AUTO_FIELDS.has(body.proposal.field) ||
    body.source_access !== 'fetched' || !body.source_excerpt || !body.observation_period ||
    !containsMetric(body.source_excerpt, body.metric_value) ||
    !containsMetric(body.proposal.new_value, body.metric_value) ||
    /[<>]|javascript:|data:/i.test(body.proposal.new_value) ||
    body.source_type !== 'government' || typeof body.proposal.new_value !== 'string' ||
    body.proposal.new_value.length < 18 || !governmentAuthority(body.source_url)) {
    return { allowed: false, reason: 'not eligible for autonomous update' };
  }
  const sources = await db.query(
    'SELECT source_url,metric_value_json,source_access,source_excerpt,source_date,' +
    'scope_name,observation_period,metric_unit FROM city_agent_evidence ' +
    "WHERE city_id=? AND metric_key=? AND source_type='government' " +
    'AND metric_value_json=? ORDER BY id DESC LIMIT 50',
    [body.city_id, body.metric_key, JSON.stringify(body.metric_value)]
  );
  const authority = governmentAuthority(body.source_url);
  const independent = sources.find(row =>
    row.source_access === 'fetched' && row.source_excerpt &&
    row.scope_name === body.scope_name &&
    row.observation_period === body.observation_period &&
    row.metric_unit === body.metric_unit &&
    containsMetric(row.source_excerpt, body.metric_value) &&
    governmentAuthority(row.source_url) &&
    governmentAuthority(row.source_url) !== authority
  );
  if (!independent) return { allowed: false, reason: 'missing independent government corroboration' };
  const today = await db.get(
    "SELECT COUNT(*) AS total FROM city_data_change_requests " +
    "WHERE reviewed_by=0 AND reviewed_at >= date('now')"
  );
  if (Number(today?.total || 0) >= policy.daily_limit) {
    return { allowed: false, reason: 'daily autonomous update limit reached' };
  }
  return { allowed: true, reason: 'corroborated by independent government source' };
}


function failure(code, message) {
  const e = new Error(message);
  e.status = code;
  return e;
}
function replyError(res, e) {
  if (!e.status) console.error('Agent city intake failed:', e);
  res.status(e.status || 500).json({ error: e.status ? e.message : '申请处理失败' });
}
function apiKeyAuth(req, res, next) {
  const expected = (process.env.YIJU_AGENT_API_KEY_SHA256 || '').trim().toLowerCase();
  const found = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(req.get('authorization') || '');
  if (!/^[0-9a-f]{64}$/.test(expected)) {
    return res.status(503).json({ error: 'Agent 接口未启用' });
  }
  if (!found) return res.status(401).json({ error: 'Agent 认证失败' });
  const digest = crypto.createHash('sha256').update(found[1], 'utf8').digest();
  if (!crypto.timingSafeEqual(digest, Buffer.from(expected, 'hex'))) {
    return res.status(401).json({ error: 'Agent 认证失败' });
  }
  next();
}
router.use(apiKeyAuth);
router.use((req, res, next) => {
  if (req.method === 'POST' && JSON.stringify(req.body || {}).length > MAX_BODY_CHARS) {
    return res.status(413).json({ error: '单次提交过大' });
  }
  next();
});

function boundedString(value, name, min, max) {
  if (typeof value !== 'string') throw failure(400, name + '必须是字符串');
  const text = value.trim();
  if (text.length < min || text.length > max) throw failure(400, name + '长度无效');
  return text;
}
function allowedKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw failure(400, label + '格式错误');
  }
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) throw failure(400, label + '包含不允许的字段：' + key);
  }
}
function externalId(value) {
  const s = boundedString(value, 'external_id', 8, 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,119}$/.test(s)) throw failure(400, 'external_id格式错误');
  return s;
}
function cityId(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw failure(400, 'city_id必须为正整数');
  return value;
}
function normalizeSubmission(input) {
  allowedKeys(input, new Set(['external_id', 'city_id', 'scope_name', 'source_url',
    'source_date', 'source_note', 'source_type', 'source_access', 'source_excerpt',
    'observation_period', 'metric_key', 'metric_value',
    'metric_unit', 'proposal']), '提交');
  const data = {
    external_id: externalId(input.external_id),
    city_id: cityId(input.city_id),
    scope_name: boundedString(input.scope_name, 'scope_name', 2, 100),
    source_url: input.source_url,
    source_date: input.source_date,
    source_note: boundedString(input.source_note, 'source_note', 10, 1000),
    source_type: boundedString(input.source_type, 'source_type', 3, 30),
    source_access: input.source_access === undefined ? 'search_only' :
      boundedString(input.source_access, 'source_access', 6, 20),
    source_excerpt: input.source_excerpt === undefined ? null :
      boundedString(input.source_excerpt, 'source_excerpt', 15, 800),
    observation_period: input.observation_period === undefined ? null :
      boundedString(input.observation_period, 'observation_period', 4, 40),
    metric_key: boundedString(input.metric_key, 'metric_key', 2, 80),
    metric_value: input.metric_value,
    metric_unit: boundedString(input.metric_unit, 'metric_unit', 1, 30),
    proposal: null
  };
  if (!ALLOWED_TYPES.has(data.source_type)) throw failure(400, 'source_type不受支持');
  if (!['fetched', 'search_only'].includes(data.source_access)) {
    throw failure(400, 'source_access不受支持');
  }
  if (data.source_access === 'fetched' && !data.source_excerpt) {
    throw failure(400, '读取原文后必须提供原文证据片段');
  }
  if (!/^[a-z][a-z0-9_]{1,79}$/.test(data.metric_key)) throw failure(400, 'metric_key只能使用小写英文和下划线');
  if (!Object.prototype.hasOwnProperty.call(input, 'metric_value') ||
      !(data.metric_value === null ||
        (typeof data.metric_value === 'number' && Number.isFinite(data.metric_value)) ||
        (typeof data.metric_value === 'string' && data.metric_value.length <= 300))) {
    throw failure(400, 'metric_value必须为数字、短文本或null');
  }
  cityData.validSource(data.source_url, data.source_date, data.source_note);
  if (input.proposal !== undefined && input.proposal !== null) {
    allowedKeys(input.proposal, new Set(['field', 'new_value', 'expected_old_value', 'conversion_note', 'auto_apply']), 'proposal');
    if (data.source_access !== 'fetched') {
      throw failure(400, '只有已读取原文并提供证据片段的来源才能提出字段修改');
    }
    if (!PROPOSAL_TYPES.has(data.source_type)) {
      throw failure(400, '自媒体或居民讨论只能入证据库，不能直接提出字段修改申请');
    }
    const field = boundedString(input.proposal.field, 'proposal.field', 2, 80);
    if (!cityData.getAvailableFields().has(field)) throw failure(400, '目标字段不在允许修改范围内');
    if (!Object.prototype.hasOwnProperty.call(input.proposal, 'new_value') ||
        !Object.prototype.hasOwnProperty.call(input.proposal, 'expected_old_value')) {
      throw failure(400, '必须同时包含新值和预览旧值');
    }
    data.proposal = {
      field,
      new_value: cityData.normalizeValue(field, input.proposal.new_value),
      expected_old_value: cityData.normalizeValue(field, input.proposal.expected_old_value),
      conversion_note: boundedString(input.proposal.conversion_note, 'conversion_note', 10, 300),
      auto_apply: input.proposal.auto_apply === true
    };
    if (input.proposal.auto_apply !== undefined && typeof input.proposal.auto_apply !== 'boolean') {
      throw failure(400, 'auto_apply必须是boolean');
    }
    if (data.proposal.new_value === data.proposal.expected_old_value) {
      throw failure(409, '新旧值一致，无需修改');
    }
  }
  return data;
}

function resultRow(row, replayed = false) {
  return {
    external_id: row.external_id,
    evidence_id: row.id,
    city_id: row.city_id,
    change_request_id: row.change_request_id || null,
    submission_status: row.change_request_id ?
      (row.change_status === 'approved' ? 'approved' :
       row.change_status === 'pending' ? 'pending_manual_review' : 'reviewed') : 'evidence_only',
    review_status: row.change_status || null,
    replayed,
    created_at: row.created_at
  };
}
async function fetchSubmission(id) {
  return db.get(
    'SELECT e.*, r.status AS change_status FROM city_agent_evidence e ' +
    'LEFT JOIN city_data_change_requests r ON r.id = e.change_request_id ' +
    'WHERE e.external_id = ?', [id]
  );
}
async function initAgentCityBridge() {
  await db.run(
    'CREATE TABLE IF NOT EXISTS city_agent_evidence (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
      'external_id TEXT NOT NULL UNIQUE, payload_hash TEXT NOT NULL, ' +
      'city_id INTEGER NOT NULL, scope_name TEXT NOT NULL, ' +
      'source_url TEXT NOT NULL, source_date TEXT NOT NULL, source_note TEXT NOT NULL, ' +
      'source_type TEXT NOT NULL, source_access TEXT NOT NULL, source_excerpt TEXT, ' +
      'observation_period TEXT, metric_key TEXT NOT NULL, ' +
      'metric_value_json TEXT NOT NULL, metric_unit TEXT NOT NULL, ' +
      'suggested_field TEXT, expected_old_value_json TEXT, proposed_value_json TEXT, ' +
      'conversion_note TEXT, change_request_id INTEGER UNIQUE, ' +
      'created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
      'FOREIGN KEY(city_id) REFERENCES cities(id), ' +
      'FOREIGN KEY(change_request_id) REFERENCES city_data_change_requests(id))'
  );
  await db.run('CREATE INDEX IF NOT EXISTS idx_city_agent_evidence_city ' +
    'ON city_agent_evidence(city_id, id DESC)');
}

router.get('/fields', (req, res) => res.json({
  autonomy: autoPolicy(),
  fields: [...cityData.getAvailableFields()].map(([key, d]) => ({
    key, label: d.label, type: d.type
  })),
  readonly: ['overall_score', 'layflat_score', 'world_score', 'medical_facilities',
    'tags', 'ranking', 'city_identity']
}));


router.get('/cities', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (!q) throw failure(400, '请提供城市搜索关键词 q');
    const rows = await db.query(
      'SELECT id,name,province,updated_at FROM cities ' +
      'WHERE name LIKE ? OR province LIKE ? ORDER BY id DESC LIMIT 30',
      ['%' + q + '%', '%' + q + '%']
    );
    res.json({ cities: rows });
  } catch (e) { replyError(res, e); }
});

router.get('/cities/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const record = await cityData.cityRecord(cityId(id));
    const values = {};
    for (const [field] of cityData.getAvailableFields()) {
      values[field] = cityData.currentValue(record, field);
    }
    res.json({
      city_id: record.city.id, name: record.city.name,
      province: record.city.province, updated_at: record.city.updated_at, values
    });
  } catch (e) { replyError(res, e); }
});

router.get('/submissions/:external_id', async (req, res) => {
  try {
    const row = await fetchSubmission(externalId(req.params.external_id));
    if (!row) throw failure(404, '未找到提交记录');
    res.json(resultRow(row));
  } catch (e) { replyError(res, e); }
});

async function submitSubmission(req, res) {
  try {
    const body = normalizeSubmission(req.body);
    const payloadHash = crypto.createHash('sha256')
      .update(JSON.stringify(body), 'utf8').digest('hex');
    const outcome = await cityData.queuedTransaction(async () => {
      const previous = await fetchSubmission(body.external_id);
      if (previous) {
        if (previous.payload_hash !== payloadHash) {
          throw failure(409, 'external_id已经用于其他内容，请勿覆盖原申请');
        }
        return { existing: true, row: previous };
      }
      const record = await cityData.cityRecord(body.city_id);
      let old = null;
      let proposed = null;
      let autonomous = { allowed: false, reason: 'no proposal' };
      if (body.proposal) {
        if (body.scope_name !== record.city.name) {
          throw failure(400, '来源行政辖区与目标城市不一致，只允许保存证据，不允许提字段变更');
        }
        old = cityData.currentValue(record, body.proposal.field);
        proposed = body.proposal.new_value;
        if (old !== body.proposal.expected_old_value) {
          throw failure(409, '线上旧值已变化，请重新读取城市数据再提交');
        }
        if (old === proposed) throw failure(409, '新旧值相同');
        const pending = await db.get(
          "SELECT id FROM city_data_change_requests " +
          "WHERE city_id=? AND field=? AND status='pending'",
          [body.city_id, body.proposal.field]
        );
        if (pending) throw failure(409, '此字段已有待审核变更，禁止重复提交');
        autonomous = await canAutoApply(body);
      }
      const inserted = await db.run(
        'INSERT INTO city_agent_evidence ' +
        '(external_id,payload_hash,city_id,scope_name,source_url,source_date,source_note,' +
        'source_type,source_access,source_excerpt,observation_period,metric_key,' +
        'metric_value_json,metric_unit,suggested_field,' +
        'expected_old_value_json,proposed_value_json,conversion_note) ' +
        'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [body.external_id, payloadHash, body.city_id, body.scope_name, body.source_url,
          body.source_date, body.source_note, body.source_type, body.source_access,
          body.source_excerpt, body.observation_period, body.metric_key,
          JSON.stringify(body.metric_value), body.metric_unit,
          body.proposal ? body.proposal.field : null,
          body.proposal ? JSON.stringify(old) : null,
          body.proposal ? JSON.stringify(proposed) : null,
          body.proposal ? body.proposal.conversion_note : null]
      );
      let changeRequestId = null;
      if (body.proposal) {
        // requested_by=0 is the reserved non-human actor in v1; it cannot log in.
        // Source verification and approval are possible only via the admin JWT router.
        const change = await db.run(
          'INSERT INTO city_data_change_requests ' +
          '(city_id,field,old_value_json,new_value_json,source_url,source_date,source_note,requested_by) ' +
          'VALUES (?,?,?,?,?,?,?,?)',
          [body.city_id, body.proposal.field, JSON.stringify(old), JSON.stringify(proposed),
            body.source_url, body.source_date,
            'Agent证据#' + inserted.id + '；' + body.source_note +
            '；换算：' + body.proposal.conversion_note, 0]
        );
        changeRequestId = change.id;
        if (autonomous.allowed) {
          await cityData.setField(body.city_id, body.proposal.field, proposed, old);
          // reviewed_by=0 explicitly means automated review; source_verified_by remains NULL
          // because no human has verified the original document.
          await db.run("UPDATE city_data_change_requests SET status='approved', " +
            "reviewed_by=0, reviewed_at=CURRENT_TIMESTAMP WHERE id=?", [change.id]);
        }
        await db.run('UPDATE city_agent_evidence SET change_request_id=? WHERE id=?',
          [change.id, inserted.id]);
      }
      return { existing: false, row: {
        id: inserted.id, external_id: body.external_id, city_id: body.city_id,
        change_request_id: changeRequestId,
        change_status: changeRequestId ? (autonomous.allowed ? 'approved' : 'pending') : null,
        created_at: new Date().toISOString()
      } };
    });
    res.status(outcome.existing ? 200 : 201).json(
      resultRow(outcome.row, outcome.existing)
    );
  } catch (e) { replyError(res, e); }
}
router.post('/submissions', submitSubmission);

// The evidence inbox is available ONLY to existing human admin users.
adminRouter.use(verifyToken, verifyAdmin);
// Same evidence validation and idempotency as the Agent API, but through the
// already-authenticated admin browser. This path is strictly evidence-only:
// no proposal / no automatic approval / no city field edits / no API key exposure.
adminRouter.post('/evidence', (req, res) => {
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'proposal')) {
    return res.status(400).json({ error: '浏览器收件箱只允许归档证据，禁止提交字段变更' });
  }
  if (JSON.stringify(req.body || {}).length > MAX_BODY_CHARS) {
    return res.status(413).json({ error: '提交过大' });
  }
  return submitSubmission(req, res);
});
adminRouter.get('/evidence', async (req, res) => {
  try {
    const id = req.query.city_id ? cityId(Number(req.query.city_id)) : null;
    const rows = await db.query(
      'SELECT e.id,e.external_id,e.city_id,c.name AS city_name,e.scope_name,' +
      'e.source_url,e.source_date,e.source_type,e.source_note,e.source_access,' +
      'e.source_excerpt,e.observation_period,e.metric_key,' +
      'e.metric_value_json,e.metric_unit,e.suggested_field,e.conversion_note,' +
      'e.change_request_id,e.created_at,r.status AS change_status ' +
      'FROM city_agent_evidence e ' +
      'LEFT JOIN cities c ON c.id=e.city_id ' +
      'LEFT JOIN city_data_change_requests r ON r.id=e.change_request_id ' +
      (id ? 'WHERE e.city_id=? ' : '') + 'ORDER BY e.id DESC LIMIT 100',
      id ? [id] : []
    );
    res.json({ evidence: rows.map(r => ({
      ...r, metric_value: JSON.parse(r.metric_value_json), metric_value_json: undefined
    })) });
  } catch (e) { replyError(res, e); }
});

module.exports = { router, adminRouter, initAgentCityBridge, apiKeyAuth, normalizeSubmission };
