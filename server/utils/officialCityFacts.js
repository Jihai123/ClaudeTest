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
  })],
  // Wikimedia Commons "Miyun Reservoir 2019.jpg" by Shizhao, 2019-05-29.
  // CC BY-SA 4.0, verified on the public file page; source & attribution required.
  // Shown only when no administrator-approved city image exists.
  [955, Object.freeze({
    image_url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5b/Miyun_Reservoir_2019.jpg/960px-Miyun_Reservoir_2019.jpg',
    source_url: 'https://commons.wikimedia.org/wiki/File:Miyun_Reservoir_2019.jpg',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    author: 'Shizhao',
    license: 'CC BY-SA 4.0',
    caption: '密云水库（2019年5月29日）',
    changed: false
  })],
  // Officially mapped city IDs; file-page author/license/location verified on Commons.
  // Safe fallback only if there is no approved image in city_images.
  [1449, Object.freeze({
    image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/%E5%AE%89%E5%BA%B7%E6%B0%B4%E7%94%B5%E7%AB%99_03.jpg/960px-%E5%AE%89%E5%BA%B7%E6%B0%B4%E7%94%B5%E7%AB%99_03.jpg',
    source_url: 'https://commons.wikimedia.org/wiki/File:%E5%AE%89%E5%BA%B7%E6%B0%B4%E7%94%B5%E7%AB%99_03.jpg',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    author: 'Liuxingy',
    license: 'CC BY-SA 4.0',
    caption: '安康市汉江瀛湖的安康水电站（2024年7月5日）',
    changed: false
  })],
  [971, Object.freeze({
    image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/%E9%B9%A4%E5%A3%81%E4%B8%9C%E7%AB%992015-10-12.png/960px-%E9%B9%A4%E5%A3%81%E4%B8%9C%E7%AB%992015-10-12.png',
    source_url: 'https://commons.wikimedia.org/wiki/File:%E9%B9%A4%E5%A3%81%E4%B8%9C%E7%AB%992015-10-12.png',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    author: 'Amazingloong',
    license: 'CC BY-SA 4.0',
    caption: '鹤壁东站（2015年10月12日）',
    changed: false
  })],
  [1063, Object.freeze({
    image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/%E5%AE%89%E5%BE%BD%E9%BB%84%E5%B1%B1%E5%B8%82%E8%A1%97%E6%99%AF.jpg/960px-%E5%AE%89%E5%BE%BD%E9%BB%84%E5%B1%B1%E5%B8%82%E8%A1%97%E6%99%AF.jpg',
    source_url: 'https://commons.wikimedia.org/wiki/File:%E5%AE%89%E5%BE%BD%E9%BB%84%E5%B1%B1%E5%B8%82%E8%A1%97%E6%99%AF.jpg',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    author: 'EditQ',
    license: 'CC BY-SA 4.0',
    caption: '安徽省黄山市街景（2022年10月22日摄）',
    changed: false
  })],
  // Zhoushan Xincheng panorama, Commons own work by Maeshima hiroki (2021-08-09).
  [1308, Object.freeze({
    image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/A_panorama_of_Zhoushan%27s_new_city_center.jpg/960px-A_panorama_of_Zhoushan%27s_new_city_center.jpg',
    source_url: 'https://commons.wikimedia.org/wiki/File:A_panorama_of_Zhoushan%27s_new_city_center.jpg',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    author: 'Maeshima hiroki',
    license: 'CC BY-SA 4.0',
    caption: '舟山市新城城区全景（2021年8月9日）',
    changed: false
  })],
  // Shangrao Xinzhou District, Commons own work by Qa003qa003 (2017-10-28).
  [1365, Object.freeze({
    image_url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b4/Xinzhou_District%2C_Shangrao_20171028_113223.jpg/960px-Xinzhou_District%2C_Shangrao_20171028_113223.jpg',
    source_url: 'https://commons.wikimedia.org/wiki/File:Xinzhou_District%2C_Shangrao_20171028_113223.jpg',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    author: 'Qa003qa003',
    license: 'CC BY-SA 4.0',
    caption: '上饶市信州区城区景观（2017年10月28日）',
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
