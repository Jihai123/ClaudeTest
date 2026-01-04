#!/usr/bin/env node
/**
 * 检查租金数据合理性
 */
const db = require('./server/models/database');

async function checkRent() {
  await db.init();
  await new Promise(r => setTimeout(r, 500));

  console.log('=== 租金数据检查 ===\n');

  // 检查一二线城市的租金
  console.log('【一二线城市租金】');
  const bigCities = await db.query(`
    SELECT name, province, avg_rent, list_type, city_tier
    FROM cities
    WHERE name IN ('北京', '上海', '广州', '深圳', '南京', '杭州', '武汉', '成都', '苏州', '天津', '重庆', '西安', '长沙', '青岛', '郑州', '合肥', '济南', '福州', '厦门', '宁波', '无锡')
    ORDER BY avg_rent ASC
  `);
  bigCities.forEach(c => {
    const issue = c.avg_rent && c.avg_rent < 1500 ? ' ⚠️ 异常低' : '';
    console.log(`  ${c.name} (${c.city_tier || '无'}) - 月租: ${c.avg_rent || '无数据'}元${issue}`);
  });

  console.log('\n【china_general榜单租金情况】');
  const generalCities = await db.query(`
    SELECT name, province, avg_rent, city_tier
    FROM cities
    WHERE list_type = 'china_general'
    ORDER BY avg_rent ASC
  `);
  generalCities.forEach(c => {
    console.log(`  ${c.name} (${c.province || '-'}) - ${c.avg_rent || '无'}元`);
  });

  console.log('\n【china_layflat榜单租金分布】');
  const layflatRent = await db.query(`
    SELECT
      CASE
        WHEN avg_rent < 200 THEN '0-200元'
        WHEN avg_rent < 500 THEN '200-500元'
        WHEN avg_rent < 1000 THEN '500-1000元'
        ELSE '1000元以上'
      END as range,
      COUNT(*) as count
    FROM cities
    WHERE list_type = 'china_layflat' AND avg_rent IS NOT NULL
    GROUP BY range
    ORDER BY MIN(avg_rent)
  `);
  layflatRent.forEach(r => {
    console.log(`  ${r.range}: ${r.count}个城市`);
  });

  console.log('\n【各榜单租金统计】');
  const rentStats = await db.query(`
    SELECT list_type,
           COUNT(*) as count,
           MIN(avg_rent) as min_rent,
           MAX(avg_rent) as max_rent,
           ROUND(AVG(avg_rent)) as avg_rent
    FROM cities
    WHERE avg_rent IS NOT NULL
    GROUP BY list_type
  `);
  rentStats.forEach(s => {
    console.log(`  ${s.list_type || '未分类'}: ${s.count}个, 租金${s.min_rent}-${s.max_rent}元, 平均${s.avg_rent}元`);
  });

  await db.close();
}

checkRent();
