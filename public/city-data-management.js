/* Admin city data: proposals, manual source verification, approval and rollback.
   Built as a separate module so existing moderation tabs remain unchanged. */
(function () {
  'use strict';
  let fields = [];
  let selectedCity = null;
  let previewFingerprint = null;
  let initialized = false;

  function el(id) { return document.getElementById(id); }
  function setText(id, value) { el(id).textContent = value == null ? '' : String(value); }
  function showMessage(message, isError) {
    const node = el('cityDataMessage');
    node.textContent = message;
    node.style.color = isError ? '#b91c1c' : '#047857';
  }
  function pretty(value) {
    return value == null ? '未知（null）' : String(value);
  }
  function cell(row, value) {
    const node = document.createElement('td');
    node.textContent = pretty(value);
    row.appendChild(node);
    return node;
  }
  function tableEmpty(body, message, count) {
    const row = document.createElement('tr');
    const node = cell(row, message);
    node.colSpan = count;
    body.appendChild(row);
  }
  function request(path, options) {
    return api('/admin/city-data' + path, options || {}).then(function (result) {
      if (result && result.error) throw new Error(result.error);
      return result;
    });
  }
  function changeField() {
    previewFingerprint = null;
    el('cityDataPreview').textContent = '';
    el('cityDataPropose').disabled = true;
    const field = el('cityDataField').value;
    const def = fields.find(function (f) { return f.key === field; });
    const input = el('cityDataNewValue');
    input.value = '';
    input.placeholder = def && def.type === 'number' ? '填写数字，留空表示未知（null）' : '填写新值，留空表示未知（null）';
    if (def && def.type === 'number') {
      input.type = 'number';
      input.step = 'any';
    } else {
      input.type = 'text';
      input.removeAttribute('step');
    }
    const old = selectedCity && selectedCity.values ? selectedCity.values[field] : null;
    setText('cityDataOldValue', selectedCity ? pretty(old) : '先选择城市');
  }
  async function loadFields() {
    const data = await request('/fields');
    fields = data.fields || [];
    const selector = el('cityDataField');
    selector.replaceChildren();
    fields.forEach(function (field) {
      const option = document.createElement('option');
      option.value = field.key;
      option.textContent = field.label + ' [' + field.key + ']';
      selector.appendChild(option);
    });
    changeField();
  }
  async function searchCities() {
    try {
      const q = encodeURIComponent(el('cityDataQuery').value.trim());
      const data = await request('/cities?q=' + q + '&limit=30');
      const body = el('cityDataList');
      body.replaceChildren();
      if (!data.cities || !data.cities.length) {
        tableEmpty(body, '没有匹配的城市', 5);
        return;
      }
      data.cities.forEach(function (city) {
        const row = document.createElement('tr');
        cell(row, city.id);
        cell(row, city.name);
        cell(row, city.province);
        cell(row, city.updated_at);
        const actions = document.createElement('td');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-sm btn-primary';
        button.textContent = '查看 / 申请修改';
        button.addEventListener('click', function () { chooseCity(city.id); });
        actions.appendChild(button);
        row.appendChild(actions);
        body.appendChild(row);
      });
    } catch (error) { showMessage('城市查询失败：' + error.message, true); }
  }
  async function chooseCity(id) {
    try {
      selectedCity = await request('/cities/' + id);
      setText('cityDataSelectedCity', selectedCity.name + '（ID ' + selectedCity.id + '）');
      const scores = selectedCity.readonly_scores || {};
      setText('cityDataReadOnlyScores', '只读评分：综合 ' + pretty(scores.overall_score) +
        ' / 躺平 ' + pretty(scores.layflat_score) +
        ' / 世界 ' + pretty(scores.world_score) +
        '。本模块不会改动评分或算法。');
      changeField();
      await loadChanges();
    } catch (error) { showMessage('读取城市失败：' + error.message, true); }
  }
  function newValue() {
    const def = fields.find(function (f) { return f.key === el('cityDataField').value; });
    const raw = el('cityDataNewValue').value.trim();
    if (!raw) return null;
    if (def && def.type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error('请输入有效数字');
      return n;
    }
    return raw;
  }
  function draft() {
    if (!selectedCity) throw new Error('请先从搜索结果选择城市');
    const field = el('cityDataField').value;
    const new_value = newValue();
    if (new_value === selectedCity.values[field]) throw new Error('新旧值相同');
    const source_url = el('cityDataSourceUrl').value.trim();
    if (!/^https:\/\//i.test(source_url)) throw new Error('请填写可信的 HTTPS 来源地址');
    const source_date = el('cityDataSourceDate').value;
    const source_note = el('cityDataSourceNote').value.trim();
    if (!source_date || source_note.length < 5) throw new Error('请填写来源日期和至少5字的核验说明');
    return {
      city_id: selectedCity.id, field, new_value,
      source_url, source_date, source_note
    };
  }
  function preview() {
    try {
      const data = draft();
      previewFingerprint = JSON.stringify(data);
      const label = fields.find(function (f) { return f.key === data.field; });
      setText('cityDataPreview',
        '待审核变更（不会立即生效）\n城市：' + selectedCity.name +
        '\n字段：' + label.label +
        '\n旧值：' + pretty(selectedCity.values[data.field]) +
        '\n新值：' + pretty(data.new_value) +
        '\n来源：' + data.source_url +
        '\n数据日期：' + data.source_date +
        '\n核验说明：' + data.source_note);
      el('cityDataPropose').disabled = false;
      showMessage('预览完成；提交后需在下方人工审核才会生效。', false);
    } catch (error) {
      previewFingerprint = null;
      el('cityDataPropose').disabled = true;
      showMessage(error.message, true);
    }
  }
  async function submitProposal(event) {
    event.preventDefault();
    try {
      const data = draft();
      if (!previewFingerprint || previewFingerprint !== JSON.stringify(data)) {
        throw new Error('内容变更，请先重新预览');
      }
      const answer = await request('/changes', {
        method: 'POST', body: JSON.stringify(data)
      });
      showMessage('已创建待审核变更 #' + answer.id + '，尚未修改线上城市数据。', false);
      previewFingerprint = null;
      el('cityDataPropose').disabled = true;
      el('cityDataPreview').textContent = '';
      await loadChanges();
    } catch (error) { showMessage('提交失败：' + error.message, true); }
  }
  async function runAction(path, payload, successMessage) {
    try {
      await request(path, { method: 'POST', body: JSON.stringify(payload || {}) });
      showMessage(successMessage, false);
      if (selectedCity) {
        selectedCity = await request('/cities/' + selectedCity.id);
        changeField();
      }
      await loadChanges();
      await searchCities();
    } catch (error) { showMessage('操作失败：' + error.message, true); }
  }
  function actionButton(label, className, callback) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm ' + className;
    button.textContent = label;
    button.addEventListener('click', callback);
    return button;
  }
  async function loadChanges() {
    try {
      const status = encodeURIComponent(el('cityDataStatus').value);
      const city = el('cityDataOnlySelected').checked && selectedCity ?
        '&city_id=' + selectedCity.id : '';
      const data = await request('/changes?status=' + status + city);
      const body = el('cityDataChanges');
      body.replaceChildren();
      if (!data.changes || !data.changes.length) {
        tableEmpty(body, '暂无变更申请', 7);
        return;
      }
      data.changes.forEach(function (change) {
        const row = document.createElement('tr');
        const definition = fields.find(function (f) { return f.key === change.field; });
        cell(row, '#' + change.id + ' / ' + change.city_name);
        cell(row, definition ? definition.label : change.field);
        cell(row, pretty(change.old_value) + ' → ' + pretty(change.new_value));
        const source = document.createElement('td');
        const link = document.createElement('a');
        link.href = change.source_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = '打开原始来源';
        source.appendChild(link);
        const note = document.createElement('div');
        note.textContent = change.source_date + ' · ' + change.source_note;
        note.style.maxWidth = '260px';
        note.style.overflowWrap = 'anywhere';
        source.appendChild(note);
        row.appendChild(source);
        cell(row, change.status);
        cell(row, change.created_at);
        const action = document.createElement('td');
        if (change.status === 'pending') {
          const label = document.createElement('label');
          label.style.display = 'block';
          const checked = document.createElement('input');
          checked.type = 'checkbox';
          label.append(checked, document.createTextNode(' 已核对原始来源'));
          action.appendChild(label);
          const approve = actionButton('批准并应用', 'btn-success', function () {
            if (!checked.checked) {
              showMessage('请打开来源链接、核实原始资料，然后勾选来源已核实', true);
              return;
            }
            if (window.confirm('确认来源真实、数据日期及单位均正确，应用此单字段变更？')) {
              runAction('/changes/' + change.id + '/approve',
                { source_verified: true }, '已批准 #' + change.id + '，更新已生效');
            }
          });
          action.appendChild(approve);
          action.appendChild(actionButton('拒绝', 'btn-warning', function () {
            const reason = window.prompt('输入拒绝原因（至少4字）：');
            if (reason !== null) {
              runAction('/changes/' + change.id + '/reject',
                { reason }, '已拒绝 #' + change.id);
            }
          }));
        }
        if (change.status === 'approved') {
          action.appendChild(actionButton('回滚', 'btn-danger', function () {
            if (window.confirm('确认回滚 #' + change.id + '？若字段后来有变化，系统会拒绝覆盖。')) {
              runAction('/changes/' + change.id + '/rollback', {}, '回滚完成 #' + change.id);
            }
          }));
        }
        row.appendChild(action);
        body.appendChild(row);
      });
    } catch (error) { showMessage('加载变更记录失败：' + error.message, true); }
  }
  async function load() {
    if (!initialized) {
      initialized = true;
      try { await loadFields(); } catch (e) {
        showMessage('无法读取城市字段：' + e.message, true);
        return;
      }
    }
    await Promise.all([searchCities(), loadChanges()]);
  }

  document.addEventListener('DOMContentLoaded', function () {
    el('cityDataSearch').addEventListener('submit', function (event) {
      event.preventDefault(); searchCities();
    });
    el('cityDataField').addEventListener('change', changeField);
    ['cityDataNewValue', 'cityDataSourceUrl', 'cityDataSourceDate', 'cityDataSourceNote']
      .forEach(function (id) {
        el(id).addEventListener('input', function () {
          previewFingerprint = null;
          el('cityDataPropose').disabled = true;
          el('cityDataPreview').textContent = '';
        });
      });
    el('cityDataPreviewButton').addEventListener('click', preview);
    el('cityDataProposalForm').addEventListener('submit', submitProposal);
    el('cityDataStatus').addEventListener('change', loadChanges);
    el('cityDataOnlySelected').addEventListener('change', loadChanges);
    el('cityDataRefresh').addEventListener('click', loadChanges);
  });
  window.cityDataManagement = { load };
})();
