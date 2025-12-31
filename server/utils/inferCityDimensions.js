const db = require('../models/database');

/**
 * 智能推断城市维度数据
 *
 * 基于已有数据（城市等级、地理位置、人口、GDP等）推断缺失的维度评分
 *
 * 推断规则：
 * 1. 城市等级：一线>新一线>二线>三线
 * 2. 地理位置：沿海、省会有加分
 * 3. 人口规模：影响就业和生活成本
 * 4. 随机波动：使数据更真实
 */

// 基础评分模板（基于城市等级）
const TIER_BASE_SCORES = {
  '一线': {
    living_cost: 3.5,        // 生活成本高（分数低）
    air_quality: 6.5,        // 空气质量中等
    medical_facilities: 9.5, // 医疗设施优秀
    employment: 9.3,         // 就业机会优秀
    safety: 9.0,             // 安全性高
    elderly_care: 8.5        // 养老设施完善
  },
  '新一线': {
    living_cost: 5.5,
    air_quality: 7.0,
    medical_facilities: 8.3,
    employment: 8.0,
    safety: 8.3,
    elderly_care: 7.8
  },
  '二线': {
    living_cost: 6.8,
    air_quality: 7.2,
    medical_facilities: 7.5,
    employment: 7.0,
    safety: 7.8,
    elderly_care: 7.2
  },
  '三线': {
    living_cost: 8.0,
    air_quality: 6.8,
    medical_facilities: 6.5,
    employment: 6.0,
    safety: 7.5,
    elderly_care: 6.5
  },
  '默认': { // 无等级信息的城市
    living_cost: 7.5,
    air_quality: 7.0,
    medical_facilities: 6.8,
    employment: 6.5,
    safety: 7.5,
    elderly_care: 6.8
  }
};

/**
 * 获取城市的标签
 */
async function getCityTags(cityId) {
  const tags = await db.query(
    'SELECT tag_key, tag_value FROM city_tags WHERE city_id = ?',
    [cityId]
  );

  const tagMap = {};
  tags.forEach(tag => {
    tagMap[tag.tag_key] = tag.tag_value;
  });

  return tagMap;
}

/**
 * 推断单个城市的维度数据
 */
async function inferDimensions(city) {
  // 获取城市标签
  const tags = await getCityTags(city.id);

  // 1. 确定基础评分（基于城市等级）
  const tier = tags.city_tier || '默认';
  let scores = { ...TIER_BASE_SCORES[tier] || TIER_BASE_SCORES['默认'] };

  // 2. 沿海城市调整
  if (tags.coastal === 'true') {
    scores.air_quality += 0.5;    // 空气质量通常更好
    scores.living_cost -= 1.0;    // 生活成本更高
  }

  // 3. 省会城市调整
  if (tags.capital === 'true') {
    scores.medical_facilities += 0.8; // 医疗资源更好
    scores.employment += 0.8;         // 就业机会更多
    scores.elderly_care += 0.5;       // 养老设施更完善
  }

  // 4. 计划单列市调整
  if (tags.separately_planned === 'true') {
    scores.employment += 0.5;
    scores.medical_facilities += 0.5;
  }

  // 5. 基于人口调整
  if (city.population) {
    if (city.population > 10000000) {
      scores.employment += 1.0;
      scores.living_cost -= 0.8;  // 大城市成本高
      scores.medical_facilities += 0.5;
    } else if (city.population > 5000000) {
      scores.employment += 0.6;
      scores.living_cost -= 0.4;
    } else if (city.population < 1000000) {
      scores.living_cost += 1.2;  // 小城市成本低
      scores.employment -= 0.5;
    }
  }

  // 6. 基于GDP调整（如果有）
  if (city.gdp) {
    if (city.gdp > 10000) { // GDP > 1万亿
      scores.employment += 1.0;
      scores.medical_facilities += 0.5;
    } else if (city.gdp > 5000) { // GDP > 5000亿
      scores.employment += 0.5;
    }
  }

  // 7. 基于省份调整（某些省份空气质量普遍较差）
  const poorAirQualityProvinces = ['河北', '河南', '山西', '陕西'];
  const goodAirQualityProvinces = ['云南', '贵州', '西藏', '海南', '福建'];

  if (city.province && poorAirQualityProvinces.includes(city.province)) {
    scores.air_quality -= 1.0;
  } else if (city.province && goodAirQualityProvinces.includes(city.province)) {
    scores.air_quality += 1.0;
  }

  // 8. 添加随机波动（±0.3）使数据更真实
  Object.keys(scores).forEach(key => {
    const variance = (Math.random() - 0.5) * 0.6; // -0.3 到 +0.3
    scores[key] += variance;
  });

  // 9. 确保分数在合理区间 [0-10]
  Object.keys(scores).forEach(key => {
    scores[key] = Math.max(0, Math.min(10, scores[key]));
    scores[key] = Math.round(scores[key] * 100) / 100; // 保留两位小数
  });

  return scores;
}

/**
 * 批量推断并更新城市维度数据
 */
async function inferAllCityDimensions() {
  console.log('开始推断城市维度数据...\n');

  try {
    // 获取所有城市
    const cities = await db.query('SELECT * FROM cities');
    console.log(`找到 ${cities.length} 个城市`);

    // 获取已有维度数据的城市
    const existingDimensions = await db.query(
      'SELECT DISTINCT city_id FROM city_dimensions'
    );
    const existingCityIds = new Set(existingDimensions.map(d => d.city_id));
    console.log(`其中 ${existingCityIds.size} 个城市已有维度数据`);

    // 筛选出需要推断的城市
    const citiesToInfer = cities.filter(city => !existingCityIds.has(city.id));
    console.log(`需要推断 ${citiesToInfer.length} 个城市\n`);

    if (citiesToInfer.length === 0) {
      console.log('✓ 所有城市都已有维度数据，无需推断');
      return { success: 0, skipped: cities.length, total: cities.length };
    }

    let successCount = 0;
    let errorCount = 0;

    // 按城市等级分组统计
    const tierStats = {
      '一线': 0,
      '新一线': 0,
      '二线': 0,
      '三线': 0,
      '其他': 0
    };

    // 批量推断
    for (const city of citiesToInfer) {
      try {
        // 推断维度数据
        const dimensions = await inferDimensions(city);

        // 插入数据库
        await db.run(`
          INSERT INTO city_dimensions (
            city_id, living_cost, air_quality, medical_facilities,
            employment, safety, elderly_care
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          city.id,
          dimensions.living_cost,
          dimensions.air_quality,
          dimensions.medical_facilities,
          dimensions.employment,
          dimensions.safety,
          dimensions.elderly_care
        ]);

        // 更新城市的overall_score（简单平均）
        const overallScore = (
          (10 - dimensions.living_cost) + // 生活成本低=好，需要转换
          dimensions.air_quality +
          dimensions.medical_facilities +
          dimensions.employment +
          dimensions.safety +
          dimensions.elderly_care
        ) / 6;

        await db.run(
          'UPDATE cities SET overall_score = ? WHERE id = ?',
          [Math.round(overallScore * 100) / 100, city.id]
        );

        // 统计
        const tags = await getCityTags(city.id);
        const tier = tags.city_tier || '其他';
        tierStats[tier] = (tierStats[tier] || 0) + 1;

        successCount++;

        if (successCount % 50 === 0) {
          console.log(`  进度: ${successCount}/${citiesToInfer.length}`);
        }

      } catch (error) {
        console.error(`✗ 处理城市 ${city.name} 失败:`, error.message);
        errorCount++;
      }
    }

    console.log('\n推断完成！');
    console.log(`成功: ${successCount} 个城市`);
    console.log(`失败: ${errorCount} 个城市`);
    console.log(`总计: ${citiesToInfer.length} 个城市\n`);

    console.log('按城市等级统计：');
    Object.entries(tierStats).forEach(([tier, count]) => {
      if (count > 0) {
        console.log(`  ${tier}: ${count}个`);
      }
    });

    // 最终统计
    const finalDimensionsCount = await db.get(
      'SELECT COUNT(DISTINCT city_id) as count FROM city_dimensions'
    );
    const totalCities = cities.length;
    const coverage = Math.round(finalDimensionsCount.count / totalCities * 100);

    console.log('\n=== 最终统计 ===');
    console.log(`城市总数: ${totalCities}`);
    console.log(`有维度数据: ${finalDimensionsCount.count}`);
    console.log(`覆盖率: ${coverage}%`);

    // 显示示例数据
    console.log('\n=== 示例数据 ===');
    const samples = await db.query(`
      SELECT c.name, c.province,
             cd.living_cost, cd.air_quality, cd.medical_facilities,
             cd.employment, cd.safety, cd.elderly_care,
             c.overall_score
      FROM cities c
      JOIN city_dimensions cd ON c.id = cd.city_id
      WHERE c.id IN (
        SELECT id FROM cities
        WHERE id NOT IN (${Array.from(existingCityIds).join(',') || '0'})
        LIMIT 5
      )
    `);

    samples.forEach(city => {
      console.log(`\n${city.name} (${city.province})`);
      console.log(`  生活成本: ${city.living_cost} | 空气质量: ${city.air_quality}`);
      console.log(`  医疗设施: ${city.medical_facilities} | 就业机会: ${city.employment}`);
      console.log(`  安全指数: ${city.safety} | 养老设施: ${city.elderly_care}`);
      console.log(`  综合评分: ${city.overall_score}`);
    });

    return {
      success: successCount,
      error: errorCount,
      skipped: existingCityIds.size,
      total: cities.length,
      coverage: coverage
    };

  } catch (error) {
    console.error('推断失败:', error);
    throw error;
  }
}

// 执行推断
if (require.main === module) {
  inferAllCityDimensions()
    .then(() => {
      console.log('\n✓ 所有操作已完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ 发生错误:', error);
      process.exit(1);
    });
}

module.exports = { inferAllCityDimensions, inferDimensions };
