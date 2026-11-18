// Read-only remote smoke report. No credentials, cookies, POST requests, or mutation.
// This is a diagnostic only: CI success and an HTTP result cannot prove a deploy SHA.
const BASE = 'https://yiju.zhibeimao.com';
const checks = [
  ['health', '/api/health'],
  ['featured', '/api/cities/hot?type=featured&limit=9'],
  ['miyun', '/api/cities/955'],
  ['facts', '/city-official-facts-2025.json'],
  ['homepage-js', '/city-evidence-explorer.js'],
  ['homepage-js-fresh', '/city-evidence-explorer.js?v=20261118-d11'],
  ['homepage-html', '/'],
  ['robots', '/robots.txt'],
  ['sitemap', '/sitemap.xml'],
  ['candidate-ankang', '/api/cities?search=' + encodeURIComponent('安康') + '&limit=20'],
  ['checklist-html', '/city-living-checklist.html'],
  ['detail-html', '/city-detail.html'],
  ['compare-html', '/city-compare.html'],
  ['recommend-html', '/recommend.html']
];
async function inspect([label, path]) {
  const url = BASE + path;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json,text/plain,application/xml,*/*' },
      signal: AbortSignal.timeout(8000)
    });
    const body = await response.text();
    if (!response.ok) {
      return { label, http: response.status, ok: false, bytes: body.length };
    }
    if (['health', 'featured', 'miyun', 'facts'].includes(label)) {
      const json = JSON.parse(body);
      if (label === 'health') return { label, http: response.status, status: json.status };
      if (label === 'featured') {
        const ids = (json.cities || []).map(c => c.id);
        return { label, http: response.status, count: ids.length,
          heldIdsPresent: ids.filter(id => id === 1023 || id === 1087) };
      }
      if (label === 'miyun') {
        const city = json.city || json;
        return { label, http: response.status, id: city.id,
          officialFactCount: city.official_facts?.facts?.length ?? null };
      }
      const ids=[943,1061,1079,939,917,972,1216,1212,1214,1210];
      const enriched=(json.cities||[]).filter(c=>ids.includes(c.id)&&c.facts?.length===5);
      return { label, http: response.status, enrichedD11Cities:enriched.length,
        enrichedD11Facts:enriched.reduce((n,c)=>n+c.facts.length,0), cityCount: json.cities?.length ?? null,
        factCount: (json.cities || []).reduce((n,c) => n + (c.facts?.length || 0), 0),
        miyunExists: Boolean((json.cities || []).find(c => c.id === 955)),
        ankangFactCount: (json.cities || []).find(c => c.id === 1449)?.facts?.length ?? null };
    }
    if (label === 'candidate-ankang') {
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
      bytes: body.length };
    if (label === 'homepage-html') return { label, http: response.status,
      hasFreshScriptVersion: body.includes('city-evidence-explorer.js?v=20261118-d11'),
      bytes: body.length };
    if (label === 'robots') return { label, http: response.status,
      hasBaiduspider: body.includes('Baiduspider'), bytes: body.length };
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
