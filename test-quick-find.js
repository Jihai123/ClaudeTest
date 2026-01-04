#!/usr/bin/env node
/**
 * 快速找城模块测试脚本
 * 测试各筛选条件返回的城市是否符合预期
 */

const db = require('./server/models/database');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, msg) {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function testQuickFind() {
  console.log('\n========================================');
  console.log('快速找城模块测试');
  console.log('========================================\n');

  try {
    await db.init();
    await new Promise(r => setTimeout(r, 500));

    // 1. 测试低生活成本
    log('cyan', '【1. 低生活成本城市】');
    console.log('筛选条件: list_type=china_layflat, 按avg_rent升序');

    const lowCostCities = await db.query(`
      SELECT c.name, c.province, c.avg_rent, c.layflat_score
      FROM cities c
      WHERE c.list_type = 'china_layflat' AND c.avg_rent IS NOT NULL
      ORDER BY c.avg_rent ASC
      LIMIT 10
    `);

    if (lowCostCities.length === 0) {
      log('red', '✗ 没有找到低生活成本城市！');
    } else {
      log('green', `✓ 找到 ${lowCostCities.length} 个城市`);
      lowCostCities.slice(0, 5).forEach((c, i) => {
        console.log(`  ${i+1}. ${c.name} (${c.province}) - 月租: ${c.avg_rent}元`);
      });
    }

    // 2. 测试适合养老
    console.log('\n');
    log('cyan', '【2. 适合养老城市】');
    console.log('筛选条件: elderly_care >= 7');

    const elderlyCities = await db.query(`
      SELECT c.name, c.province, cd.elderly_care
      FROM cities c
      LEFT JOIN city_dimensions cd ON c.id = cd.city_id
      WHERE cd.elderly_care >= 7 AND c.country = '中国'
      ORDER BY cd.elderly_care DESC
      LIMIT 10
    `);

    if (elderlyCities.length === 0) {
      log('red', '✗ 没有找到适合养老城市！');

      // 检查elderly_care数据分布
      const elderlyStats = await db.query(`
        SELECT
          COUNT(*) as total,
          MAX(elderly_care) as max_score,
          MIN(elderly_care) as min_score,
          AVG(elderly_care) as avg_score
        FROM city_dimensions WHERE elderly_care > 0
      `);
      console.log('  elderly_care数据分布:', elderlyStats[0]);
    } else {
      log('green', `✓ 找到 ${elderlyCities.length} 个城市`);
      elderlyCities.slice(0, 5).forEach((c, i) => {
        console.log(`  ${i+1}. ${c.name} (${c.province}) - 养老评分: ${c.elderly_care}`);
      });
    }

    // 3. 测试就业机会多
    console.log('\n');
    log('cyan', '【3. 就业机会多城市】');
    console.log('筛选条件: list_type=china_general');

    const employmentCities = await db.query(`
      SELECT c.name, c.province, c.overall_score, c.city_tier
      FROM cities c
      WHERE c.list_type = 'china_general'
      ORDER BY c.overall_score DESC
      LIMIT 10
    `);

    if (employmentCities.length === 0) {
      log('red', '✗ 没有找到就业机会多城市！');
    } else {
      log('green', `✓ 找到 ${employmentCities.length} 个城市`);
      employmentCities.slice(0, 5).forEach((c, i) => {
        console.log(`  ${i+1}. ${c.name} (${c.province || '直辖市'}) - 综合评分: ${c.overall_score}`);
      });
    }

    // 4. 测试空气好
    console.log('\n');
    log('cyan', '【4. 空气质量好城市】');
    console.log('筛选条件: air_quality >= 7');

    const airCities = await db.query(`
      SELECT c.name, c.province, cd.air_quality
      FROM cities c
      LEFT JOIN city_dimensions cd ON c.id = cd.city_id
      WHERE cd.air_quality >= 7 AND c.country = '中国'
      ORDER BY cd.air_quality DESC
      LIMIT 10
    `);

    if (airCities.length === 0) {
      log('red', '✗ 没有找到空气好城市！');

      // 检查air_quality数据分布
      const airStats = await db.query(`
        SELECT
          COUNT(*) as total,
          MAX(air_quality) as max_score,
          MIN(air_quality) as min_score,
          AVG(air_quality) as avg_score
        FROM city_dimensions WHERE air_quality > 0
      `);
      console.log('  air_quality数据分布:', airStats[0]);
    } else {
      log('green', `✓ 找到 ${airCities.length} 个城市`);
      airCities.slice(0, 5).forEach((c, i) => {
        console.log(`  ${i+1}. ${c.name} (${c.province}) - 空气评分: ${c.air_quality}`);
      });
    }

    // 5. 测试沿海宜居
    console.log('\n');
    log('cyan', '【5. 沿海宜居城市】');
    console.log('筛选条件: 有coastal标签');

    const coastalCities = await db.query(`
      SELECT c.name, c.province, c.overall_score, c.layflat_score
      FROM cities c
      INNER JOIN city_tags ct ON c.id = ct.city_id
      WHERE ct.tag_key = 'coastal' AND c.country = '中国'
      ORDER BY COALESCE(c.overall_score, c.layflat_score) DESC
      LIMIT 10
    `);

    if (coastalCities.length === 0) {
      log('red', '✗ 没有找到沿海城市！');

      // 检查coastal标签数量
      const coastalCount = await db.get(`
        SELECT COUNT(*) as count FROM city_tags WHERE tag_key = 'coastal'
      `);
      console.log('  coastal标签数量:', coastalCount.count);
    } else {
      log('green', `✓ 找到 ${coastalCities.length} 个城市`);
      coastalCities.slice(0, 5).forEach((c, i) => {
        const score = c.overall_score || c.layflat_score || 0;
        console.log(`  ${i+1}. ${c.name} (${c.province}) - 评分: ${score}`);
      });
    }

    // 6. 检查数据问题
    console.log('\n');
    log('cyan', '【6. 数据问题检查】');

    // 检查province为null的城市
    const nullProvince = await db.query(`
      SELECT name, country, province FROM cities
      WHERE province IS NULL OR province = '' OR province = 'null'
      LIMIT 10
    `);
    if (nullProvince.length > 0) {
      log('yellow', `⚠ 有 ${nullProvince.length} 个城市省份为空:`);
      nullProvince.forEach(c => {
        console.log(`  - ${c.name} (${c.country})`);
      });
    }

    // 7. 测试API筛选逻辑
    console.log('\n');
    log('cyan', '【7. API筛选逻辑测试】');

    // 模拟API的coastal筛选SQL
    const apiCoastalTest = await db.query(`
      SELECT c.id, c.name, c.province
      FROM cities c
      WHERE c.status = 'approved'
        AND c.id IN (
          SELECT DISTINCT city_id FROM city_tags
          WHERE tag_key = 'coastal'
        )
        AND c.country = '中国'
      LIMIT 5
    `);

    if (apiCoastalTest.length === 0) {
      log('red', '✗ API coastal筛选SQL返回0条数据');

      // 详细诊断
      const statusCheck = await db.get(`SELECT COUNT(*) as count FROM cities WHERE status = 'approved'`);
      console.log(`  approved状态城市数: ${statusCheck.count}`);

      const tagCheck = await db.get(`SELECT COUNT(*) as count FROM city_tags WHERE tag_key = 'coastal'`);
      console.log(`  coastal标签数: ${tagCheck.count}`);

      const joinCheck = await db.query(`
        SELECT c.id, c.name, c.status, ct.tag_key
        FROM cities c
        INNER JOIN city_tags ct ON c.id = ct.city_id
        WHERE ct.tag_key = 'coastal'
        LIMIT 3
      `);
      console.log(`  带coastal标签的城市:`, joinCheck);
    } else {
      log('green', `✓ API coastal筛选正常，返回 ${apiCoastalTest.length} 条`);
    }

    // 汇总
    console.log('\n========================================');
    log('blue', '测试汇总');
    console.log('========================================');
    console.log(`低生活成本: ${lowCostCities.length > 0 ? '✓' : '✗'}`);
    console.log(`适合养老: ${elderlyCities.length > 0 ? '✓' : '✗'}`);
    console.log(`就业机会多: ${employmentCities.length > 0 ? '✓' : '✗'}`);
    console.log(`空气好: ${airCities.length > 0 ? '✓' : '✗'}`);
    console.log(`沿海宜居: ${coastalCities.length > 0 ? '✓' : '✗'}`);
    console.log('========================================\n');

  } catch (error) {
    log('red', '测试失败: ' + error.message);
    console.error(error);
  } finally {
    await db.close();
  }
}

testQuickFind();
