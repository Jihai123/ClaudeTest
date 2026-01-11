const db = require('../models/database');

/**
 * 城市标签数据导入脚本
 * 基于2025年最新官方数据
 *
 * 数据来源：
 * 1. 城市分级：第一财经·新一线城市研究所《2025新一线城市魅力排行榜》
 * 2. 沿海城市：《中国海洋统计年鉴》定义
 */

// ============================================
// 一、城市分级数据（2025年5月28日发布）
// ============================================

const cityTiers = {
  '一线': ['上海', '北京', '深圳', '广州'],

  '新一线': [
    '成都', '杭州', '重庆', '武汉', '苏州',
    '西安', '南京', '长沙', '郑州', '天津',
    '合肥', '青岛', '东莞', '宁波', '佛山'
  ],

  '二线': [
    '济南', '无锡', '沈阳', '昆明', '福州',
    '厦门', '温州', '石家庄', '大连', '哈尔滨',
    '金华', '泉州', '南宁', '长春', '常州',
    '南昌', '南通', '贵阳', '嘉兴', '徐州',
    '惠州', '太原', '烟台', '临沂', '保定',
    '台州', '绍兴', '珠海', '洛阳', '潍坊'
  ]
};

// ============================================
// 二、沿海城市数据（53个地级市 + 2个直辖市）
// ============================================

const coastalCities = {
  // 直辖市
  '直辖市': ['上海', '天津'],

  // 辽宁（6个）
  '辽宁': ['大连', '丹东', '营口', '盘锦', '锦州', '葫芦岛'],

  // 河北（3个）
  '河北': ['唐山', '秦皇岛', '沧州'],

  // 山东（7个）
  '山东': ['青岛', '东营', '烟台', '潍坊', '威海', '日照', '滨州'],

  // 江苏（3个）
  '江苏': ['连云港', '南通', '盐城'],

  // 浙江（7个）
  '浙江': ['杭州', '绍兴', '宁波', '温州', '嘉兴', '舟山', '台州'],

  // 福建（6个）
  '福建': ['福州', '厦门', '莆田', '泉州', '漳州', '宁德'],

  // 广东（14个）
  '广东': [
    '潮州', '汕头', '揭阳', '汕尾', '惠州', '深圳', '东莞',
    '广州', '中山', '珠海', '江门', '阳江', '茂名', '湛江'
  ],

  // 广西（3个）
  '广西': ['钦州', '北海', '防城港'],

  // 海南（4个）
  '海南': ['海口', '三亚', '儋州', '三沙']
};

// 合并所有沿海城市
const allCoastalCities = Object.values(coastalCities).flat();

// ============================================
// 三、其他标签定义
// ============================================

// 省会城市（34个）
const capitalCities = [
  '北京', '上海', '天津', '重庆', // 4个直辖市
  '石家庄', '太原', '呼和浩特', '沈阳', '长春', '哈尔滨', // 华北、东北
  '南京', '杭州', '合肥', '福州', '南昌', '济南', // 华东
  '郑州', '武汉', '长沙', // 华中
  '广州', '南宁', '海口', // 华南
  '成都', '贵阳', '昆明', '拉萨', // 西南
  '西安', '兰州', '西宁', '银川', '乌鲁木齐' // 西北
];

// 计划单列市（5个）
const separatelyPlannedCities = [
  '大连', '青岛', '宁波', '厦门', '深圳'
];

// ============================================
// 四、导入函数
// ============================================

async function importCityTags() {
  console.log('开始导入城市标签数据...\n');
  console.log('='.repeat(60));

  let totalAdded = 0;
  let totalSkipped = 0;

  try {
    // 获取所有城市
    const cities = await db.query('SELECT id, name FROM cities');
    console.log(`\n数据库中共有 ${cities.length} 个城市\n`);

    // ============================================
    // 1. 导入城市分级标签
    // ============================================
    console.log('[1/5] 导入城市分级标签...');

    for (const [tier, cityNames] of Object.entries(cityTiers)) {
      let count = 0;

      for (const cityName of cityNames) {
        const city = cities.find(c => c.name === cityName || c.name.includes(cityName));

        if (city) {
          // 检查标签是否已存在
          const existing = await db.get(
            'SELECT id FROM city_tags WHERE city_id = ? AND tag_key = ?',
            [city.id, 'city_tier']
          );

          if (!existing) {
            await db.run(
              `INSERT INTO city_tags (city_id, tag_key, tag_value, tag_name, tag_name_cn, is_primary)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [city.id, 'city_tier', tier, tier + '城市', tier + '城市', 1]
            );
            count++;
            totalAdded++;
          } else {
            totalSkipped++;
          }
        } else {
          console.log(`  ⚠️  未找到城市: ${cityName}`);
        }
      }

      console.log(`  ${tier}城市: ${count}个`);
    }

    // ============================================
    // 2. 导入沿海城市标签
    // ============================================
    console.log('\n[2/5] 导入沿海城市标签...');

    let coastalCount = 0;
    for (const cityName of allCoastalCities) {
      const city = cities.find(c => c.name === cityName || c.name.includes(cityName));

      if (city) {
        const existing = await db.get(
          'SELECT id FROM city_tags WHERE city_id = ? AND tag_key = ?',
          [city.id, 'coastal']
        );

        if (!existing) {
          await db.run(
            `INSERT INTO city_tags (city_id, tag_key, tag_value, tag_name, tag_name_cn, is_primary)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [city.id, 'coastal', 'true', '沿海城市', '沿海城市', 1]
          );
          coastalCount++;
          totalAdded++;
        } else {
          totalSkipped++;
        }
      }
    }

    console.log(`  沿海城市: ${coastalCount}个`);

    // ============================================
    // 3. 导入省会城市标签
    // ============================================
    console.log('\n[3/5] 导入省会城市标签...');

    let capitalCount = 0;
    for (const cityName of capitalCities) {
      const city = cities.find(c => c.name === cityName || c.name.includes(cityName));

      if (city) {
        const existing = await db.get(
          'SELECT id FROM city_tags WHERE city_id = ? AND tag_key = ?',
          [city.id, 'capital']
        );

        if (!existing) {
          await db.run(
            `INSERT INTO city_tags (city_id, tag_key, tag_value, tag_name, tag_name_cn, is_primary)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [city.id, 'capital', 'true', '省会城市', '省会城市', 1]
          );
          capitalCount++;
          totalAdded++;
        } else {
          totalSkipped++;
        }
      }
    }

    console.log(`  省会城市: ${capitalCount}个`);

    // ============================================
    // 4. 导入计划单列市标签
    // ============================================
    console.log('\n[4/5] 导入计划单列市标签...');

    let plannedCount = 0;
    for (const cityName of separatelyPlannedCities) {
      const city = cities.find(c => c.name === cityName || c.name.includes(cityName));

      if (city) {
        const existing = await db.get(
          'SELECT id FROM city_tags WHERE city_id = ? AND tag_key = ?',
          [city.id, 'separately_planned']
        );

        if (!existing) {
          await db.run(
            `INSERT INTO city_tags (city_id, tag_key, tag_value, tag_name, tag_name_cn, is_primary)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [city.id, 'separately_planned', 'true', '计划单列市', '计划单列市', 1]
          );
          plannedCount++;
          totalAdded++;
        } else {
          totalSkipped++;
        }
      }
    }

    console.log(`  计划单列市: ${plannedCount}个`);

    // ============================================
    // 5. 统计和验证
    // ============================================
    console.log('\n[5/5] 统计标签分布...');

    const tagStats = await db.query(`
      SELECT tag_key, tag_value, tag_name_cn, COUNT(*) as count
      FROM city_tags
      WHERE tag_key IN ('city_tier', 'coastal', 'capital', 'separately_planned')
      GROUP BY tag_key, tag_value
      ORDER BY tag_key,
        CASE tag_value
          WHEN '一线' THEN 1
          WHEN '新一线' THEN 2
          WHEN '二线' THEN 3
          ELSE 4
        END
    `);

    console.log('\n标签统计：');
    let currentKey = '';
    for (const stat of tagStats) {
      if (stat.tag_key !== currentKey) {
        console.log(`\n  ${stat.tag_key}:`);
        currentKey = stat.tag_key;
      }
      console.log(`    ${stat.tag_name_cn}: ${stat.count}个`);
    }

    // ============================================
    // 最终统计
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ 导入完成！\n');
    console.log(`总计：`);
    console.log(`  新增标签: ${totalAdded}`);
    console.log(`  跳过已存在: ${totalSkipped}`);
    console.log(`  总标签数: ${totalAdded + totalSkipped}`);

    // 验证沿海城市覆盖率
    const coastalInDb = await db.get(
      `SELECT COUNT(*) as count FROM city_tags WHERE tag_key = 'coastal'`
    );

    console.log(`\n沿海城市覆盖: ${coastalInDb.count}/${allCoastalCities.length} (${Math.round(coastalInDb.count / allCoastalCities.length * 100)}%)`);

    console.log('\n' + '='.repeat(60));

  } catch (error) {
    console.error('导入失败:', error);
    throw error;
  }
}

// ============================================
// 导出城市列表（供前端使用）
// ============================================

module.exports = {
  importCityTags,
  cityTiers,
  allCoastalCities,
  capitalCities,
  separatelyPlannedCities
};

// 如果直接运行此脚本
if (require.main === module) {
  importCityTags()
    .then(() => {
      console.log('\n✓ 可以关闭数据库连接');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ 导入失败:', error);
      process.exit(1);
    });
}
