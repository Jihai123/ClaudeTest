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
  })],
  // Changzhi Museum, Shanxi, Commons "Changzhi Museum 20260116.jpg", 1969社论.
  [1410, Object.freeze({
    image_url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7b/Changzhi_Museum_20260116.jpg/960px-Changzhi_Museum_20260116.jpg',
    source_url: 'https://commons.wikimedia.org/wiki/File:Changzhi_Museum_20260116.jpg',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    author: '1969社论',
    license: 'CC BY-SA 4.0',
    caption: '长治市博物馆新馆（2026年1月16日）',
    changed: false
  })],
  // Hamburg (Germany), Commons "Hamburg City.jpg" by Lucas366, 2011.
  [1520, Object.freeze({
    image_url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b5/Hamburg_City.jpg/960px-Hamburg_City.jpg',
    source_url: 'https://commons.wikimedia.org/wiki/File:Hamburg_City.jpg',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    author: 'Lucas366',
    license: 'CC BY-SA 4.0',
    caption: '德国汉堡市城市景观（2011年1月15日）',
    changed: false
  })],
  // Zhongshan Street, Jiamusi, Commons by 颜邯, February 2018.
  [1456, Object.freeze({
    image_url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0c/%E4%BD%B3%E6%9C%A8%E6%96%AF%E5%B8%82%E4%B8%AD%E5%B1%B1%E8%A1%97%EF%BC%8C%E5%8E%9F%E6%AD%A5%E8%A1%8C%E8%A1%97%E6%AE%B5_Zhongshan_Street%2C_Jiamusi%2C_Feb_2018.jpg/960px-%E4%BD%B3%E6%9C%A8%E6%96%AF%E5%B8%82%E4%B8%AD%E5%B1%B1%E8%A1%97%EF%BC%8C%E5%8E%9F%E6%AD%A5%E8%A1%8C%E8%A1%97%E6%AE%B5_Zhongshan_Street%2C_Jiamusi%2C_Feb_2018.jpg',
    source_url: 'https://commons.wikimedia.org/wiki/File:%E4%BD%B3%E6%9C%A8%E6%96%AF%E5%B8%82%E4%B8%AD%E5%B1%B1%E8%A1%97%EF%BC%8C%E5%8E%9F%E6%AD%A5%E8%A1%8C%E8%A1%97%E6%AE%B5_Zhongshan_Street%2C_Jiamusi%2C_Feb_2018.jpg',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    author: '颜邯',
    license: 'CC BY-SA 4.0',
    caption: '佳木斯市中山街与西林路路口（2018年2月）',
    changed: false
  })],
  // Fanhe New City, Tieling, Commons by Tomskyhaha (2012-10-04).
  [918, Object.freeze({
    image_url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/80/Scenery_in_Tieling_New_City_04.jpg/960px-Scenery_in_Tieling_New_City_04.jpg',
    source_url: 'https://commons.wikimedia.org/wiki/File:Scenery_in_Tieling_New_City_04.jpg',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    author: 'Tomskyhaha',
    license: 'CC BY-SA 4.0',
    caption: '辽宁省铁岭市凡河新区景观（2012年10月4日）',
    changed: false
  })],
  // Yulin (Guangxi) skyline, Commons original work by Zeilmeter (2006-07-12).
  [1383, Object.freeze({
    image_url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/11/Yulin_Skyline.jpg/960px-Yulin_Skyline.jpg',
    source_url: 'https://commons.wikimedia.org/wiki/File:Yulin_Skyline.jpg',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    author: 'Zeilmeter',
    license: 'CC BY-SA 4.0',
    caption: '广西玉林市城区天际线（2006年7月12日）',
    changed: false
  })],
  // Feicheng Civic Square by Yhy9630 (2017-08-25), Wikimedia Commons.
  [988, Object.freeze({
    image_url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9a/%E8%82%A5%E5%9F%8E%E5%B8%82%E5%B8%82%E6%B0%91%E5%B9%BF%E5%9C%BA.jpg/960px-%E8%82%A5%E5%9F%8E%E5%B8%82%E5%B8%82%E6%B0%91%E5%B9%BF%E5%9C%BA.jpg',
    source_url: 'https://commons.wikimedia.org/wiki/File:%E8%82%A5%E5%9F%8E%E5%B8%82%E5%B8%82%E6%B0%91%E5%B9%BF%E5%9C%BA.jpg',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    author: 'Yhy9630',
    license: 'CC BY-SA 4.0',
    caption: '山东省肥城市市民广场（2017年8月25日）',
    changed: false
  })],
  // Suihua People's Square by Amarespeco (2017-07-16).
  [1426, Object.freeze({
    image_url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/16/%E7%BB%A5%E5%8C%96%E5%B8%82%E4%BA%BA%E6%B0%91%E5%B9%BF%E5%9C%BA.jpg/960px-%E7%BB%A5%E5%8C%96%E5%B8%82%E4%BA%BA%E6%B0%91%E5%B9%BF%E5%9C%BA.jpg',
    source_url: 'https://commons.wikimedia.org/wiki/File:%E7%BB%A5%E5%8C%96%E5%B8%82%E4%BA%BA%E6%B0%91%E5%B9%BF%E5%9C%BA.jpg',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    author: 'Amarespeco',
    license: 'CC BY-SA 4.0',
    caption: '黑龙江绥化市人民广场与市政府大楼（2017年7月16日）',
    changed: false
  })],
  // Zhongwei Gaomiao by Windmemories (2026-08-09).
  [1495, Object.freeze({
    image_url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b1/20260809_Zhongwei_Gaomiao_01.jpg/960px-20260809_Zhongwei_Gaomiao_01.jpg',
    source_url: 'https://commons.wikimedia.org/wiki/File:20260809_Zhongwei_Gaomiao_01.jpg',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    author: 'Windmemories',
    license: 'CC BY-SA 4.0',
    caption: '宁夏中卫市高庙保安寺（2026年8月9日）',
    changed: false
  })],
  // Yuanjiang County urban skyline by 瑞丽江的河水 (2024-10-05).
  [1600, Object.freeze({
    image_url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f5/%E5%85%83%E6%B1%9F%E5%8E%BF%E5%A4%A9%E9%99%85%E7%BA%BF_-_%E8%88%AA%E6%8B%8D_-_%E5%85%A8%E6%99%AF_-_2024-10-05_01.jpg/960px-%E5%85%83%E6%B1%9F%E5%8E%BF%E5%A4%A9%E9%99%85%E7%BA%BF_-_%E8%88%AA%E6%8B%8D_-_%E5%85%A8%E6%99%AF_-_2024-10-05_01.jpg',
    source_url: 'https://commons.wikimedia.org/wiki/File:%E5%85%83%E6%B1%9F%E5%8E%BF%E5%A4%A9%E9%99%85%E7%BA%BF_-_%E8%88%AA%E6%8B%8D_-_%E5%85%A8%E6%99%AF_-_2024-10-05_01.jpg',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    author: '瑞丽江的河水',
    license: 'CC BY-SA 4.0',
    caption: '云南玉溪元江县城天际线航拍（2024年10月5日）',
    changed: false
  })],
  // CRH5G train at Mudanjiang Railway Station by Prcshaw (2021-06-25).
  [903, Object.freeze({
    image_url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/df/CRH5G_at_Mudanjiang_Railway_Station.jpg/960px-CRH5G_at_Mudanjiang_Railway_Station.jpg',
    source_url: 'https://commons.wikimedia.org/wiki/File:CRH5G_at_Mudanjiang_Railway_Station.jpg',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    author: 'Prcshaw',
    license: 'CC BY-SA 4.0',
    caption: '牡丹江火车站的CRH5G列车（2021年6月25日）',
    changed: false
  })],
  // Baishan Railway Station by PanShiBo (2013-10-05), CC BY-SA 3.0.
  [915, Object.freeze({
    image_url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0c/Baishan_Railway_Station.JPG/960px-Baishan_Railway_Station.JPG',
    source_url: 'https://commons.wikimedia.org/wiki/File:Baishan_Railway_Station.JPG',
    license_url: 'https://creativecommons.org/licenses/by-sa/3.0/',
    author: 'PanShiBo',
    license: 'CC BY-SA 3.0',
    caption: '吉林省白山市火车站（2013年10月5日）',
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
