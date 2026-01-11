const db = require('../models/database');

/**
 * 数据库数据改造脚本
 * 修复关键数据缺口
 */

async function upgradeData() {
  console.log('开始数据改造...\n');

  try {
    // ============================================
    // 改造1: 添加 country 字段并设置默认值
    // ============================================
    console.log('[1/5] 添加 country 字段...');

    // 检查字段是否存在
    const columns = await db.query(`PRAGMA table_info(cities)`);
    const hasCountry = columns.some(col => col.name === 'country');

    if (!hasCountry) {
      await db.run(`ALTER TABLE cities ADD COLUMN country VARCHAR(100) DEFAULT '中国'`);
      console.log('✓ country 字段添加成功');
    } else {
      console.log('✓ country 字段已存在');
    }

    // 更新所有未设置country的记录
    await db.run(`UPDATE cities SET country = '中国' WHERE country IS NULL OR country = ''`);
    const updatedCountry = await db.get(`SELECT COUNT(*) as count FROM cities WHERE country = '中国'`);
    console.log(`✓ 已更新 ${updatedCountry.count} 条记录的country字段\n`);

    // ============================================
    // 改造2: 计算并更新 overall_score
    // ============================================
    console.log('[2/5] 计算 overall_score...');

    const cities = await db.query(`
      SELECT c.id, cd.living_cost, cd.air_quality, cd.medical_facilities,
             cd.employment, cd.safety, cd.elderly_care
      FROM cities c
      LEFT JOIN city_dimensions cd ON c.id = cd.city_id
    `);

    let updatedScores = 0;
    for (const city of cities) {
      if (city.living_cost !== null) {
        const overallScore = (
          (parseFloat(city.living_cost) || 0) +
          (parseFloat(city.air_quality) || 0) +
          (parseFloat(city.medical_facilities) || 0) +
          (parseFloat(city.employment) || 0) +
          (parseFloat(city.safety) || 0) +
          (parseFloat(city.elderly_care) || 0)
        ) / 6;

        await db.run(
          `UPDATE cities SET overall_score = ? WHERE id = ?`,
          [Math.round(overallScore * 100) / 100, city.id]
        );
        updatedScores++;
      }
    }
    console.log(`✓ 已计算并更新 ${updatedScores} 个城市的综合评分\n`);

    // ============================================
    // 改造3: 添加 city_tier 字段
    // ============================================
    console.log('[3/5] 添加 city_tier 字段...');

    const hasCityTier = columns.some(col => col.name === 'city_tier');

    if (!hasCityTier) {
      await db.run(`ALTER TABLE cities ADD COLUMN city_tier VARCHAR(20)`);
      console.log('✓ city_tier 字段添加成功');
    } else {
      console.log('✓ city_tier 字段已存在');
    }

    // 根据人口自动判断城市等级
    await db.run(`
      UPDATE cities
      SET city_tier = CASE
        WHEN population >= 10000000 THEN '一线'
        WHEN population >= 5000000 THEN '新一线'
        WHEN population >= 1000000 THEN '二线'
        ELSE '三线'
      END
      WHERE city_tier IS NULL OR city_tier = ''
    `);

    const tierStats = await db.query(`
      SELECT city_tier, COUNT(*) as count
      FROM cities
      WHERE city_tier IS NOT NULL
      GROUP BY city_tier
    `);
    console.log('✓ 城市等级分布：');
    tierStats.forEach(stat => {
      console.log(`  ${stat.city_tier}: ${stat.count}个城市`);
    });
    console.log();

    // ============================================
    // 改造4: 初始化 views_count 和 favorites_count
    // ============================================
    console.log('[4/5] 初始化浏览量和收藏量...');

    await db.run(`UPDATE cities SET views_count = 0 WHERE views_count IS NULL`);
    await db.run(`UPDATE cities SET favorites_count = 0 WHERE favorites_count IS NULL`);

    console.log('✓ 浏览量和收藏量初始化完成\n');

    // ============================================
    // 改造5: 添加缺失的沿海城市
    // ============================================
    console.log('[5/5] 检查并添加缺失的沿海城市...');

    const coastalCitiesToAdd = [
      { name: '三亚', province: '海南', population: 800000, gdp: 825.96, area: 1919.58 },
      { name: '烟台', province: '山东', population: 7102000, gdp: 9515.86, area: 13745.95 },
      { name: '宁波', province: '浙江', population: 9540000, gdp: 15704.28, area: 9816 },
      { name: '舟山', province: '浙江', population: 1210000, gdp: 1738.74, area: 22200 },
      { name: '福州', province: '福建', population: 8290000, gdp: 12308.23, area: 11968 },
      { name: '泉州', province: '福建', population: 8790000, gdp: 11304.17, area: 11245 },
      { name: '汕头', province: '广东', population: 5640000, gdp: 3117.02, area: 2248.39 },
      { name: '湛江', province: '广东', population: 8350000, gdp: 3559.09, area: 13225.44 },
      { name: '北海', province: '广西', population: 1860000, gdp: 1650.44, area: 3337 },
      { name: '秦皇岛', province: '河北', population: 3240000, gdp: 1802.15, area: 7813 },
      { name: '连云港', province: '江苏', population: 4600000, gdp: 3765.37, area: 7615 },
      { name: '南通', province: '江苏', population: 7730000, gdp: 11379.09, area: 8001 },
      { name: '温州', province: '浙江', population: 9670000, gdp: 8029.32, area: 12110 },
      { name: '台州', province: '浙江', population: 6640000, gdp: 5786.19, area: 10050 }
    ];

    let addedCount = 0;
    for (const cityData of coastalCitiesToAdd) {
      // 检查城市是否已存在
      const existing = await db.get(
        `SELECT id FROM cities WHERE name = ?`,
        [cityData.name]
      );

      if (!existing) {
        // 添加城市基本信息
        const result = await db.run(
          `INSERT INTO cities (name, province, country, population, gdp, area, city_tier, overall_score, views_count, favorites_count, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [
            cityData.name,
            cityData.province,
            '中国',
            cityData.population,
            cityData.gdp,
            cityData.area,
            cityData.population >= 5000000 ? '新一线' : cityData.population >= 1000000 ? '二线' : '三线',
            0, // 先设置为0，后续更新
            0,
            0,
            'approved'
          ]
        );

        // 添加维度数据（使用默认值）
        await db.run(
          `INSERT INTO city_dimensions (city_id, living_cost, air_quality, medical_facilities, employment, safety, elderly_care)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            result.id,
            7.0,  // 默认值
            8.0,  // 沿海城市空气质量通常较好
            7.0,
            6.5,
            8.0,
            7.5
          ]
        );

        // 更新综合评分
        await db.run(
          `UPDATE cities SET overall_score = ? WHERE id = ?`,
          [(7.0 + 8.0 + 7.0 + 6.5 + 8.0 + 7.5) / 6, result.id]
        );

        addedCount++;
      }
    }

    console.log(`✓ 新增 ${addedCount} 个沿海城市\n`);

    // ============================================
    // 统计最终结果
    // ============================================
    console.log('='.repeat(50));
    console.log('数据改造完成！\n');

    const totalCities = await db.get(`SELECT COUNT(*) as count FROM cities`);
    const withScore = await db.get(`SELECT COUNT(*) as count FROM cities WHERE overall_score > 0`);
    const withCountry = await db.get(`SELECT COUNT(*) as count FROM cities WHERE country IS NOT NULL`);
    const withTier = await db.get(`SELECT COUNT(*) as count FROM cities WHERE city_tier IS NOT NULL`);

    console.log('最终统计：');
    console.log(`  总城市数: ${totalCities.count}`);
    console.log(`  有综合评分: ${withScore.count}`);
    console.log(`  有国家标识: ${withCountry.count}`);
    console.log(`  有城市等级: ${withTier.count}`);
    console.log();

    // 检查沿海城市覆盖率
    const coastalCities = ['青岛', '厦门', '大连', '三亚', '珠海', '烟台', '威海', '宁波',
                          '舟山', '福州', '泉州', '汕头', '湛江', '北海', '秦皇岛',
                          '连云港', '南通', '温州', '台州', '深圳', '广州', '上海'];

    const coastalInDb = await db.query(
      `SELECT name FROM cities WHERE name IN (${coastalCities.map(() => '?').join(',')})`,
      coastalCities
    );

    console.log(`沿海城市覆盖: ${coastalInDb.length}/22 (${Math.round(coastalInDb.length / 22 * 100)}%)`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('数据改造失败:', error);
    throw error;
  }
}

// 执行改造
upgradeData()
  .then(() => {
    console.log('\n✓ 所有改造完成，可以关闭数据库连接');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ 改造失败:', error);
    process.exit(1);
  });

module.exports = { upgradeData };
