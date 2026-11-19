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

function isEditoriallyHeld(city) {
  return Boolean(city && editorialHoldIds.has(Number(city.id)));
}

/**
 * Omit unsupported public claims, never mutate the original DB tag rows.
 * A warm+cold pair offers no actionable climate guidance until sourced.
 * Legacy low_rent tags are derived from prices without a verified sample,
 * time period or citywide statistical basis. Keep them out of public cards.
 */
function sanitizePublicTags(tags) {
  if (!Array.isArray(tags)) return [];
  const warm = tags.some(tag => tag && tag.tag_key === 'warm');
  const cold = tags.some(tag => tag && tag.tag_key === 'cold');
  return tags.filter(tag => {
    if (!tag || tag.tag_key === 'low_rent') return false;
    if (warm && cold && (tag.tag_key === 'warm' || tag.tag_key === 'cold')) return false;
    return true;
  });
}

module.exports = { EDITORIAL_HOLD_CITY_IDS, isEditoriallyHeld, sanitizePublicTags };
