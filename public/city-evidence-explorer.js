/* First-visit city evidence explorer. Static public data, no invented prices or rankings. */
(() => {
  'use strict';
  const root = document.getElementById('evidenceExplorer');
  if (!root) return;
  const cards = root.querySelector('#evidenceExplorerCards');
  const counter = root.querySelector('#evidenceExplorerCounter');
  const more = root.querySelector('#evidenceExplorerMore');
  const onlySaved = root.querySelector('#evidenceExplorerSavedOnly');
  const savedKey = 'yiju.evidence.saved.v1';
  const groups = {
    all: [],
    income: ['urban_disposable_income_2025_cny', 'rural_disposable_income_2025_cny',
      'urban_consumption_2025_cny', 'urban_housing_consumption_2025_cny', 'per_capita_gdp_2025_cny'],
    care: ['hospital_count_2025', 'hospitals_2025_count', 'tertiary_hospitals_2025_count',
      'tier_3a_hospitals_2025_count', 'health_institutions_2025_count',
      'medical_health_institutions_count', 'eldercare_beds_2025_count',
      'eldercare_beds_2025_ten_thousand', 'eldercare_institutions_2025_count',
      'eldercare_institutions_2025_count', 'community_daycare_centers_2025_count'],
    environment: ['urban_good_air_days_2025_pct', 'good_air_days_excluding_dust_2025_pct',
      'pm25_annual_mean_2025_ug_m3', 'annual_avg_temperature_2025_c',
      'urban_rail_transit_length_2025_km', 'rail_transit_length_2025_km',
      'rail_passenger_trips_2025_ten_thousand', 'park_green_area_per_capita_2025_m2']
  };
  let data = [];
  let mode = 'all';
  let visibleCount = 6;
  let saved = new Set();
  try {
    const local = JSON.parse(localStorage.getItem(savedKey) || '[]');
    if (Array.isArray(local)) saved = new Set(local.filter(x => Number.isSafeInteger(x)));
  } catch (_) { /* private browsing: do not block the site */ }
  const node = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = String(value);
    return element;
  };
  const fmt = value => Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  const preferredFact = (city, group) => {
    const list = groups[group] || [];
    for (const key of list) {
      const found = city.facts.find(f => f.key === key);
      if (found) return found;
    }
    if (group !== 'all') return null;
    return city.facts.find(f => f.key === 'urban_disposable_income_2025_cny') ||
      city.facts.find(f => f.key === 'resident_population_2025_ten_thousand') ||
      city.facts.find(f => f.key === 'gdp_2025_billion_cny') ||
      city.facts[0];
  };
  const sourceFor = (city, fact) => city.sources.find(s => s.key === fact.source);
  function render() {
    const filtered = data.filter(city => {
      if (onlySaved.checked && !saved.has(city.id)) return false;
      return Boolean(preferredFact(city, mode));
    }).sort((a, b) => (mode === 'all' ?
      b.facts.length - a.facts.length : 0) || a.name.localeCompare(b.name, 'zh-CN'));
    counter.textContent = mode === 'all'
      ? '已收录 ' + data.length + ' 座有原始出处的城市；请按问题选择，不按GDP推断生活质量。'
      : '找到 ' + filtered.length + ' 座具备这一类2025年公开指标的城市；没有指标不等于表现差。';
    cards.replaceChildren();
    for (const city of filtered.slice(0, visibleCount)) {
      const fact = preferredFact(city, mode);
      const source = sourceFor(city, fact);
      const item = node('article', 'evidence-card');
      const head = node('div', 'evidence-card-head');
      const detail = node('a', 'evidence-city-name', city.name);
      detail.href = 'city-detail.html?id=' + city.city_ids[0];
      const province = node('span', 'evidence-province', city.province);
      const pin = node('button', 'evidence-save', saved.has(city.id) ? '★ 已关注' : '☆ 关注');
      pin.type = 'button';
      pin.setAttribute('aria-label', (saved.has(city.id) ? '取消关注' : '关注') + city.name);
      pin.setAttribute('aria-pressed', saved.has(city.id) ? 'true' : 'false');
      pin.addEventListener('click', () => {
        if (saved.has(city.id)) saved.delete(city.id);
        else saved.add(city.id);
        try { localStorage.setItem(savedKey, JSON.stringify([...saved])); } catch (_) {}
        render();
      });
      const cityLabel = node('div');
      cityLabel.append(detail, province);
      head.append(cityLabel, pin);
      const label = node('div', 'evidence-metric-label', fact.label + ' · 2025年');
      const value = node('div', 'evidence-metric-value', fmt(fact.value) + ' ' + fact.unit);
      const note = node('p', 'evidence-metric-note', fact.note || '请核对统计口径');
      const foot = node('div', 'evidence-card-foot');
      const count = node('span', 'evidence-source-count', city.facts.length + '项数据 · ' + city.sources.length + '处来源');
      foot.append(count);
      if (source && /^https:\/\//.test(source.url)) {
        const link = node('a', 'evidence-source-link', '看原始来源');
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        foot.append(link);
      }
      const view = node('a', 'evidence-detail-link', '查看城市资料与注意事项');
      view.href = 'city-detail.html?id=' + city.city_ids[0];
      item.append(head, label, value, note, foot, view);
      cards.append(item);
    }
    if (!filtered.length) cards.append(node('p', 'evidence-empty',
      onlySaved.checked ? '这里还没有已关注的城市，切回“全部”后点击☆关注即可。'
                        : '这一类资料尚未覆盖，不能凭空给城市打分。'));
    more.hidden = filtered.length <= visibleCount;
  }
  root.querySelectorAll('[data-evidence-group]').forEach(button => {
    button.addEventListener('click', () => {
      mode = button.dataset.evidenceGroup;
      visibleCount = 6;
      root.querySelectorAll('[data-evidence-group]').forEach(b => {
        b.classList.toggle('active', b === button);
        b.setAttribute('aria-pressed', b === button ? 'true' : 'false');
      });
      render();
    });
  });
  onlySaved.addEventListener('change', () => { visibleCount = 6; render(); });
  more.addEventListener('click', () => { visibleCount += 6; render(); });
  fetch('city-official-facts-2025.json', { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(payload => {
      if (!payload || payload.statistical_year !== 2025 || !Array.isArray(payload.cities)) {
        throw new Error('Invalid published dataset');
      }
      data = payload.cities.filter(c => c && Number.isSafeInteger(c.id) &&
        Array.isArray(c.facts) && c.facts.length && Array.isArray(c.city_ids) &&
        c.city_ids.length && Array.isArray(c.sources));
      render();
    })
    .catch(() => { counter.textContent = '公开数据暂时无法加载，可以通过下方城市榜单查看详情。';
      cards.replaceChildren(node('p', 'evidence-empty', '暂时无法读取2025年来源资料，请稍后刷新。'));
      more.hidden = true;
    });
})();
