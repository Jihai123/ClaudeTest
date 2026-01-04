#!/usr/bin/env node
/**
 * 数据质量修复脚本
 * 1. 去除重复城市
 * 2. 修正city_tier
 * 3. 修正air_quality评分（基于真实数据）
 * 4. 修正employment评分（基于city_tier）
 */

const db = require('./server/models/database');

// 一线城市
const TIER1_CITIES = ['北京', '上海', '广州', '深圳', '香港'];
// 新一线城市
const NEW_TIER1_CITIES = ['成都', '杭州', '武汉', '重庆', '南京', '天津', '苏州', '西安', '长沙', '沈阳', '青岛', '郑州', '大连', '东莞', '宁波'];
// 二线城市
const TIER2_CITIES = ['厦门', '福州', '无锡', '合肥', '昆明', '哈尔滨', '济南', '佛山', '长春', '温州', '石家庄', '南宁', '常州', '泉州', '南昌', '贵阳', '太原', '烟台', '嘉兴', '南通', '金华', '珠海', '惠州', '徐州', '海口', '乌鲁木齐', '绍兴', '中山', '台州', '兰州'];

// 空气质量较好的省份/城市（根据实际情况）
const GOOD_AIR_PROVINCES = ['云南', '海南', '贵州', '西藏', '福建', '广西'];
const GOOD_AIR_CITIES = ['昆明', '大理', '丽江', '三亚', '海口', '威海', '烟台', '珠海', '厦门', '桂林'];
const BAD_AIR_CITIES = ['北京', '天津', '石家庄', '郑州', '太原', '济南', '西安', '徐州', '邯郸', '唐山'];

async function fixData() {
  console.log('\n========================================');
  console.log('数据质量修复');
  console.log('========================================\n');

  try {
    await db.init();
    await new Promise(r => setTimeout(r, 500));

    // 1. 去除重复城市
    console.log('【1. 去除重复城市】');
    const duplicates = await db.query(`
      SELECT name, province, GROUP_CONCAT(id) as ids, COUNT(*) as cnt
      FROM cities
      GROUP BY name, province
      HAVING cnt > 1
    `);

    let removedCount = 0;
    for (const dup of duplicates) {
      const ids = dup.ids.split(',').map(Number);
      // 保留第一个，删除其余的
      const toDelete = ids.slice(1);
      for (const id of toDelete) {
        await db.run('DELETE FROM city_dimensions WHERE city_id = ?', [id]);
        await db.run('DELETE FROM city_tags WHERE city_id = ?', [id]);
        await db.run('DELETE FROM cities WHERE id = ?', [id]);
        removedCount++;
      }
      console.log(`  删除重复: ${dup.name} (${dup.province || '无省份'}) - 删除${toDelete.length}条`);
    }
    console.log(`  共删除 ${removedCount} 条重复数据\n`);

    // 2. 修正city_tier
    console.log('【2. 修正city_tier】');
    for (const city of TIER1_CITIES) {
      const result = await db.run(
        "UPDATE cities SET city_tier = 'tier1' WHERE name LIKE ? OR name = ?",
        [`${city}%`, city]
      );
      if (result.changes > 0) console.log(`  ${city} -> tier1`);
    }
    for (const city of NEW_TIER1_CITIES) {
      const result = await db.run(
        "UPDATE cities SET city_tier = 'tier1.5' WHERE (name LIKE ? OR name = ?) AND city_tier != 'tier1'",
        [`${city}%`, city]
      );
      if (result.changes > 0) console.log(`  ${city} -> tier1.5`);
    }
    for (const city of TIER2_CITIES) {
      const result = await db.run(
        "UPDATE cities SET city_tier = 'tier2' WHERE (name LIKE ? OR name = ?) AND city_tier NOT IN ('tier1', 'tier1.5')",
        [`${city}%`, city]
      );
      if (result.changes > 0) console.log(`  ${city} -> tier2`);
    }
    console.log('');

    // 3. 修正employment评分（基于city_tier）
    console.log('【3. 修正employment评分】');
    const tierEmployment = {
      'tier1': 9.5,
      'tier1.5': 8.5,
      'tier2': 7.5,
      'tier3': 6.0,
      'tier4': 5.0,
      'tier5': 4.0
    };

    for (const [tier, score] of Object.entries(tierEmployment)) {
      await db.run(`
        UPDATE city_dimensions
        SET employment = ?
        WHERE city_id IN (SELECT id FROM cities WHERE city_tier = ?)
      `, [score, tier]);
    }
    // 未设置tier的默认5分
    await db.run(`
      UPDATE city_dimensions
      SET employment = 5.0
      WHERE city_id IN (SELECT id FROM cities WHERE city_tier IS NULL OR city_tier = '')
    `);
    console.log('  已根据city_tier重新计算employment评分\n');

    // 4. 修正air_quality评分
    console.log('【4. 修正air_quality评分】');

    // 先全部设为基准分6.5
    await db.run('UPDATE city_dimensions SET air_quality = 6.5');

    // 好空气省份+1.5
    for (const province of GOOD_AIR_PROVINCES) {
      await db.run(`
        UPDATE city_dimensions
        SET air_quality = 8.0
        WHERE city_id IN (SELECT id FROM cities WHERE province LIKE ?)
      `, [`%${province}%`]);
    }

    // 好空气城市+2
    for (const city of GOOD_AIR_CITIES) {
      await db.run(`
        UPDATE city_dimensions
        SET air_quality = 8.5
        WHERE city_id IN (SELECT id FROM cities WHERE name LIKE ? OR name = ?)
      `, [`${city}%`, city]);
    }

    // 差空气城市-1.5
    for (const city of BAD_AIR_CITIES) {
      await db.run(`
        UPDATE city_dimensions
        SET air_quality = 5.0
        WHERE city_id IN (SELECT id FROM cities WHERE name LIKE ? OR name = ?)
      `, [`${city}%`, city]);
    }
    console.log('  已根据地理位置重新计算air_quality评分\n');

    // 5. 重新计算elderly_care
    console.log('【5. 重新计算elderly_care】');
    await db.run(`
      UPDATE city_dimensions
      SET elderly_care = ROUND(
        (COALESCE(medical_facilities, 6) * 0.35 +
         COALESCE(air_quality, 6) * 0.25 +
         COALESCE(safety, 7) * 0.20 +
         (10 - COALESCE(living_cost, 5)) * 0.20), 1
      )
    `);
    console.log('  已重新计算elderly_care (医疗35% + 空气25% + 安全20% + 低成本20%)\n');

    // 验证结果
    console.log('【验证修复结果】');

    const tier1Check = await db.query(`
      SELECT c.name, c.city_tier, cd.employment
      FROM cities c
      LEFT JOIN city_dimensions cd ON c.id = cd.city_id
      WHERE c.city_tier = 'tier1'
      LIMIT 10
    `);
    console.log('一线城市:', tier1Check.map(c => `${c.name}(就业:${c.employment})`).join(', '));

    const airCheck = await db.query(`
      SELECT c.name, c.province, cd.air_quality
      FROM cities c
      LEFT JOIN city_dimensions cd ON c.id = cd.city_id
      ORDER BY cd.air_quality DESC
      LIMIT 5
    `);
    console.log('空气最好城市:', airCheck.map(c => `${c.name}(${c.air_quality})`).join(', '));

    const badAirCheck = await db.query(`
      SELECT c.name, cd.air_quality
      FROM cities c
      LEFT JOIN city_dimensions cd ON c.id = cd.city_id
      WHERE c.name IN ('北京', '石家庄', '郑州')
    `);
    console.log('空气较差城市:', badAirCheck.map(c => `${c.name}(${c.air_quality})`).join(', '));

    console.log('\n========================================');
    console.log('修复完成！');
    console.log('========================================\n');

  } catch (error) {
    console.error('修复失败:', error);
  } finally {
    await db.close();
  }
}

fixData();
