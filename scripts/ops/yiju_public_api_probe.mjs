// Read-only remote smoke report. No credentials, cookies, POST requests, or mutation.
// This is a diagnostic only: CI success and an HTTP result cannot prove a deploy SHA.
const BASE = 'https://yiju.zhibeimao.com';
const checks = [
  ['health', '/api/health'],
  ['featured', '/api/cities/hot?type=featured&limit=9'],
  ['layflat-first-page', '/api/cities?list_type=china_layflat&page=1&limit=12'],
  ['d12-tianmen', '/api/cities?search=' + encodeURIComponent('天门市') + '&limit=20'],
  ['d12-lishui', '/api/cities?search=' + encodeURIComponent('丽水市') + '&limit=20'],
  ['d12-chunan', '/api/cities?search=' + encodeURIComponent('淳安县') + '&limit=20'],
  ['d12-lishui-detail', '/api/cities/1002'],
  ['d12-chunan-detail', '/api/cities/1004'],
  ['miyun', '/api/cities/955'],
  ['d13-baoji-layflat', '/api/cities/970'],
  ['d13-baoji-general', '/api/cities/1343'],
  ['d14-zhangye-detail', '/api/cities/951'],
  ['facts', '/city-official-facts-2025.json'],
  ['homepage-js', '/city-evidence-explorer.js'],
  ['homepage-js-fresh', '/city-evidence-explorer.js?v=20261121-d14'],
  ['homepage-html', '/'],
  ['robots', '/robots.txt'],
  ['sitemap', '/sitemap.xml'],
  ['candidate-ankang', '/api/cities?search=' + encodeURIComponent('安康') + '&limit=20'],
  ['candidate-weihai', '/api/cities?search=' + encodeURIComponent('威海') + '&limit=30'],
  ['candidate-weihai-detail', '/api/cities/9'],
  ['candidate-shuangyashan', '/api/cities?search=' + encodeURIComponent('双鸭山市') + '&limit=30'],
  ['candidate-shuangyashan-detail', '/api/cities/898'],
  ['checklist-html', '/city-living-checklist.html'],
  ['detail-html', '/city-detail.html'],
  ['compare-html', '/city-compare.html'],
  ['recommend-html', '/recommend.html']
];
async function inspect([label, path]) {
  // Separate a stale CDN response from a not-yet-deployed origin without mutation.
  // Only D12 exact-city and published-facts evidence uses a unique query cache key.
  const cacheBusted = label.startsWith('d12-') || label.startsWith('d13-') || label.startsWith('d14-') || label === 'facts' || label === 'homepage-html' || label === 'homepage-js-fresh';
  const url = BASE + path + (cacheBusted ? (path.includes('?') ? '&' : '?') +
    'audit_probe=' + Date.now() : '');
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json,text/plain,application/xml,*/*',
        'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(8000)
    });
    const body = await response.text();
    if (!response.ok) {
      return { label, http: response.status, ok: false, bytes: body.length };
    }
    if (['health', 'featured', 'layflat-first-page', 'miyun', 'facts'].includes(label)) {
      const json = JSON.parse(body);
      if (label === 'health') return { label, http: response.status, status: json.status,
        serverTimestamp: json.timestamp ?? null,
        measuredAt: new Date().toISOString(),
        releaseSha: json.release_sha ?? null,
        shaIs40Hex: typeof json.release_sha === 'string' && json.release_sha.length === 40 &&
          [...json.release_sha].every(ch => '0123456789abcdef'.includes(ch)) };
      if (label === 'featured' || label === 'layflat-first-page') {
        const rows = Array.isArray(json.cities) ? json.cities : [];
        const held = new Set([1023, 1087, 1013, 1016, 1017]);
        const hasTag = (city, key) => (city.tags || []).some(t => t && t.tag_key === key);
        return {
          label, http: response.status, count: rows.length,
          heldIdsPresent: label === 'featured' ? rows.filter(c => held.has(c.id)).map(c => c.id) : null,
          climateConflictCityIds: rows.filter(c => hasTag(c, 'warm') && hasTag(c, 'cold')).map(c => c.id),
          unsupportedLowRentTagCityIds: rows.filter(c => hasTag(c, 'low_rent')).map(c => c.id),
          nullRents: rows.filter(c => c.avg_rent === null || c.avg_rent === undefined).length,
          medicalZeroNeedsSourceCheck: label === 'layflat-first-page'
            ? rows.filter(c => c.medical_facilities === 0).length : null,
          paginationTotal: label === 'layflat-first-page' ? json.pagination?.total ?? null : null
        };
      }
      if (label === 'miyun') {
        const city = json.city || json;
        return { label, http: response.status, id: city.id,
          officialFactCount: city.official_facts?.facts?.length ?? null };
      }
      const hegang=(json.cities||[]).find(c=>c.id===897);
      const metrics=Object.fromEntries((hegang?.facts||[]).map(f=>[f.key,f.value]));
      const ids=[943,1061,1079,939,917,972,1216,1212,1214,1210];
      const enriched=(json.cities||[]).filter(c=>ids.includes(c.id)&&c.facts?.length===5);
      return { label, http: response.status, enrichedD11Cities:enriched.length,
        enrichedD11Facts:enriched.reduce((n,c)=>n+c.facts.length,0), cityCount: json.cities?.length ?? null,
        factCount: (json.cities || []).reduce((n,c) => n + (c.facts?.length || 0), 0),
        miyunExists: Boolean((json.cities || []).find(c => c.id === 955)),
        ankangFactCount: (json.cities || []).find(c => c.id === 1449)?.facts?.length ?? null,
        hegangFactCount: hegang?.facts?.length ?? null,
        chunanFactCount: (json.cities || []).find(c => c.id === 1004)?.facts?.length ?? null,
        zhangyeFactCount: (json.cities || []).find(c => c.id === 951)?.facts?.length ?? null,
        baojiFactCount: (json.cities || []).find(c => c.id === 970)?.facts?.length ?? null,
        baojiAliasIds: (json.cities || []).find(c => c.id === 970)?.city_ids ?? null,
        zhangyeHasNewOfficialFacts: ['hospital_count_2025', 'community_eldercare_facilities_2025_count', 'annual_precipitation_2025_mm'].every(key =>
          (json.cities || []).find(c => c.id === 951)?.facts?.some(f => f.key === key)),
        hegang2025Evidence: {
          urbanIncomeCny: metrics.urban_disposable_income_2025_cny ?? null,
          ruralIncomeCny: metrics.rural_disposable_income_2025_cny ?? null,
          newJobs: metrics.new_urban_jobs_2025_count ?? null,
          goodAirDaysPct: metrics.air_quality_good_days_2025_pct ?? null
        } };
    }
    if (label === 'candidate-weihai-detail' || label === 'candidate-shuangyashan-detail') {
      const city = JSON.parse(body);
      return {label, http: response.status, id: city.id, name: city.name,
        imagesCount: Array.isArray(city.images) ? city.images.length : null,
        approvedPhotoCount: Array.isArray(city.images) ? city.images.filter(x => x.status === 'approved').length : null,
        licensedFallback: Boolean(city.licensed_photo),
        officialFactCount: city.official_facts?.facts?.length ?? null};
    }
    if (label === 'd14-zhangye-detail') {
      const city = JSON.parse(body);
      const facts = city.official_facts;
      const metric = key => facts?.facts?.find(f => f.key === key)?.value ?? null;
      return { label, http: response.status, id: city.id, name: city.name,
        officialFactCount: facts?.facts?.length ?? null,
        sourceURL: facts?.sources?.[0]?.url ?? null,
        urbanizationRate2025: metric('urbanization_rate_2025_pct'),
        ruralConsumption2025: metric('rural_consumption_2025_cny'),
        insuredMedical2025: metric('medical_insurance_insured_2025_ten_thousand'),
        airportPassenger2025: metric('airport_passenger_trips_2025_ten_thousand'),
        sunshineHours2025: metric('annual_sunshine_hours_2025_h') };
    }
    if (label.startsWith('d13-baoji-')) {
      const city = JSON.parse(body);
      const facts = city.official_facts;
      const metric = key => facts?.facts?.find(f => f.key === key)?.value ?? null;
      return {label, http: response.status, id: city.id, name: city.name,
        officialFactCount: facts?.facts?.length ?? null,
        sourceURL: facts?.sources?.[0]?.url ?? null,
        hospitalCount: metric('hospital_count_2025'),
        eldercareBeds: metric('eldercare_beds_2025_count'),
        airQualityGoodDays: metric('urban_good_air_days_2025_count')};
    }
    if (label === 'd12-lishui-detail' || label === 'd12-chunan-detail') {
      const city = JSON.parse(body);
      return { label, http: response.status, id: city.id,
        hasDisputedCoastalTag: (city.tags || []).some(t => t.tag_key === 'coastal'),
        officialFactCount: city.official_facts?.facts?.length ?? null,
        qualityNote: city.public_data_quality_note ?? null };
    }
    if (label.startsWith('d12-')) {
      const targetIds = { 'd12-tianmen':1076, 'd12-lishui':1002, 'd12-chunan':1004 };
      const json = JSON.parse(body);
      const row=(json.cities || []).find(c=>c.id===targetIds[label]);
      return {label,http:response.status,targetFound:Boolean(row),id:row?.id ?? null,
        district:row?.district ?? null,evaluation:row?.evaluation ?? null,
        slogan:row?.slogan ?? null,hasDisputedCoastalTag:(row?.tags || []).some(t=>t.tag_key==='coastal'),
        hasLake:row?.has_lake ?? null,
        qualityNote:row?.public_data_quality_note ?? null};
    }
    if (label === 'candidate-ankang' || label === 'candidate-weihai' || label === 'candidate-shuangyashan') {
      const json = JSON.parse(body);
      const rows = (json.cities || []).map(c => ({
        id: c.id, name: c.name, province: c.province, list_type: c.list_type,
        sourcedFacts: c.official_facts_summary?.count ?? null
      }));
      return { label, http: response.status,
        total: json.pagination?.total ?? null, matches: rows };
    }
    if (label === 'checklist-html') return { label, http: response.status,
      hasLocalPersistence: body.includes('yiju.checklist.items.v2:'),
      hasCityLinkPrefill: body.includes('new URLSearchParams(location.search)'),
      hasPolicySource: body.includes('nhsa.gov.cn/art/2026/5/27/art_104_20751.html'),
      bytes: body.length };
    if (label === 'detail-html') return {label,http:response.status,
      hasUnverifiedRentSuppression:body.includes('租金：暂无可核实的当地房源样本'),
      hasStructuredNoPrice:body.includes('"priceRange": null'),bytes:body.length};
    if (label === 'compare-html') return {label,http:response.status,
      hasUnverifiedRentSuppression:body.includes('历史租金未确认样本和统计口径'),
      stillHasCheapestRentClaim:body.includes('isBestRent'),bytes:body.length};
    if (label === 'recommend-html') {
      const clause=(body.match(/case 'low':([\s\S]*?)break;/)||[])[1]||'';
      return {label,http:response.status,
        lowBudgetNoLegacyRentSort:clause.includes("sort', 'overall_score'")&&!clause.includes("sort', 'avg_rent'"),
        bytes:body.length};
    }
    if (label === 'homepage-js' || label === 'homepage-js-fresh') return { label, http: response.status,
      hasRotation: body.includes('rotateFeaturedCities'),
      hasChecklistDeepLink: body.includes('city-living-checklist.html?city='),
      hasEvidenceSearch: body.includes("search.addEventListener('input'"),
      hasMobilityFilter: body.includes('mobility: ['),
      bytes: body.length };
    if (label === 'homepage-html') return { label, http: response.status,
      hasFreshScriptVersion: body.includes('city-evidence-explorer.js?v=20261121-d14'),
      hasEvidenceSearchInput: body.includes('id="evidenceExplorerSearch"'),
      hasMobilityTab: body.includes('data-evidence-group="mobility"'),
      bytes: body.length };
    if (label === 'robots') {
      const lines = body.replaceAll(String.fromCharCode(13), '').split(String.fromCharCode(10));
      const baiduIndex = lines.findIndex(x => x.trim().toLowerCase() === 'user-agent: baiduspider');
      return { label, http: response.status,
        hasBaiduspider: baiduIndex >= 0,
        managedBaiduDisallow: baiduIndex >= 0 &&
          lines.slice(baiduIndex + 1, baiduIndex + 4).some(x => x.trim() === 'Disallow: /'),
        hasCorrectSitemap: body.includes('Sitemap: https://yiju.zhibeimao.com/sitemap.xml'),
        firstLines: lines.slice(0, 24).join(' | ').slice(0, 700), bytes: body.length };
    }
    if (label === 'sitemap') {
      const after = body.split('city-detail.html?id=951</loc>')[1] || '';
      const lastmod = after.split('<lastmod>')[1]?.split('</lastmod>')[0]?.trim() || null;
      const afterWeihai = body.split('city-detail.html?id=9</loc>')[1] || '';
      const weihaiLastmod = afterWeihai.split('<lastmod>')[1]?.split('</lastmod>')[0]?.trim() || null;
      return {label, http: response.status,
        hasCityDetail: body.includes('city-detail.html?id='),
        weihai9Lastmod: weihaiLastmod,
        zhangye951Lastmod: lastmod,
        bytes: body.length };
    }
    return { label, http: response.status,
      hasCityDetail: body.includes('city-detail.html?id='), bytes: body.length };
  } catch (error) {
    return { label, ok: false, error: String(error?.cause?.code || error?.name || error) };
  }
}
const results = await Promise.all(checks.map(inspect));
for (const result of results) console.log('YIJU_PUBLIC_SNAPSHOT ' + JSON.stringify(result));
console.log('YIJU_PUBLIC_SNAPSHOT_SUMMARY ' + JSON.stringify({
  checkedAt: new Date().toISOString(),
  successResponses: results.filter(r => r.http === 200).length,
  attempted: checks.length,
  note: 'External read-only snapshot; does not establish production SHA or browser interaction'
}));
