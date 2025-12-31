const db = require('../models/database');

/**
 * 数据验证脚本
 * 检查数据完整性和质量
 */

async function validateData() {
  console.log('开始数据验证...\n');
  console.log('='.repeat(60));

  const issues = [];
  const warnings = [];

  try {
    // ============================================
    // 验证1: 检查必需字段
    // ============================================
    console.log('\n[1/7] 检查必需字段...');

    const citiesWithoutScore = await db.get(
      `SELECT COUNT(*) as count FROM cities WHERE overall_score IS NULL OR overall_score = 0`
    );

    if (citiesWithoutScore.count > 0) {
      issues.push(`🔴 ${citiesWithoutScore.count} 个城市缺少综合评分`);
    } else {
      console.log('✓ 所有城市都有综合评分');
    }

    const citiesWithoutCountry = await db.get(
      `SELECT COUNT(*) as count FROM cities WHERE country IS NULL OR country = ''`
    );

    if (citiesWithoutCountry.count > 0) {
      issues.push(`🔴 ${citiesWithoutCountry.count} 个城市缺少国家标识`);
    } else {
      console.log('✓ 所有城市都有国家标识');
    }

    const citiesWithoutDimensions = await db.get(
      `SELECT COUNT(*) as count FROM cities c
       LEFT JOIN city_dimensions cd ON c.id = cd.city_id
       WHERE cd.city_id IS NULL`
    );

    if (citiesWithoutDimensions.count > 0) {
      issues.push(`🔴 ${citiesWithoutDimensions.count} 个城市缺少维度数据`);
    } else {
      console.log('✓ 所有城市都有维度数据');
    }

    // ============================================
    // 验证2: 检查数据量
    // ============================================
    console.log('\n[2/7] 检查数据量...');

    const totalCities = await db.get(`SELECT COUNT(*) as count FROM cities`);
    console.log(`  总城市数: ${totalCities.count}`);

    if (totalCities.count < 50) {
      warnings.push(`⚠️  城市数量偏少 (${totalCities.count}个)，建议至少100个`);
    } else if (totalCities.count < 100) {
      warnings.push(`⚠️  城市数量一般 (${totalCities.count}个)，建议200+`);
    } else {
      console.log('✓ 城市数量充足');
    }

    // ============================================
    // 验证3: 检查沿海城市覆盖
    // ============================================
    console.log('\n[3/7] 检查沿海城市覆盖...');

    const coastalCities = ['青岛', '厦门', '大连', '三亚', '珠海', '烟台', '威海', '宁波',
                          '舟山', '福州', '泉州', '汕头', '湛江', '北海', '秦皇岛',
                          '连云港', '南通', '温州', '台州', '深圳', '广州', '上海'];

    const coastalInDb = await db.query(
      `SELECT name FROM cities WHERE name IN (${coastalCities.map(() => '?').join(',')})`,
      coastalCities
    );

    const coverage = (coastalInDb.length / coastalCities.length * 100).toFixed(1);
    console.log(`  沿海城市覆盖: ${coastalInDb.length}/22 (${coverage}%)`);

    const missing = coastalCities.filter(city =>
      !coastalInDb.some(c => c.name === city)
    );

    if (missing.length > 0) {
      warnings.push(`⚠️  缺少 ${missing.length} 个沿海城市: ${missing.slice(0, 5).join('、')}${missing.length > 5 ? '等' : ''}`);
    } else {
      console.log('✓ 所有沿海城市都已覆盖');
    }

    // ============================================
    // 验证4: 检查维度数据质量
    // ============================================
    console.log('\n[4/7] 检查维度数据质量...');

    const dimensionStats = await db.get(
      `SELECT
        AVG(living_cost) as avg_living_cost,
        AVG(air_quality) as avg_air_quality,
        AVG(elderly_care) as avg_elderly_care,
        AVG(employment) as avg_employment,
        AVG(safety) as avg_safety,
        MIN(living_cost) as min_living_cost,
        MAX(living_cost) as max_living_cost
      FROM city_dimensions`
    );

    console.log(`  生活成本: ${dimensionStats.min_living_cost?.toFixed(1)} - ${dimensionStats.max_living_cost?.toFixed(1)} (均值: ${dimensionStats.avg_living_cost?.toFixed(1)})`);
    console.log(`  空气质量均值: ${dimensionStats.avg_air_quality?.toFixed(1)}`);
    console.log(`  养老友好均值: ${dimensionStats.avg_elderly_care?.toFixed(1)}`);

    // 检查异常值
    const outliers = await db.query(
      `SELECT c.name, cd.living_cost, cd.air_quality
       FROM cities c
       JOIN city_dimensions cd ON c.id = cd.city_id
       WHERE cd.living_cost < 1 OR cd.living_cost > 10
          OR cd.air_quality < 1 OR cd.air_quality > 10`
    );

    if (outliers.length > 0) {
      warnings.push(`⚠️  发现 ${outliers.length} 个城市的维度数据异常（超出1-10范围）`);
    } else {
      console.log('✓ 所有维度数据在合理范围内');
    }

    // ============================================
    // 验证5: 检查快速入口筛选结果
    // ============================================
    console.log('\n[5/7] 检查快速入口筛选结果...');

    const filters = {
      '低生活成本': { field: 'living_cost', op: '<=', value: 5 },
      '适合养老': { field: 'elderly_care', op: '>=', value: 7 },
      '就业机会多': { field: 'employment', op: '>=', value: 7 },
      '空气好': { field: 'air_quality', op: '>=', value: 8 }
    };

    for (const [name, filter] of Object.entries(filters)) {
      const count = await db.get(
        `SELECT COUNT(*) as count
         FROM cities c
         JOIN city_dimensions cd ON c.id = cd.city_id
         WHERE cd.${filter.field} ${filter.op} ?`,
        [filter.value]
      );

      console.log(`  ${name}: ${count.count} 个城市`);

      if (count.count === 0) {
        issues.push(`🔴 "${name}"筛选结果为空`);
      } else if (count.count < 5) {
        warnings.push(`⚠️  "${name}"筛选结果过少 (${count.count}个)`);
      }
    }

    // ============================================
    // 验证6: 检查榜单数据
    // ============================================
    console.log('\n[6/7] 检查榜单数据...');

    const rankings = {
      '综合榜': 'overall_score',
      '性价比榜': 'living_cost',
      '养老榜': 'elderly_care',
      '空气质量榜': 'air_quality'
    };

    for (const [name, field] of Object.entries(rankings)) {
      let query;
      if (field === 'overall_score') {
        query = `SELECT COUNT(*) as count FROM cities WHERE overall_score > 0`;
      } else if (field === 'living_cost') {
        // 性价比榜需要 overall_score >= 70
        query = `SELECT COUNT(*) as count FROM cities c
                 JOIN city_dimensions cd ON c.id = cd.city_id
                 WHERE c.overall_score >= 70`;
      } else {
        query = `SELECT COUNT(*) as count FROM city_dimensions WHERE ${field} > 0`;
      }

      const count = await db.get(query);
      console.log(`  ${name}: ${count.count} 个城市`);

      if (count.count < 10) {
        warnings.push(`⚠️  ${name}数据不足 (${count.count}个)`);
      }
    }

    // ============================================
    // 验证7: 检查城市等级分布
    // ============================================
    console.log('\n[7/7] 检查城市等级分布...');

    const tierDistribution = await db.query(
      `SELECT city_tier, COUNT(*) as count
       FROM cities
       WHERE city_tier IS NOT NULL
       GROUP BY city_tier
       ORDER BY
         CASE city_tier
           WHEN '一线' THEN 1
           WHEN '新一线' THEN 2
           WHEN '二线' THEN 3
           WHEN '三线' THEN 4
         END`
    );

    if (tierDistribution.length > 0) {
      tierDistribution.forEach(tier => {
        console.log(`  ${tier.city_tier}: ${tier.count} 个城市`);
      });
    } else {
      issues.push(`🔴 所有城市都缺少等级标识`);
    }

    // ============================================
    // 输出验证结果
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 验证结果汇总:\n');

    if (issues.length === 0 && warnings.length === 0) {
      console.log('✅ 数据验证通过！所有检查项都符合要求。\n');
      return { success: true, issues: [], warnings: [] };
    }

    if (issues.length > 0) {
      console.log('🔴 严重问题 (必须修复):');
      issues.forEach(issue => console.log(`  ${issue}`));
      console.log();
    }

    if (warnings.length > 0) {
      console.log('⚠️  警告 (建议优化):');
      warnings.forEach(warning => console.log(`  ${warning}`));
      console.log();
    }

    console.log('💡 建议操作:');
    if (issues.length > 0) {
      console.log('  1. 运行数据改造脚本: node server/utils/upgradeData.js');
    }
    if (warnings.some(w => w.includes('城市数量'))) {
      console.log('  2. 导入更多城市数据');
    }
    if (warnings.some(w => w.includes('沿海城市'))) {
      console.log('  3. 补充缺失的沿海城市数据');
    }
    console.log();

    return {
      success: issues.length === 0,
      issues,
      warnings
    };

  } catch (error) {
    console.error('数据验证失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  validateData()
    .then((result) => {
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('验证失败:', error);
      process.exit(1);
    });
}

module.exports = { validateData };
