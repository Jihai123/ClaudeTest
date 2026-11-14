'use strict';

// Public, source-linked supplementary facts.  Never writes legacy city fields,
// dimension scores, rankings, image approvals, or data-review requests.
const dataset = require('../../public/city-official-facts-2025.json');

const byId = new Map();
for (const entry of dataset.cities) {
  for (const cityId of entry.city_ids) {
    if (!Number.isSafeInteger(cityId) || cityId < 1 || byId.has(cityId)) {
      throw new Error('Invalid or repeated sourced city ID: ' + cityId);
    }
    byId.set(cityId, entry);
  }
}

// Separate, license-verified gallery fallback, not a user-uploaded image.
// Wikimedia Commons: Xi'an city walls.jpg, author Ideophagous (2026-03-23),
// CC BY-SA 4.0 (verified 2026-11-14).  Attribution is required in every UI.
const licensedPhotos = new Map([
  [1238, Object.freeze({
    image_url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/92/Xi%27an_city_walls.jpg/960px-Xi%27an_city_walls.jpg',
    source_url: 'https://commons.wikimedia.org/wiki/File:Xi%27an_city_walls.jpg',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    author: 'Ideophagous',
    license: 'CC BY-SA 4.0',
    caption: '西安城墙（2026年3月23日）',
    changed: false
  })]
]);

function getOfficialFacts(cityId) {
  const entry = byId.get(Number(cityId));
  if (!entry) return null;
  return {
    id: entry.id, city_ids: entry.city_ids, name: entry.name,
    province: entry.province, statistical_year: dataset.statistical_year,
    data_updated_at: dataset.updated_at,
    source_level: entry.source_level || 'government',
    focus: entry.focus, tip: entry.tip,
    alias_note: entry.alias_note || null,
    sources: entry.sources, facts: entry.facts,
    policy: dataset.policy
  };
}

function getSummary(cityId) {
  const entry = byId.get(Number(cityId));
  return entry ? {
    count: entry.facts.length, year: dataset.statistical_year,
    source_count: entry.sources.length
  } : null;
}

function getLicensedPhoto(cityId) {
  return licensedPhotos.get(Number(cityId)) || null;
}

module.exports = { getOfficialFacts, getSummary, getLicensedPhoto };
