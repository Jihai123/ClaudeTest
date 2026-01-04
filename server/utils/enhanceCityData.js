/**
 * 城市数据完善脚本
 * 用于：
 * 1. 从躺平榜avg_rent推算living_cost维度
 * 2. 从city_tier推算employment维度
 * 3. 添加沿海城市标签
 * 4. 计算elderly_care维度
 */

const db = require('../models/database');

// 沿海省份和城市列表
const COASTAL_PROVINCES = ['辽宁', '河北', '天津', '山东', '江苏', '上海', '浙江', '福建', '广东', '广西', '海南'];
const COASTAL_CITIES = [
  '大连', '秦皇岛', '天津', '青岛', '烟台', '威海', '日照', '连云港', '盐城', '南通',
  '上海', '宁波', '舟山', '温州', '台州', '福州', '厦门', '泉州', '漳州', '汕头',
  '深圳', '珠海', '惠州', '汕尾', '湛江', '茂名', '阳江', '北海', '防城港', '钦州',
  '海口', '三亚', '三沙', '文昌', '琼海', '万宁', '陵水'
];

// 从avg_rent推算living_cost评分 (1-10分)
function rentToLivingCost(avgRent) {
  if (!avgRent || avgRent <= 0) return 5; // 默认中等
  if (avgRent <= 300) return 10;
  if (avgRent <= 500) return 9;
  if (avgRent <= 800) return 8;
  if (avgRent <= 1000) return 7;
  if (avgRent <= 1500) return 6;
  if (avgRent <= 2000) return 5;
  if (avgRent <= 3000) return 4;
  if (avgRent <= 5000) return 3;
  if (avgRent <= 8000) return 2;
  return 1;
}

// 从city_tier推算employment评分 (1-10分)
function tierToEmployment(cityTier) {
  const tierMap = {
    'tier1': 10,      // 一线城市：北上广深
    'tier1.5': 9,     // 新一线城市
    'tier2': 7,       // 二线城市
    'tier3': 5,       // 三线城市
    'tier4': 4,       // 四线城市
    'tier5': 3        // 五线城市
  };
  return tierMap[cityTier] || 5;
}

// 判断是否沿海城市
function isCoastalCity(cityName, province) {
  // 直接匹配城市名
  if (COASTAL_CITIES.some(c => cityName.includes(c) || c.includes(cityName))) {
    return true;
  }
  // 匹配沿海省份（需要进一步判断是否靠海）
  if (COASTAL_PROVINCES.some(p => province && province.includes(p))) {
    // 一些内陆城市虽然在沿海省份但不靠海
    const inlandCities = ['济南', '徐州', '南京', '杭州', '广州', '南宁', '合肥'];
    if (inlandCities.some(c => cityName.includes(c))) {
      return false;
    }
    return true;
  }
  return false;
}

// 计算elderly_care评分
function calculateElderlyCare(city, dimensions) {
  // 综合考虑：医疗(40%) + 空气(25%) + 安全(20%) + 生活成本(15%)
  const medical = dimensions.medical_facilities || dimensions.medical_access || 5;
  const air = dimensions.air_quality || 5;
  const safety = dimensions.safety || 5;
  const cost = dimensions.living_cost || 5;

  return Math.round((medical * 0.4 + air * 0.25 + safety * 0.2 + cost * 0.15) * 10) / 10;
}

// 从气候描述推算空气质量
function climateToAirQuality(climateDesc, province) {
  if (!climateDesc) return 6; // 默认值

  // 关键词匹配
  const positiveKeywords = ['空气好', '天然氧', '清新', '纯净', '蓝天', '森林', '氧吧'];
  const negativeKeywords = ['雾霾', '污染', '灰尘', '工业'];

  let score = 6;

  positiveKeywords.forEach(kw => {
    if (climateDesc.includes(kw)) score += 1;
  });

  negativeKeywords.forEach(kw => {
    if (climateDesc.includes(kw)) score -= 1;
  });

  // 根据省份调整（东北、云贵、海南等通常空气较好）
  const goodAirProvinces = ['云南', '贵州', '海南', '西藏', '青海', '内蒙古', '黑龙江'];
  const poorAirProvinces = ['河北', '河南', '山西'];

  if (goodAirProvinces.some(p => province && province.includes(p))) {
    score += 1;
  }
  if (poorAirProvinces.some(p => province && province.includes(p))) {
    score -= 1;
  }

  return Math.max(1, Math.min(10, score));
}

// 主函数：完善城市数据
async function enhanceCityData() {
  console.log('开始完善城市数据...\n');

  try {
    // 获取所有城市
    const cities = await db.query(`
      SELECT c.*, cd.living_cost, cd.employment, cd.air_quality, cd.elderly_care,
             cd.medical_facilities, cd.safety, cd.medical_access
      FROM cities c
      LEFT JOIN city_dimensions cd ON c.id = cd.city_id
    `);

    console.log(`共找到 ${cities.length} 个城市\n`);

    let updatedCount = 0;
    let taggedCoastalCount = 0;

    for (const city of cities) {
      const updates = {};
      const dimensionUpdates = {};

      // 1. 从avg_rent推算living_cost
      if (city.avg_rent && (!city.living_cost || city.living_cost === 0)) {
        dimensionUpdates.living_cost = rentToLivingCost(city.avg_rent);
        console.log(`${city.name}: avg_rent=${city.avg_rent} => living_cost=${dimensionUpdates.living_cost}`);
      }

      // 2. 从city_tier推算employment
      if (city.city_tier && (!city.employment || city.employment === 0)) {
        dimensionUpdates.employment = tierToEmployment(city.city_tier);
        console.log(`${city.name}: tier=${city.city_tier} => employment=${dimensionUpdates.employment}`);
      }

      // 3. 从climate_desc推算air_quality
      if (city.climate && (!city.air_quality || city.air_quality === 0)) {
        dimensionUpdates.air_quality = climateToAirQuality(city.climate, city.province);
        console.log(`${city.name}: 气候描述 => air_quality=${dimensionUpdates.air_quality}`);
      }

      // 4. 计算elderly_care
      const mergedDimensions = { ...city, ...dimensionUpdates };
      if (!city.elderly_care || city.elderly_care === 0) {
        dimensionUpdates.elderly_care = calculateElderlyCare(city, mergedDimensions);
        console.log(`${city.name}: 计算 elderly_care=${dimensionUpdates.elderly_care}`);
      }

      // 5. 判断沿海城市并添加标签
      if (isCoastalCity(city.name, city.province)) {
        // 检查是否已有沿海标签
        const existingTag = await db.get(
          'SELECT id FROM city_tags WHERE city_id = ? AND tag_key = ?',
          [city.id, 'coastal']
        );

        if (!existingTag) {
          await db.run(
            `INSERT INTO city_tags (city_id, tag_key, tag_name, tag_icon) VALUES (?, ?, ?, ?)`,
            [city.id, 'coastal', '沿海城市', '🌊']
          );
          taggedCoastalCount++;
          console.log(`${city.name}: 添加沿海城市标签`);
        }

        // 更新distance_to_sea
        if (!city.distance_to_sea) {
          updates.distance_to_sea = 50; // 默认50公里内
        }
      }

      // 更新cities表
      if (Object.keys(updates).length > 0) {
        const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const values = [...Object.values(updates), city.id];
        await db.run(`UPDATE cities SET ${setClauses} WHERE id = ?`, values);
        updatedCount++;
      }

      // 更新city_dimensions表
      if (Object.keys(dimensionUpdates).length > 0) {
        // 检查是否存在维度记录
        const existingDim = await db.get(
          'SELECT id FROM city_dimensions WHERE city_id = ?',
          [city.id]
        );

        if (existingDim) {
          const setClauses = Object.keys(dimensionUpdates).map(k => `${k} = ?`).join(', ');
          const values = [...Object.values(dimensionUpdates), city.id];
          await db.run(`UPDATE city_dimensions SET ${setClauses} WHERE city_id = ?`, values);
        } else {
          // 插入新记录
          const columns = ['city_id', ...Object.keys(dimensionUpdates)].join(', ');
          const placeholders = ['?', ...Object.keys(dimensionUpdates).map(() => '?')].join(', ');
          const values = [city.id, ...Object.values(dimensionUpdates)];
          await db.run(`INSERT INTO city_dimensions (${columns}) VALUES (${placeholders})`, values);
        }
        updatedCount++;
      }
    }

    console.log('\n========================================');
    console.log(`数据完善完成！`);
    console.log(`更新城市数: ${updatedCount}`);
    console.log(`新增沿海标签: ${taggedCoastalCount}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('数据完善失败:', error);
    throw error;
  }
}

// 生成数据完善报告
async function generateDataReport() {
  console.log('\n========== 数据完善报告 ==========\n');

  try {
    // 1. 各榜单城市数量
    const listStats = await db.query(`
      SELECT list_type, COUNT(*) as count
      FROM cities
      GROUP BY list_type
    `);
    console.log('各榜单城市数量:');
    listStats.forEach(stat => {
      console.log(`  ${stat.list_type || '未分类'}: ${stat.count} 个城市`);
    });

    // 2. 维度数据完整性
    const dimensionStats = await db.get(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN living_cost > 0 THEN 1 ELSE 0 END) as has_living_cost,
        SUM(CASE WHEN air_quality > 0 THEN 1 ELSE 0 END) as has_air_quality,
        SUM(CASE WHEN employment > 0 THEN 1 ELSE 0 END) as has_employment,
        SUM(CASE WHEN elderly_care > 0 THEN 1 ELSE 0 END) as has_elderly_care,
        SUM(CASE WHEN safety > 0 THEN 1 ELSE 0 END) as has_safety,
        SUM(CASE WHEN medical_facilities > 0 THEN 1 ELSE 0 END) as has_medical
      FROM city_dimensions
    `);

    console.log('\n维度数据完整性:');
    if (dimensionStats) {
      const total = dimensionStats.total || 1;
      console.log(`  生活成本: ${dimensionStats.has_living_cost}/${total} (${Math.round(dimensionStats.has_living_cost/total*100)}%)`);
      console.log(`  空气质量: ${dimensionStats.has_air_quality}/${total} (${Math.round(dimensionStats.has_air_quality/total*100)}%)`);
      console.log(`  就业机会: ${dimensionStats.has_employment}/${total} (${Math.round(dimensionStats.has_employment/total*100)}%)`);
      console.log(`  适合养老: ${dimensionStats.has_elderly_care}/${total} (${Math.round(dimensionStats.has_elderly_care/total*100)}%)`);
      console.log(`  安全指数: ${dimensionStats.has_safety}/${total} (${Math.round(dimensionStats.has_safety/total*100)}%)`);
      console.log(`  医疗设施: ${dimensionStats.has_medical}/${total} (${Math.round(dimensionStats.has_medical/total*100)}%)`);
    }

    // 3. 标签统计
    const tagStats = await db.query(`
      SELECT tag_key, tag_name, COUNT(*) as count
      FROM city_tags
      GROUP BY tag_key
    `);
    console.log('\n城市标签统计:');
    tagStats.forEach(tag => {
      console.log(`  ${tag.tag_name}: ${tag.count} 个城市`);
    });

    // 4. 快速找城匹配检查
    console.log('\n快速找城模块数据检查:');

    const lowCostCities = await db.query(`
      SELECT COUNT(*) as count FROM city_dimensions WHERE living_cost <= 5 AND living_cost > 0
    `);
    console.log(`  低生活成本城市: ${lowCostCities[0].count} 个`);

    const elderlyCities = await db.query(`
      SELECT COUNT(*) as count FROM city_dimensions WHERE elderly_care >= 7
    `);
    console.log(`  适合养老城市: ${elderlyCities[0].count} 个`);

    const employmentCities = await db.query(`
      SELECT COUNT(*) as count FROM city_dimensions WHERE employment >= 7
    `);
    console.log(`  就业机会多城市: ${employmentCities[0].count} 个`);

    const airCities = await db.query(`
      SELECT COUNT(*) as count FROM city_dimensions WHERE air_quality >= 8
    `);
    console.log(`  空气好城市: ${airCities[0].count} 个`);

    const coastalCities = await db.query(`
      SELECT COUNT(*) as count FROM city_tags WHERE tag_key = 'coastal'
    `);
    console.log(`  沿海城市: ${coastalCities[0].count} 个`);

    console.log('\n====================================\n');

  } catch (error) {
    console.error('生成报告失败:', error);
  }
}

// 导出函数
module.exports = {
  enhanceCityData,
  generateDataReport,
  rentToLivingCost,
  tierToEmployment,
  isCoastalCity,
  calculateElderlyCare,
  climateToAirQuality
};

// 如果直接运行
if (require.main === module) {
  (async () => {
    await enhanceCityData();
    await generateDataReport();
    process.exit(0);
  })();
}
