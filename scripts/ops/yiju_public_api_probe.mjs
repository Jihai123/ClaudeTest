// Read-only remote smoke report. No credentials, cookies, POST requests, or mutation.
// This is a diagnostic only: CI success and an HTTP result cannot prove a deploy SHA.
const BASE = 'https://yiju.zhibeimao.com';
const checks = [
  ['health', '/api/health'],
  ['featured', '/api/cities/hot?type=featured&limit=9'],
  ['miyun', '/api/cities/955'],
  ['facts', '/city-official-facts-2025.json'],
  ['homepage-js', '/city-evidence-explorer.js'],
  ['robots', '/robots.txt'],
  ['sitemap', '/sitemap.xml']
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
      return { label, http: response.status, cityCount: json.cities?.length ?? null,
        factCount: (json.cities || []).reduce((n,c) => n + (c.facts?.length || 0), 0),
        miyunExists: Boolean((json.cities || []).find(c => c.id === 955)) };
    }
    if (label === 'homepage-js') return { label, http: response.status,
      hasRotation: body.includes('rotateFeaturedCities'), bytes: body.length };
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
