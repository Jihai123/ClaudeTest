// City data management: audited, source-backed, single-field changes.
// No change is applied until an administrator explicitly approves it.
const express = require('express');
const db = require('../models/database');
const { verifyToken, verifyAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken, verifyAdmin);

// Scores, rankings, city identity and tags remain read-only in this initial release.
// Optional columns are enabled only if present on the deployed database.
const FIELD_DEFINITIONS = Object.freeze({
  avg_rent: { table: 'cities', label: '月租金（元）', type: 'number', min: 1, max: 1000000 },
  house_price: { table: 'cities', label: '房价（原字段单位）', type: 'number', min: 0, max: 10000000000 },
  avg_temp: { table: 'cities', label: '年平均气温（℃）', type: 'number', min: -90, max: 65 },
  population: { table: 'cities', label: '人口（原字段单位）', type: 'number', min: 0, max: 2000000000 },
  gdp: { table: 'cities', label: 'GDP（原字段单位）', type: 'number', min: 0, max: 1000000000000 },
  area: { table: 'cities', label: '面积（原字段单位）', type: 'number', min: 0, max: 100000000 },
  altitude: { table: 'cities', label: '海拔（米）', type: 'number', min: -500, max: 9000 },
  distance_to_sea: { table: 'cities', label: '距海距离（原字段单位）', type: 'number', min: 0, max: 50000 },
  climate: { table: 'cities', label: '气候描述', type: 'text', maxLength: 100 },
  climate_desc: { table: 'cities', label: '气候详情', type: 'text', maxLength: 1000 },
  slogan: { table: 'cities', label: '城市一句话', type: 'text', maxLength: 200 },
  location_intro: { table: 'cities', label: '位置介绍', type: 'text', maxLength: 2000 },
  key_points: { table: 'cities', label: '关键特点', type: 'text', maxLength: 1500 },
  evaluation: { table: 'cities', label: '城市评价', type: 'text', maxLength: 4000 },
  notes: { table: 'cities', label: '备注', type: 'text', maxLength: 2000 },
  medical: { table: 'city_dimensions', label: '医疗文字信息', type: 'text', maxLength: 100 },
  transportation: { table: 'city_dimensions', label: '交通文字信息', type: 'text', maxLength: 100 },
  internet: { table: 'city_dimensions', label: '网络文字信息', type: 'text', maxLength: 100 },
  education: { table: 'city_dimensions', label: '教育文字信息', type: 'text', maxLength: 100 },
  actual_level: { table: 'city_dimensions', label: '实际等级说明', type: 'text', maxLength: 100 }
});

let availableFields = new Map();
let writeQueue = Promise.resolve();

function error(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function normalizeValue(field, value) {
  const def = FIELD_DEFINITIONS[field];
  if (!def) throw error(400, '不支持修改此字段');
  if (value === null || value === '') return null;
  if (def.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) ||
        value < def.min || value > def.max) {
      throw error(400, def.label + '应为有效范围内的数字');
    }
    return value;
  }
  if (typeof value !== 'string' || value.trim().length > def.maxLength ||
      value.length > def.maxLength) {
    throw error(400, def.label + '文字过长或格式错误');
  }
  return value.trim() || null;
}

function decodeValue(value) {
  return JSON.parse(value);
}

function equalValues(a, b) {
  return (a == null && b == null) || (a === b);
}

function validSource(url, date, note) {
  if (typeof url !== 'string' || url.length > 1000) throw error(400, '需要来源网址');
  let parsed;
  try { parsed = new URL(url); } catch (_) { throw error(400, '来源网址无效'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname ||
      parsed.username || parsed.password ||
      /^(localhost|.*\.local|127\..*|10\..*|192\.168\..*|172\.(1[6-9]|2[0-9]|3[01])\..*|\[?::1\]?)$/i.test(parsed.hostname)) {
    throw error(400, '来源必须是公开 HTTPS 网页');
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date + 'T00:00:00Z')) ||
      new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date ||
      date > new Date().toISOString().slice(0, 10)) {
    throw error(400, '来源统计日期不正确');
  }
  if (typeof note !== 'string' || note.trim().length < 5 || note.length > 1000) {
    throw error(400, '请填写来源核验说明（至少5字）');
  }
}

async function initCityDataManagement() {
  await db.run(
    'CREATE TABLE IF NOT EXISTS city_data_change_requests (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
      'city_id INTEGER NOT NULL, field TEXT NOT NULL, ' +
      'old_value_json TEXT NOT NULL, new_value_json TEXT NOT NULL, ' +
      'source_url TEXT NOT NULL, source_date TEXT NOT NULL, source_note TEXT NOT NULL, ' +
      "status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','rolled_back')), " +
      'requested_by INTEGER NOT NULL, reviewed_by INTEGER, reviewed_at TEXT, ' +
      'source_verified_by INTEGER, source_verified_at TEXT, ' +
      'rejection_reason TEXT, rolled_back_by INTEGER, rolled_back_at TEXT, ' +
      'created_at TEXT DEFAULT CURRENT_TIMESTAMP, ' +
      'FOREIGN KEY(city_id) REFERENCES cities(id))'
  );
  await db.run(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_city_change_one_pending " +
    "ON city_data_change_requests(city_id, field) WHERE status='pending'"
  );
  await db.run(
    'CREATE INDEX IF NOT EXISTS idx_city_change_status ON city_data_change_requests(status, id DESC)'
  );
  const cityColumns = await db.query('PRAGMA table_info(cities)');
  const dimColumns = await db.query('PRAGMA table_info(city_dimensions)');
  const schemas = {
    cities: new Set(cityColumns.map(x => x.name)),
    city_dimensions: new Set(dimColumns.map(x => x.name))
  };
  availableFields = new Map(Object.entries(FIELD_DEFINITIONS)
    .filter(([name, def]) => schemas[def.table].has(name)));
}

function exposedFields() {
  return [...availableFields.entries()].map(([key, def]) => ({
    key, label: def.label, type: def.type, table: def.table
  }));
}

async function cityRecord(id) {
  const city = await db.get('SELECT * FROM cities WHERE id = ?', [id]);
  if (!city) throw error(404, '城市不存在');
  const dimensions = await db.get(
    'SELECT * FROM city_dimensions WHERE city_id = ? ORDER BY id LIMIT 1', [id]
  );
  return { city, dimensions };
}

function currentValue(record, field) {
  const def = availableFields.get(field);
  if (!def) throw error(400, '字段在当前数据库中不存在');
  if (def.table === 'city_dimensions' && !record.dimensions) {
    throw error(409, '城市维度记录不存在，无法安全修改');
  }
  const raw = record[def.table === 'cities' ? 'city' : 'dimensions'][field];
  return raw == null ? null : (def.type === 'number' ? Number(raw) : String(raw));
}

function queuedTransaction(task) {
  const execute = async () => {
    await db.run('BEGIN IMMEDIATE');
    try {
      const result = await task();
      await db.run('COMMIT');
      return result;
    } catch (e) {
      try { await db.run('ROLLBACK'); } catch (rollbackError) {
        console.error('City data rollback failed:', rollbackError);
      }
      throw e;
    }
  };
  const current = writeQueue.then(execute, execute);
  writeQueue = current.catch(() => {});
  return current;
}

async function setField(cityId, field, value) {
  const def = availableFields.get(field);
  if (def.table === 'cities') {
    await db.run('UPDATE cities SET "' + field +
      '" = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [value, cityId]);
  } else {
    await db.run('UPDATE city_dimensions SET "' + field +
      '" = ?, updated_at = CURRENT_TIMESTAMP WHERE city_id = ?', [value, cityId]);
    await db.run('UPDATE cities SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [cityId]);
  }
}

function respondError(res, e) {
  if (!e.status) console.error('City data management error:', e);
  return res.status(e.status || 500).json({ error: e.status ? e.message : '城市数据操作失败' });
}

function positiveInt(raw) {
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1) throw error(400, '无效的 ID');
  return n;
}

router.get('/fields', (req, res) => res.json({
  fields: exposedFields(),
  message: '评分、排名、标签与城市身份字段只读，避免改变现有评分模型'
}));

router.get('/cities', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 80);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const page = Math.min(10000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const where = q ? ' WHERE name LIKE ? OR province LIKE ? ' : '';
    const params = q ? ['%' + q + '%', '%' + q + '%'] : [];
    const rows = await db.query(
      'SELECT id, name, province, list_type, avg_rent, overall_score, layflat_score, updated_at ' +
      'FROM cities' + where + ' ORDER BY id DESC LIMIT ? OFFSET ?',
      [...params, limit, (page - 1) * limit]
    );
    const total = await db.get('SELECT COUNT(*) AS total FROM cities' + where, params);
    res.json({ cities: rows, total: total.total, page, limit });
  } catch (e) { respondError(res, e); }
});

router.get('/cities/:id', async (req, res) => {
  try {
    const record = await cityRecord(positiveInt(req.params.id));
    const values = {};
    for (const [field] of availableFields) values[field] = currentValue(record, field);
    res.json({
      id: record.city.id, name: record.city.name, province: record.city.province,
      updated_at: record.city.updated_at, values,
      readonly_scores: {
        overall_score: record.city.overall_score,
        layflat_score: record.city.layflat_score,
        world_score: record.city.world_score,
        medical_facilities: record.dimensions && record.dimensions.medical_facilities
      }
    });
  } catch (e) { respondError(res, e); }
});

router.get('/changes', async (req, res) => {
  try {
    const status = String(req.query.status || '');
    if (status && !['pending', 'approved', 'rejected', 'rolled_back'].includes(status)) {
      throw error(400, '审核状态无效');
    }
    const cityId = req.query.city_id ? positiveInt(req.query.city_id) : null;
    const where = [];
    const params = [];
    if (status) { where.push('r.status = ?'); params.push(status); }
    if (cityId) { where.push('r.city_id = ?'); params.push(cityId); }
    const rows = await db.query(
      'SELECT r.*, c.name AS city_name FROM city_data_change_requests r ' +
      'LEFT JOIN cities c ON c.id = r.city_id ' +
      (where.length ? 'WHERE ' + where.join(' AND ') : '') +
      ' ORDER BY r.id DESC LIMIT 100', params
    );
    res.json({ changes: rows.map(r => ({
      ...r, old_value: decodeValue(r.old_value_json),
      new_value: decodeValue(r.new_value_json),
      old_value_json: undefined, new_value_json: undefined
    })) });
  } catch (e) { respondError(res, e); }
});

router.post('/changes', async (req, res) => {
  try {
    const cityId = positiveInt(req.body.city_id);
    const field = String(req.body.field || '');
    if (!availableFields.has(field)) throw error(400, '字段不在可修改范围内');
    if (!Object.prototype.hasOwnProperty.call(req.body, 'new_value')) {
      throw error(400, '缺少新值；未知数据请明确提交 null');
    }
    const newValue = normalizeValue(field, req.body.new_value);
    validSource(req.body.source_url, req.body.source_date, req.body.source_note);
    const result = await queuedTransaction(async () => {
      const record = await cityRecord(cityId);
      const oldValue = currentValue(record, field);
      if (equalValues(oldValue, newValue)) throw error(409, '新旧值相同，无需申请');
      const pending = await db.get(
        "SELECT id FROM city_data_change_requests WHERE city_id = ? AND field = ? AND status = 'pending'",
        [cityId, field]
      );
      if (pending) throw error(409, '此字段已有待审核申请');
      return db.run(
        'INSERT INTO city_data_change_requests ' +
        '(city_id, field, old_value_json, new_value_json, source_url, source_date, source_note, requested_by) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [cityId, field, JSON.stringify(oldValue), JSON.stringify(newValue),
          req.body.source_url.trim(), req.body.source_date, req.body.source_note.trim(), req.user.id]
      );
    });
    res.status(201).json({ id: result.id, status: 'pending', message: '已保存待审核变更，线上数据未修改' });
  } catch (e) { respondError(res, e); }
});

async function getChange(id) {
  const row = await db.get('SELECT * FROM city_data_change_requests WHERE id = ?', [id]);
  if (!row) throw error(404, '变更申请不存在');
  return row;
}

router.post('/changes/:id/approve', async (req, res) => {
  try {
    if (req.body.source_verified !== true) throw error(400, '必须确认已人工核实原始来源');
    const id = positiveInt(req.params.id);
    await queuedTransaction(async () => {
      const change = await getChange(id);
      if (change.status !== 'pending') throw error(409, '申请不是待审核状态');
      const record = await cityRecord(change.city_id);
      const before = currentValue(record, change.field);
      if (!equalValues(before, decodeValue(change.old_value_json))) {
        throw error(409, '线上数据已变化，请重新提交申请，禁止覆盖');
      }
      await setField(change.city_id, change.field, decodeValue(change.new_value_json));
      await db.run(
        "UPDATE city_data_change_requests SET status='approved', reviewed_by=?, " +
        'reviewed_at=CURRENT_TIMESTAMP, source_verified_by=?, source_verified_at=CURRENT_TIMESTAMP WHERE id=?',
        [req.user.id, req.user.id, id]
      );
    });
    res.json({ id, status: 'approved', message: '来源核验完成，变更已生效' });
  } catch (e) { respondError(res, e); }
});

router.post('/changes/:id/reject', async (req, res) => {
  try {
    const id = positiveInt(req.params.id);
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 4 || reason.length > 500) throw error(400, '请填写拒绝原因');
    await queuedTransaction(async () => {
      const change = await getChange(id);
      if (change.status !== 'pending') throw error(409, '申请不是待审核状态');
      await db.run(
        "UPDATE city_data_change_requests SET status='rejected', reviewed_by=?, " +
        'reviewed_at=CURRENT_TIMESTAMP, rejection_reason=? WHERE id=?',
        [req.user.id, reason, id]
      );
    });
    res.json({ id, status: 'rejected', message: '已拒绝，线上数据未修改' });
  } catch (e) { respondError(res, e); }
});

router.post('/changes/:id/rollback', async (req, res) => {
  try {
    const id = positiveInt(req.params.id);
    await queuedTransaction(async () => {
      const change = await getChange(id);
      if (change.status !== 'approved') throw error(409, '只有已生效的申请可以回滚');
      const current = currentValue(await cityRecord(change.city_id), change.field);
      if (!equalValues(current, decodeValue(change.new_value_json))) {
        throw error(409, '线上字段已被后续修改，拒绝覆盖式回滚，请人工处理');
      }
      await setField(change.city_id, change.field, decodeValue(change.old_value_json));
      await db.run(
        "UPDATE city_data_change_requests SET status='rolled_back', " +
        'rolled_back_by=?, rolled_back_at=CURRENT_TIMESTAMP WHERE id=?',
        [req.user.id, id]
      );
    });
    res.json({ id, status: 'rolled_back', message: '已回滚到审批前的字段值' });
  } catch (e) { respondError(res, e); }
});

module.exports = { router, initCityDataManagement, normalizeValue, FIELD_DEFINITIONS };
