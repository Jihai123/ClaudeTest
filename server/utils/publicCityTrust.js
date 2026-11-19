'use strict';

/**
 * Public editorial safety gate. These IDs are under provenance review in #147;
 * they remain in SQLite and must be corrected only through the audited data
 * management approval path, not silently renamed or deleted here.
 *
 * #1023: invalid/unverified entity name; #1087: unverified rental claim.
 * #1013: "尔勒市" incorrectly labelled 云南 and conflicting climate labels.
 * #1016: ambiguous "开发区" without a uniquely identifiable jurisdiction.
 * #1017: "冬阳城区" unverified jurisdiction name.
 */
const EDITORIAL_HOLD_CITY_IDS = Object.freeze([1023, 1087, 1013, 1016, 1017]);
const editorialHoldIds = new Set(EDITORIAL_HOLD_CITY_IDS);
// #147: existing coastal tags for inland Lishui and Chun'an have no valid coastal basis.
// Hide only this disputed tag, preserving other tags and the SQLite review audit.
const UNVERIFIED_COASTAL_CITY_IDS = Object.freeze([1002, 1004]);
const unverifiedCoastalCityIds = new Set(UNVERIFIED_COASTAL_CITY_IDS);

function isEditoriallyHeld(city) {
  return Boolean(city && editorialHoldIds.has(Number(city.id)));
}

/**
 * Omit unsupported public claims, never mutate the original DB tag rows.
 * A warm+cold pair offers no actionable climate guidance until sourced.
 * Legacy low_rent tags are derived from prices without a verified sample,
 * time period or citywide statistical basis. Keep them out of public cards.
 */
function sanitizePublicTags(tags, cityId) {
  if (!Array.isArray(tags)) return [];
  const warm = tags.some(tag => tag && tag.tag_key === 'warm');
  const cold = tags.some(tag => tag && tag.tag_key === 'cold');
  return tags.filter(tag => {
    if (!tag || tag.tag_key === 'low_rent') return false;
    if (tag.tag_key === 'coastal' && unverifiedCoastalCityIds.has(Number(cityId))) return false;
    if (warm && cold && (tag.tag_key === 'warm' || tag.tag_key === 'cold')) return false;
    return true;
  });
}

function sanitizePublicCityClaims(city) {
  if (!city || typeof city !== 'object') return city;
  const safe = { ...city };
  const id = Number(city.id);
  const notices = [];
  if (id === 1076) {
    for (const field of ['evaluation', 'slogan']) {
      if (typeof safe[field] === 'string' && safe[field].includes('南岳衡山')) {
        safe[field] = null;
        notices.push('历史介绍存在跨城市内容');
      }
    }
  }
  if (id === 1002 && safe.district === '公阳城区') {
    safe.district = null;
    notices.push('区域名称待来源核实');
  }
  if (id === 1004 && safe.district === '乌湖') {
    safe.district = null;
    notices.push('区域名称待来源核实');
  }
  if (id === 1004) {
    for (const field of ['evaluation', 'slogan']) {
      if (typeof safe[field] === 'string' && /西湖美景|灵隐寺/.test(safe[field])) {
        safe[field] = null;
        notices.push('历史介绍包含与本地不符的景点内容');
      }
    }
    // Never assert a lake exists solely from a conflicting legacy flag.
    if (safe.has_lake === 0 && typeof safe.standard_location === 'string' &&
        safe.standard_location.includes('千岛湖')) {
      safe.has_lake = null;
      notices.push('湖泊标签与位置记录冲突，待来源核实');
    }
  }
  if (unverifiedCoastalCityIds.has(id)) notices.push('历史沿海城市标签待核实，暂不对外展示');
  if (isEditoriallyHeld(city)) notices.push('城市名称或历史统计口径尚未完成核实');
  if (notices.length) safe.public_data_quality_note = [...new Set(notices)].join('；');
  return safe;
}
module.exports = { EDITORIAL_HOLD_CITY_IDS, UNVERIFIED_COASTAL_CITY_IDS, isEditoriallyHeld, sanitizePublicTags, sanitizePublicCityClaims };
