const db = require('../models/database');

/**
 * 城市初始数据种子文件
 * 包含中国主要城市的基本信息和评估维度
 */

const citiesData = [
  // 一线城市
  {
    name: '北京',
    province: '北京',
    population: 21893095,
    gdp: 41610.90,
    area: 16410.54,
    dimensions: {
      living_cost: 3.5,  // 生活成本较高，分数较低
      air_quality: 6.5,   // 空气质量中等
      medical_facilities: 9.8, // 医疗设施优秀
      employment: 9.5,    // 就业机会非常好
      safety: 9.0,        // 安全指数高
      elderly_care: 8.5   // 养老设施完善
    }
  },
  {
    name: '上海',
    province: '上海',
    population: 24870895,
    gdp: 43214.85,
    area: 6340.50,
    dimensions: {
      living_cost: 3.2,
      air_quality: 7.0,
      medical_facilities: 9.7,
      employment: 9.6,
      safety: 9.2,
      elderly_care: 8.8
    }
  },
  {
    name: '广州',
    province: '广东',
    population: 18676605,
    gdp: 28839.00,
    area: 7434.40,
    dimensions: {
      living_cost: 5.5,
      air_quality: 7.2,
      medical_facilities: 9.0,
      employment: 8.8,
      safety: 8.5,
      elderly_care: 8.0
    }
  },
  {
    name: '深圳',
    province: '广东',
    population: 17560061,
    gdp: 32387.68,
    area: 1997.47,
    dimensions: {
      living_cost: 3.8,
      air_quality: 7.8,
      medical_facilities: 8.8,
      employment: 9.5,
      safety: 8.8,
      elderly_care: 7.5
    }
  },

  // 新一线城市
  {
    name: '成都',
    province: '四川',
    population: 21192000,
    gdp: 20817.50,
    area: 14335.00,
    dimensions: {
      living_cost: 7.2,
      air_quality: 6.8,
      medical_facilities: 8.5,
      employment: 8.2,
      safety: 8.8,
      elderly_care: 8.5
    }
  },
  {
    name: '杭州',
    province: '浙江',
    population: 12204000,
    gdp: 18753.00,
    area: 16853.57,
    dimensions: {
      living_cost: 5.8,
      air_quality: 7.5,
      medical_facilities: 8.8,
      employment: 8.8,
      safety: 9.0,
      elderly_care: 8.2
    }
  },
  {
    name: '重庆',
    province: '重庆',
    population: 32054000,
    gdp: 27894.02,
    area: 82402.00,
    dimensions: {
      living_cost: 7.8,
      air_quality: 6.5,
      medical_facilities: 8.2,
      employment: 7.8,
      safety: 8.5,
      elderly_care: 7.8
    }
  },
  {
    name: '西安',
    province: '陕西',
    population: 13016000,
    gdp: 11486.51,
    area: 10752.00,
    dimensions: {
      living_cost: 7.5,
      air_quality: 6.2,
      medical_facilities: 8.0,
      employment: 7.5,
      safety: 8.2,
      elderly_care: 7.5
    }
  },
  {
    name: '苏州',
    province: '江苏',
    population: 12748262,
    gdp: 23958.34,
    area: 8657.32,
    dimensions: {
      living_cost: 6.5,
      air_quality: 7.2,
      medical_facilities: 8.5,
      employment: 8.5,
      safety: 9.0,
      elderly_care: 8.5
    }
  },
  {
    name: '武汉',
    province: '湖北',
    population: 13648000,
    gdp: 18866.43,
    area: 8569.15,
    dimensions: {
      living_cost: 7.0,
      air_quality: 6.8,
      medical_facilities: 8.8,
      employment: 8.0,
      safety: 8.5,
      elderly_care: 8.0
    }
  },
  {
    name: '南京',
    province: '江苏',
    population: 9423400,
    gdp: 16907.85,
    area: 6587.02,
    dimensions: {
      living_cost: 6.8,
      air_quality: 7.0,
      medical_facilities: 8.8,
      employment: 8.2,
      safety: 8.8,
      elderly_care: 8.5
    }
  },

  // 二线城市
  {
    name: '天津',
    province: '天津',
    population: 13866009,
    gdp: 15695.05,
    area: 11966.45,
    dimensions: {
      living_cost: 6.5,
      air_quality: 6.0,
      medical_facilities: 8.2,
      employment: 7.5,
      safety: 8.5,
      elderly_care: 8.0
    }
  },
  {
    name: '郑州',
    province: '河南',
    population: 12600574,
    gdp: 12691.02,
    area: 7446.00,
    dimensions: {
      living_cost: 7.5,
      air_quality: 5.8,
      medical_facilities: 7.8,
      employment: 7.5,
      safety: 8.2,
      elderly_care: 7.5
    }
  },
  {
    name: '长沙',
    province: '湖南',
    population: 10240000,
    gdp: 13270.70,
    area: 11819.00,
    dimensions: {
      living_cost: 7.8,
      air_quality: 7.0,
      medical_facilities: 8.0,
      employment: 7.8,
      safety: 8.5,
      elderly_care: 7.8
    }
  },
  {
    name: '沈阳',
    province: '辽宁',
    population: 9070093,
    gdp: 7248.70,
    area: 12948.00,
    dimensions: {
      living_cost: 7.2,
      air_quality: 6.0,
      medical_facilities: 7.8,
      employment: 6.8,
      safety: 8.0,
      elderly_care: 7.5
    }
  },
  {
    name: '青岛',
    province: '山东',
    population: 10718000,
    gdp: 14920.75,
    area: 11293.00,
    dimensions: {
      living_cost: 7.0,
      air_quality: 8.2,
      medical_facilities: 8.0,
      employment: 7.8,
      safety: 8.8,
      elderly_care: 8.2
    }
  },
  {
    name: '大连',
    province: '辽宁',
    population: 7450785,
    gdp: 8476.10,
    area: 12573.85,
    dimensions: {
      living_cost: 7.2,
      air_quality: 8.0,
      medical_facilities: 7.8,
      employment: 7.2,
      safety: 8.5,
      elderly_care: 8.0
    }
  },
  {
    name: '厦门',
    province: '福建',
    population: 5280000,
    gdp: 7034.00,
    area: 1700.61,
    dimensions: {
      living_cost: 6.0,
      air_quality: 9.0,
      medical_facilities: 7.8,
      employment: 7.5,
      safety: 9.0,
      elderly_care: 8.5
    }
  },
  {
    name: '宁波',
    province: '浙江',
    population: 9540000,
    gdp: 15704.28,
    area: 9816.00,
    dimensions: {
      living_cost: 6.8,
      air_quality: 7.8,
      medical_facilities: 8.0,
      employment: 8.0,
      safety: 8.8,
      elderly_care: 8.0
    }
  },
  {
    name: '昆明',
    province: '云南',
    population: 8500000,
    gdp: 7353.90,
    area: 21012.54,
    dimensions: {
      living_cost: 7.5,
      air_quality: 8.5,
      medical_facilities: 7.5,
      employment: 7.0,
      safety: 8.2,
      elderly_care: 8.8
    }
  },
  {
    name: '福州',
    province: '福建',
    population: 8291268,
    gdp: 11324.48,
    area: 11968.00,
    dimensions: {
      living_cost: 7.0,
      air_quality: 8.0,
      medical_facilities: 7.8,
      employment: 7.5,
      safety: 8.5,
      elderly_care: 7.8
    }
  },

  // 其他重要城市
  {
    name: '济南',
    province: '山东',
    population: 9321600,
    gdp: 12027.50,
    area: 10244.45,
    dimensions: {
      living_cost: 7.5,
      air_quality: 6.5,
      medical_facilities: 7.8,
      employment: 7.5,
      safety: 8.5,
      elderly_care: 7.8
    }
  },
  {
    name: '合肥',
    province: '安徽',
    population: 9369881,
    gdp: 11412.80,
    area: 11445.10,
    dimensions: {
      living_cost: 7.8,
      air_quality: 7.0,
      medical_facilities: 7.8,
      employment: 7.8,
      safety: 8.5,
      elderly_care: 7.5
    }
  },
  {
    name: '南昌',
    province: '江西',
    population: 6437000,
    gdp: 7203.50,
    area: 7402.36,
    dimensions: {
      living_cost: 8.0,
      air_quality: 7.2,
      medical_facilities: 7.5,
      employment: 7.2,
      safety: 8.2,
      elderly_care: 7.5
    }
  },
  {
    name: '太原',
    province: '山西',
    population: 5304000,
    gdp: 5571.18,
    area: 6988.00,
    dimensions: {
      living_cost: 8.0,
      air_quality: 5.5,
      medical_facilities: 7.5,
      employment: 7.0,
      safety: 8.0,
      elderly_care: 7.2
    }
  },
  {
    name: '石家庄',
    province: '河北',
    population: 11235086,
    gdp: 7100.60,
    area: 14464.00,
    dimensions: {
      living_cost: 7.8,
      air_quality: 5.2,
      medical_facilities: 7.5,
      employment: 7.2,
      safety: 8.0,
      elderly_care: 7.5
    }
  },
  {
    name: '哈尔滨',
    province: '黑龙江',
    population: 10009854,
    gdp: 5351.70,
    area: 53100.00,
    dimensions: {
      living_cost: 8.0,
      air_quality: 6.5,
      medical_facilities: 7.5,
      employment: 6.5,
      safety: 7.8,
      elderly_care: 7.0
    }
  },
  {
    name: '长春',
    province: '吉林',
    population: 9066906,
    gdp: 6744.00,
    area: 24592.00,
    dimensions: {
      living_cost: 7.8,
      air_quality: 6.8,
      medical_facilities: 7.5,
      employment: 6.8,
      safety: 8.0,
      elderly_care: 7.2
    }
  },
  {
    name: '南宁',
    province: '广西',
    population: 8741584,
    gdp: 5120.94,
    area: 22112.00,
    dimensions: {
      living_cost: 8.0,
      air_quality: 8.2,
      medical_facilities: 7.2,
      employment: 7.0,
      safety: 8.2,
      elderly_care: 7.8
    }
  },
  {
    name: '贵阳',
    province: '贵州',
    population: 5987018,
    gdp: 4711.04,
    area: 8034.00,
    dimensions: {
      living_cost: 8.0,
      air_quality: 8.5,
      medical_facilities: 7.2,
      employment: 7.0,
      safety: 8.0,
      elderly_care: 7.5
    }
  },
  {
    name: '兰州',
    province: '甘肃',
    population: 4359446,
    gdp: 3231.30,
    area: 13100.00,
    dimensions: {
      living_cost: 8.2,
      air_quality: 6.0,
      medical_facilities: 7.0,
      employment: 6.8,
      safety: 7.8,
      elderly_care: 7.2
    }
  },
  {
    name: '乌鲁木齐',
    province: '新疆',
    population: 4054369,
    gdp: 3690.00,
    area: 14216.30,
    dimensions: {
      living_cost: 7.5,
      air_quality: 6.2,
      medical_facilities: 7.0,
      employment: 7.0,
      safety: 8.5,
      elderly_care: 7.0
    }
  },
  {
    name: '拉萨',
    province: '西藏',
    population: 867891,
    gdp: 678.10,
    area: 29538.90,
    dimensions: {
      living_cost: 7.0,
      air_quality: 9.8,
      medical_facilities: 6.5,
      employment: 6.5,
      safety: 9.0,
      elderly_care: 6.5
    }
  },
  {
    name: '海口',
    province: '海南',
    population: 2873358,
    gdp: 2009.70,
    area: 2290.00,
    dimensions: {
      living_cost: 7.2,
      air_quality: 9.5,
      medical_facilities: 7.0,
      employment: 6.8,
      safety: 8.5,
      elderly_care: 9.0
    }
  },
  {
    name: '珠海',
    province: '广东',
    population: 2439585,
    gdp: 4045.45,
    area: 1736.46,
    dimensions: {
      living_cost: 6.2,
      air_quality: 8.8,
      medical_facilities: 7.8,
      employment: 7.8,
      safety: 9.0,
      elderly_care: 8.5
    }
  },
  {
    name: '三亚',
    province: '海南',
    population: 1031396,
    gdp: 835.90,
    area: 1919.58,
    dimensions: {
      living_cost: 6.0,
      air_quality: 9.8,
      medical_facilities: 6.8,
      employment: 6.5,
      safety: 8.2,
      elderly_care: 9.2
    }
  }
];

/**
 * 计算城市综合评分
 */
function calculateOverallScore(dimensions) {
  const weights = {
    living_cost: 0.20,      // 生活成本权重20%
    air_quality: 0.15,      // 空气质量权重15%
    medical_facilities: 0.15, // 医疗设施权重15%
    employment: 0.20,       // 就业机会权重20%
    safety: 0.15,           // 安全指数权重15%
    elderly_care: 0.15      // 养老适宜权重15%
  };

  let totalScore = 0;
  for (const [key, value] of Object.entries(dimensions)) {
    totalScore += value * weights[key];
  }

  return parseFloat(totalScore.toFixed(2));
}

/**
 * 填充城市数据到数据库
 */
async function seedCities() {
  console.log('开始填充城市数据...');

  let successCount = 0;
  let errorCount = 0;

  for (const cityData of citiesData) {
    try {
      // 计算综合评分
      const overallScore = calculateOverallScore(cityData.dimensions);

      // 检查城市是否已存在
      const existingCity = await db.get(
        'SELECT id FROM cities WHERE name = ? AND province = ?',
        [cityData.name, cityData.province]
      );

      let cityId;

      if (existingCity) {
        // 更新现有城市
        await db.run(
          `UPDATE cities
           SET population = ?, gdp = ?, area = ?, overall_score = ?,
               status = 'approved', updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [cityData.population, cityData.gdp, cityData.area, overallScore, existingCity.id]
        );
        cityId = existingCity.id;
        console.log(`✓ 更新城市: ${cityData.name}`);
      } else {
        // 插入新城市
        const result = await db.run(
          `INSERT INTO cities (name, province, population, gdp, area, overall_score, status)
           VALUES (?, ?, ?, ?, ?, ?, 'approved')`,
          [cityData.name, cityData.province, cityData.population,
           cityData.gdp, cityData.area, overallScore]
        );
        cityId = result.id;
        console.log(`✓ 添加城市: ${cityData.name}`);
      }

      // 检查维度数据是否存在
      const existingDimensions = await db.get(
        'SELECT id FROM city_dimensions WHERE city_id = ?',
        [cityId]
      );

      if (existingDimensions) {
        // 更新维度数据
        await db.run(
          `UPDATE city_dimensions
           SET living_cost = ?, air_quality = ?, medical_facilities = ?,
               employment = ?, safety = ?, elderly_care = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE city_id = ?`,
          [
            cityData.dimensions.living_cost,
            cityData.dimensions.air_quality,
            cityData.dimensions.medical_facilities,
            cityData.dimensions.employment,
            cityData.dimensions.safety,
            cityData.dimensions.elderly_care,
            cityId
          ]
        );
      } else {
        // 插入维度数据
        await db.run(
          `INSERT INTO city_dimensions
           (city_id, living_cost, air_quality, medical_facilities,
            employment, safety, elderly_care)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            cityId,
            cityData.dimensions.living_cost,
            cityData.dimensions.air_quality,
            cityData.dimensions.medical_facilities,
            cityData.dimensions.employment,
            cityData.dimensions.safety,
            cityData.dimensions.elderly_care
          ]
        );
      }

      successCount++;
    } catch (error) {
      console.error(`✗ 处理城市 ${cityData.name} 失败:`, error.message);
      errorCount++;
    }
  }

  console.log('\n数据填充完成！');
  console.log(`成功: ${successCount} 个城市`);
  console.log(`失败: ${errorCount} 个城市`);
  console.log(`总计: ${citiesData.length} 个城市`);

  return { success: successCount, error: errorCount, total: citiesData.length };
}

// 如果直接运行此文件
if (require.main === module) {
  seedCities()
    .then(() => {
      console.log('\n✓ 所有操作已完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ 发生错误:', error);
      process.exit(1);
    });
}

module.exports = { seedCities, citiesData };
