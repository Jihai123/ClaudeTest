const db = require('./server/models/database');

/**
 * 验证世界城市排行榜导入结果
 */
async function verifyImport() {
  try {
    console.log('\n========================================');
    console.log('世界宜居城市排行榜数据验证');
    console.log('========================================\n');

    // 查询世界榜单城市总数
    const totalCount = await db.get(
      "SELECT COUNT(*) as count FROM cities WHERE list_type = 'world'"
    );
    console.log(`✓ 世界榜单城市总数: ${totalCount.count}\n`);

    // 查询前10名城市
    console.log('TOP 10 世界宜居城市:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const topCities = await db.query(`
      SELECT
        c.id,
        c.name,
        c.country,
        c.world_score,
        d.safety,
        d.medical_facilities,
        d.culture
      FROM cities c
      LEFT JOIN city_dimensions d ON c.id = d.city_id
      WHERE c.list_type = 'world'
      ORDER BY c.world_score DESC
      LIMIT 10
    `);

    topCities.forEach((city, index) => {
      console.log(
        `${index + 1}. ${city.name.padEnd(20)} | ${city.country.padEnd(15)} | ` +
        `评分: ${city.world_score.toString().padEnd(5)} | ` +
        `安全: ${(city.safety || 0).toFixed(1)} | ` +
        `医疗: ${(city.medical_facilities || 0).toFixed(1)} | ` +
        `文化: ${(city.culture || 0).toFixed(1)}`
      );
    });

    // 按国家统计
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('按国家统计城市数量（TOP 10）:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const countryStats = await db.query(`
      SELECT
        country,
        COUNT(*) as count,
        ROUND(AVG(world_score), 2) as avg_score
      FROM cities
      WHERE list_type = 'world'
      GROUP BY country
      ORDER BY count DESC
      LIMIT 10
    `);

    countryStats.forEach((stat, index) => {
      console.log(
        `${(index + 1).toString().padEnd(3)}. ${stat.country.padEnd(20)} | ` +
        `城市数: ${stat.count.toString().padEnd(3)} | ` +
        `平均分: ${stat.avg_score}`
      );
    });

    // 查询最低分城市
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('评分最低的5个城市:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const bottomCities = await db.query(`
      SELECT
        c.name,
        c.country,
        c.world_score
      FROM cities c
      WHERE c.list_type = 'world'
      ORDER BY c.world_score ASC
      LIMIT 5
    `);

    bottomCities.forEach((city, index) => {
      console.log(
        `${index + 1}. ${city.name.padEnd(25)} | ${city.country.padEnd(20)} | ` +
        `评分: ${city.world_score}`
      );
    });

    // 检查维度数据完整性
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('数据完整性检查:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const dimensionCheck = await db.get(`
      SELECT
        COUNT(*) as total_cities,
        SUM(CASE WHEN d.id IS NOT NULL THEN 1 ELSE 0 END) as with_dimensions,
        SUM(CASE WHEN d.safety > 0 THEN 1 ELSE 0 END) as with_safety,
        SUM(CASE WHEN d.medical_facilities > 0 THEN 1 ELSE 0 END) as with_medical,
        SUM(CASE WHEN d.culture > 0 THEN 1 ELSE 0 END) as with_culture
      FROM cities c
      LEFT JOIN city_dimensions d ON c.id = d.city_id
      WHERE c.list_type = 'world'
    `);

    console.log(`总城市数: ${dimensionCheck.total_cities}`);
    console.log(`有维度数据的城市: ${dimensionCheck.with_dimensions}`);
    console.log(`有安全评分的城市: ${dimensionCheck.with_safety}`);
    console.log(`有医疗评分的城市: ${dimensionCheck.with_medical}`);
    console.log(`有文化评分的城市: ${dimensionCheck.with_culture}`);

    console.log('\n========================================');
    console.log('验证完成！');
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('验证失败:', error);
    process.exit(1);
  }
}

verifyImport();
