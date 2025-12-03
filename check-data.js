const db = require('./server/models/database');

async function checkData() {
  try {
    const cities = await db.query(`
      SELECT id, name, country, world_score
      FROM cities
      WHERE list_type='world'
      LIMIT 10
    `);

    console.log('数据库中的世界城市数据：');
    console.log('='.repeat(60));
    cities.forEach(city => {
      console.log(`ID: ${city.id}`);
      console.log(`城市: ${city.name}`);
      console.log(`国家: ${city.country}`);
      console.log(`评分: ${city.world_score}`);
      console.log('-'.repeat(60));
    });

    process.exit(0);
  } catch (error) {
    console.error('查询失败:', error);
    process.exit(1);
  }
}

checkData();
