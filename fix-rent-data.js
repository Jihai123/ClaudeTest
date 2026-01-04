#!/usr/bin/env node
/**
 * 修复租金数据
 * 1. 删除旅居榜中不应该存在的大城市（一二线城市应该在china_general榜）
 * 2. 这些城市如果在china_general已存在则删除重复，否则移到china_general
 */
const db = require('./server/models/database');

// 不应该出现在旅居榜的大城市（一线、新一线、二线城市）
const BIG_CITIES = [
  '北京', '上海', '广州', '深圳', '香港', '澳门',
  '成都', '杭州', '武汉', '重庆', '南京', '天津', '苏州', '西安', '长沙', '沈阳', '青岛', '郑州', '大连', '东莞', '宁波',
  '厦门', '福州', '无锡', '合肥', '昆明', '哈尔滨', '济南', '佛山', '长春', '温州', '石家庄', '南宁', '常州', '泉州', '南昌', '贵阳', '太原', '烟台', '嘉兴', '南通', '金华', '珠海', '惠州', '徐州', '海口', '乌鲁木齐', '绍兴', '中山', '台州', '兰州'
];

async function fixRentData() {
  console.log('=== 修复租金数据 ===\n');

  await db.init();
  await new Promise(r => setTimeout(r, 500));

  try {
    // 1. 查找china_layflat中的大城市
    console.log('【1. 查找旅居榜中的大城市】');
    const conditions = BIG_CITIES.map(c => `name LIKE '${c}%'`).join(' OR ');
    const wrongCities = await db.query(`
      SELECT id, name, province, avg_rent, list_type
      FROM cities
      WHERE list_type = 'china_layflat' AND (${conditions})
    `);

    console.log(`发现 ${wrongCities.length} 个大城市错误地在旅居榜中：`);
    wrongCities.forEach(c => {
      console.log(`  ${c.id}: ${c.name} (${c.province}) - ${c.avg_rent}元`);
    });

    // 2. 检查这些城市是否在china_general中已存在
    console.log('\n【2. 检查并处理重复数据】');
    let deleted = 0;
    let moved = 0;

    for (const city of wrongCities) {
      // 检查是否在china_general已存在同名城市
      const baseName = city.name.replace(/[市区县]$/, '');
      const existing = await db.get(`
        SELECT id, name FROM cities
        WHERE list_type = 'china_general'
          AND (name = ? OR name = ? OR name LIKE ?)
      `, [city.name, baseName, baseName + '%']);

      if (existing) {
        // 已存在，删除旅居榜中的重复数据
        await db.run('DELETE FROM city_dimensions WHERE city_id = ?', [city.id]);
        await db.run('DELETE FROM city_tags WHERE city_id = ?', [city.id]);
        await db.run('DELETE FROM cities WHERE id = ?', [city.id]);
        console.log(`  删除重复: ${city.name} (已存在于china_general: ${existing.name})`);
        deleted++;
      } else {
        // 不存在，移到china_general并清除租金
        await db.run(`
          UPDATE cities
          SET list_type = 'china_general', avg_rent = NULL
          WHERE id = ?
        `, [city.id]);
        console.log(`  移动到china_general: ${city.name}`);
        moved++;
      }
    }

    console.log(`\n已删除 ${deleted} 条重复数据，移动 ${moved} 条到china_general`);

    // 3. 验证结果
    console.log('\n【3. 验证修复结果】');
    const remaining = await db.query(`
      SELECT name, province, avg_rent FROM cities
      WHERE list_type = 'china_layflat' AND (${conditions})
    `);

    if (remaining.length === 0) {
      console.log('✓ 旅居榜中已无大城市');
    } else {
      console.log(`⚠ 仍有 ${remaining.length} 个大城市在旅居榜`);
    }

    // 4. 显示修复后的榜单统计
    console.log('\n【4. 修复后榜单统计】');
    const stats = await db.query(`
      SELECT list_type, COUNT(*) as count,
             MIN(avg_rent) as min_rent, MAX(avg_rent) as max_rent, ROUND(AVG(avg_rent)) as avg_rent
      FROM cities
      WHERE list_type IS NOT NULL
      GROUP BY list_type
    `);
    stats.forEach(s => {
      if (s.avg_rent) {
        console.log(`  ${s.list_type}: ${s.count}个城市, 租金${s.min_rent}-${s.max_rent}元`);
      } else {
        console.log(`  ${s.list_type}: ${s.count}个城市`);
      }
    });

  } catch (error) {
    console.error('修复失败:', error);
  } finally {
    await db.close();
  }
}

fixRentData();
