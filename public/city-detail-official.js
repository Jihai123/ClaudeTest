/* Source-linked city facts and photo credit. Public city API is the source of
 * truth for this view. This module never edits the legacy ranking fields. */
(function () {
  'use strict';
  function make(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = String(value);
    return node;
  }
  function safeSource(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
    } catch (err) { return null; }
  }
  function link(url, text) {
    const a = make('a', '', text);
    const safe = safeSource(url);
    if (safe) a.href = safe;
    else a.removeAttribute('href');
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }
  function factText(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '暂无';
    return new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 2}).format(value);
  }

  function renderOfficialFacts(city) {
    const box = document.getElementById('officialFactsSection');
    if (!box) return;
    const body = document.getElementById('officialFactsBody');
    body.replaceChildren();
    box.style.display = 'none';
    const facts = city && city.official_facts;
    if (!facts || !Array.isArray(facts.facts) || !facts.facts.length) return;
    const sources = new Map((facts.sources || []).map(s => [s.key, s]));
    const header = document.getElementById('cityMeta');
    if (header && !header.querySelector('.official-data-meta')) {
      header.appendChild(make('div', 'meta-item official-data-meta',
        '📚 2025年有源城市数据：' + facts.facts.length + '项'));
    }
    document.getElementById('officialFactsCount').textContent =
      facts.facts.length + '项 · ' + facts.statistical_year + '年';
    const intro = make('p', 'official-intro');
    intro.textContent = facts.focus || '按官方统计口径核对';
    body.appendChild(intro);
    const alias = facts.alias_note;
    if (alias) body.appendChild(make('p', 'official-alias-note', alias));
    const grid = make('div', 'official-facts-grid');
    for (const fact of facts.facts) {
      if (typeof fact.label !== 'string' || !sources.has(fact.source)) continue;
      const card = make('article', 'official-fact-card');
      card.appendChild(make('span', 'official-fact-category', fact.category));
      card.appendChild(make('div', 'official-fact-label', fact.label));
      const number = make('div', 'official-fact-number');
      number.appendChild(document.createTextNode(factText(fact.value)));
      number.appendChild(make('span', 'official-fact-unit', fact.unit || ''));
      card.appendChild(number);
      if (fact.note) card.appendChild(make('p', 'official-fact-note', fact.note));
      const src = sources.get(fact.source);
      const srcLink = link(src.url, '原始来源 · ' + (src.date || facts.statistical_year));
      srcLink.className = 'official-fact-source';
      card.appendChild(srcLink);
      grid.appendChild(card);
    }
    if (!grid.children.length) return;
    body.appendChild(grid);
    if (facts.tip) body.appendChild(make('p', 'official-field-tip', '实地核对建议：' + facts.tip));
    const sourceDetails = make('details', 'official-source-details');
    sourceDetails.appendChild(make('summary', '', '查看原始资料与来源说明'));
    const list = make('ul', '');
    for (const source of (facts.sources || [])) {
      const li = make('li', '');
      li.appendChild(link(source.url, source.title || '公开来源'));
      li.appendChild(make('span', '', ' · ' + (source.date || '未记录日期')));
      list.appendChild(li);
    }
    sourceDetails.appendChild(list);
    if (facts.source_level === 'official_bulletin_reprint') {
      sourceDetails.appendChild(make('p', 'official-source-caveat',
        '本条来源是官方统计公报的媒体转载；建议复核原始发布机构及后续修订。'));
    }
    body.appendChild(sourceDetails);
    body.appendChild(make('p', 'official-integrity-note',
      '这些是带年份、单位和来源的市级统计事实；与本站原有排名、评分、租金估值分开，不等于已更新旧字段。部分统计值会后续修订，具体以发布机关为准。'));
    box.style.display = '';
  }

  function renderLicensedPhoto(city) {
    const host = document.getElementById('licensedPhotoFallback');
    if (!host) return;
    host.replaceChildren();
    host.style.display = 'none';
    const p = city && city.licensed_photo;
    if (!p || (city.images && city.images.length)) return;
    const image = safeSource(p.image_url);
    if (!image || !safeSource(p.source_url) || !safeSource(p.license_url)) return;

    const figure = make('figure', 'licensed-photo');
    const photo = make('img', '', '');
    photo.src = image;
    photo.alt = (p.caption || city.name + '城市风景') +
      '；图片：' + (p.author || '未知作者') + '，' + (p.license || '');
    photo.loading = 'lazy';
    photo.decoding = 'async';
    const credit = make('figcaption', '');
    credit.appendChild(document.createTextNode((p.caption || '城市摄影') + ' · 摄影：'));
    credit.appendChild(link(p.source_url, p.author || 'Wikimedia Commons作者'));
    credit.appendChild(document.createTextNode(' · '));
    credit.appendChild(link(p.license_url, p.license || '查看许可证'));
    credit.appendChild(document.createTextNode(
      ' · 来源：Wikimedia Commons · 未裁剪或编辑原作（直接展示源文件）'));
    figure.appendChild(photo);
    figure.appendChild(credit);
    photo.addEventListener('error', function () {
      host.replaceChildren();
      host.style.display = 'none';
      const upload = document.getElementById('uploadPrompt');
      if (upload) upload.style.display = 'block';
    });
    host.appendChild(figure);
    host.style.display = '';
    const uploadPrompt = document.getElementById('uploadPrompt');
    if (uploadPrompt) uploadPrompt.style.display = 'none';
    const uploadLink = document.getElementById('uploadLinkWithImages');
    if (uploadLink) {
      uploadLink.style.display = 'inline-block';
      const id = encodeURIComponent(String(city.id));
      uploadLink.href = 'upload-images.html?cityId=' + id +
        '&cityName=' + encodeURIComponent(city.name || '') +
        '&returnUrl=' + encodeURIComponent('city-detail.html?id=' + id);
    }
  }

  window.renderOfficialCityFacts = renderOfficialFacts;
  window.renderLicensedCityPhoto = renderLicensedPhoto;
})();
