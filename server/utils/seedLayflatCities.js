/**
 * 躺平小城示例数据
 * MVP版本：30个精选小城
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../database.sqlite');

// 30个躺平小城数据
const layflatCities = [
  {
    name: '威海',
    province: '山东',
    country: '中国',
    slogan: '四季如春的低成本海滨小城',
    population: 2900000,
    avg_rent: 800,
    avg_temp: 13.0,
    distance_to_sea: 0,
    city_tier: 'tier3',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 9.2, climate: 8.8, slow_pace: 8.5, medical_access: 7.5,
      nature: 9.0, population_density: 8.0, price_index: 8.5, digital_facilities: 7.0
    },
    tags: ['seaside', 'spring_climate', 'low_rent', 'quiet']
  },
  {
    name: '北海',
    province: '广西',
    country: '中国',
    slogan: '南方海滨养老天堂',
    population: 1700000,
    avg_rent: 900,
    avg_temp: 23.0,
    distance_to_sea: 0,
    city_tier: 'tier3',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 8.8, climate: 9.5, slow_pace: 9.0, medical_access: 7.0,
      nature: 9.5, population_density: 9.0, price_index: 8.0, digital_facilities: 6.5
    },
    tags: ['seaside', 'spring_climate', 'low_rent', 'elderly_friendly']
  },
  {
    name: '日照',
    province: '山东',
    country: '中国',
    slogan: '阳光海岸超低房租',
    population: 2900000,
    avg_rent: 600,
    avg_temp: 13.5,
    distance_to_sea: 0,
    city_tier: 'tier3',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 9.5, climate: 8.5, slow_pace: 8.8, medical_access: 7.2,
      nature: 9.0, population_density: 8.5, price_index: 9.0, digital_facilities: 6.8
    },
    tags: ['seaside', 'low_rent', 'quiet']
  },
  {
    name: '大理',
    province: '云南',
    country: '中国',
    slogan: '数字游民圣地',
    population: 670000,
    avg_rent: 1200,
    avg_temp: 15.0,
    has_lake: 1,
    altitude: 1976,
    city_tier: 'small',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 7.5, climate: 9.8, slow_pace: 9.5, medical_access: 6.5,
      nature: 10.0, population_density: 9.5, price_index: 7.0, digital_facilities: 9.0
    },
    tags: ['lake', 'spring_climate', 'digital_nomad', 'mountain']
  },
  {
    name: '丽江',
    province: '云南',
    country: '中国',
    slogan: '山居慢生活',
    population: 1300000,
    avg_rent: 1000,
    avg_temp: 13.0,
    altitude: 2418,
    city_tier: 'small',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 8.0, climate: 9.0, slow_pace: 9.8, medical_access: 6.0,
      nature: 10.0, population_density: 9.0, price_index: 7.5, digital_facilities: 8.0
    },
    tags: ['mountain', 'spring_climate', 'digital_nomad']
  },
  {
    name: '烟台',
    province: '山东',
    country: '中国',
    slogan: '宜居海滨城市',
    population: 7000000,
    avg_rent: 900,
    avg_temp: 12.5,
    distance_to_sea: 0,
    city_tier: 'tier3',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 8.8, climate: 8.5, slow_pace: 7.5, medical_access: 8.5,
      nature: 9.0, population_density: 7.0, price_index: 8.0, digital_facilities: 7.5
    },
    tags: ['seaside', 'medical_complete', 'low_rent']
  },
  {
    name: '惠州',
    province: '广东',
    country: '中国',
    slogan: '临深宜居小城',
    population: 6000000,
    avg_rent: 1100,
    avg_temp: 22.0,
    distance_to_sea: 5,
    city_tier: 'tier3',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 7.8, climate: 9.0, slow_pace: 7.0, medical_access: 8.0,
      nature: 8.5, population_density: 7.5, price_index: 7.5, digital_facilities: 8.5
    },
    tags: ['seaside', 'spring_climate']
  },
  {
    name: '秦皇岛',
    province: '河北',
    country: '中国',
    slogan: '京津后花园',
    population: 3100000,
    avg_rent: 700,
    avg_temp: 10.5,
    distance_to_sea: 0,
    city_tier: 'tier3',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 9.0, climate: 7.5, slow_pace: 8.5, medical_access: 8.0,
      nature: 9.0, population_density: 8.5, price_index: 8.5, digital_facilities: 7.0
    },
    tags: ['seaside', 'low_rent', 'quiet']
  },
  {
    name: '珠海',
    province: '广东',
    country: '中国',
    slogan: '高品质海滨城市',
    population: 2400000,
    avg_rent: 1500,
    avg_temp: 22.5,
    distance_to_sea: 0,
    city_tier: 'tier2',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 6.5, climate: 9.5, slow_pace: 8.0, medical_access: 9.0,
      nature: 9.5, population_density: 8.5, price_index: 6.5, digital_facilities: 9.0
    },
    tags: ['seaside', 'medical_complete', 'digital_nomad']
  },
  {
    name: '桂林',
    province: '广西',
    country: '中国',
    slogan: '山水甲天下',
    population: 5300000,
    avg_rent: 800,
    avg_temp: 19.0,
    altitude: 150,
    city_tier: 'tier3',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 9.0, climate: 9.0, slow_pace: 9.0, medical_access: 7.5,
      nature: 10.0, population_density: 8.0, price_index: 8.5, digital_facilities: 7.0
    },
    tags: ['mountain', 'spring_climate', 'low_rent']
  },
  {
    name: '昆明',
    province: '云南',
    country: '中国',
    slogan: '春城无处不飞花',
    population: 8500000,
    avg_rent: 1200,
    avg_temp: 15.0,
    altitude: 1891,
    city_tier: 'tier2',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 7.5, climate: 10.0, slow_pace: 7.5, medical_access: 9.0,
      nature: 9.0, population_density: 7.0, price_index: 7.5, digital_facilities: 8.5
    },
    tags: ['spring_climate', 'medical_complete', 'mountain']
  },
  {
    name: '湛江',
    province: '广东',
    country: '中国',
    slogan: '低调的海滨小城',
    population: 7000000,
    avg_rent: 700,
    avg_temp: 23.0,
    distance_to_sea: 0,
    city_tier: 'tier3',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 9.2, climate: 8.8, slow_pace: 8.8, medical_access: 7.0,
      nature: 9.0, population_density: 8.0, price_index: 9.0, digital_facilities: 6.5
    },
    tags: ['seaside', 'low_rent', 'quiet']
  },
  {
    name: '泰安',
    province: '山东',
    country: '中国',
    slogan: '泰山脚下慢生活',
    population: 5600000,
    avg_rent: 650,
    avg_temp: 13.0,
    altitude: 150,
    city_tier: 'tier3',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 9.3, climate: 7.8, slow_pace: 9.0, medical_access: 7.5,
      nature: 8.5, population_density: 8.5, price_index: 9.0, digital_facilities: 6.8
    },
    tags: ['mountain', 'low_rent', 'quiet']
  },
  {
    name: '南宁',
    province: '广西',
    country: '中国',
    slogan: '绿城慢节奏',
    population: 8700000,
    avg_rent: 1000,
    avg_temp: 21.5,
    city_tier: 'tier2',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 8.0, climate: 9.2, slow_pace: 8.5, medical_access: 8.5,
      nature: 8.5, population_density: 7.5, price_index: 8.0, digital_facilities: 8.0
    },
    tags: ['spring_climate', 'medical_complete']
  },
  {
    name: '遵义',
    province: '贵州',
    country: '中国',
    slogan: '红色小城慢生活',
    population: 6600000,
    avg_rent: 600,
    avg_temp: 15.0,
    altitude: 840,
    city_tier: 'tier3',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 9.5, climate: 8.8, slow_pace: 9.2, medical_access: 7.0,
      nature: 8.5, population_density: 8.8, price_index: 9.2, digital_facilities: 6.5
    },
    tags: ['mountain', 'spring_climate', 'low_rent', 'quiet']
  },
  {
    name: '西昌',
    province: '四川',
    country: '中国',
    slogan: '阳光小城',
    population: 870000,
    avg_rent: 700,
    avg_temp: 17.0,
    has_lake: 1,
    altitude: 1500,
    city_tier: 'small',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 9.0, climate: 9.5, slow_pace: 9.5, medical_access: 6.5,
      nature: 9.5, population_density: 9.5, price_index: 8.5, digital_facilities: 6.0
    },
    tags: ['lake', 'spring_climate', 'low_rent', 'quiet', 'mountain']
  },
  {
    name: '曲靖',
    province: '云南',
    country: '中国',
    slogan: '珠江源头宜居城',
    population: 6500000,
    avg_rent: 600,
    avg_temp: 14.0,
    altitude: 1881,
    city_tier: 'tier3',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 9.5, climate: 9.0, slow_pace: 9.0, medical_access: 7.0,
      nature: 8.5, population_density: 8.5, price_index: 9.0, digital_facilities: 6.5
    },
    tags: ['mountain', 'spring_climate', 'low_rent', 'quiet']
  },
  {
    name: '防城港',
    province: '广西',
    country: '中国',
    slogan: '边境海滨小城',
    population: 1000000,
    avg_rent: 600,
    avg_temp: 22.5,
    distance_to_sea: 0,
    city_tier: 'small',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 9.5, climate: 9.2, slow_pace: 9.5, medical_access: 6.0,
      nature: 9.5, population_density: 9.8, price_index: 9.0, digital_facilities: 5.5
    },
    tags: ['seaside', 'spring_climate', 'low_rent', 'quiet']
  },
  {
    name: '荣成',
    province: '山东',
    country: '中国',
    slogan: '中国最美海岸线',
    population: 670000,
    avg_rent: 500,
    avg_temp: 12.0,
    distance_to_sea: 0,
    city_tier: 'small',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 10.0, climate: 8.0, slow_pace: 9.8, medical_access: 6.5,
      nature: 10.0, population_density: 9.8, price_index: 9.5, digital_facilities: 5.5
    },
    tags: ['seaside', 'low_rent', 'quiet']
  },
  {
    name: '攀枝花',
    province: '四川',
    country: '中国',
    slogan: '阳光康养之城',
    population: 1210000,
    avg_rent: 650,
    avg_temp: 20.5,
    altitude: 1000,
    city_tier: 'tier3',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 9.2, climate: 9.5, slow_pace: 9.0, medical_access: 7.0,
      nature: 8.5, population_density: 9.0, price_index: 8.8, digital_facilities: 6.0
    },
    tags: ['mountain', 'spring_climate', 'low_rent', 'elderly_friendly']
  },
  {
    name: '舟山',
    province: '浙江',
    country: '中国',
    slogan: '千岛之城',
    population: 1170000,
    avg_rent: 900,
    avg_temp: 16.5,
    distance_to_sea: 0,
    city_tier: 'tier3',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 8.5, climate: 8.8, slow_pace: 9.0, medical_access: 7.5,
      nature: 10.0, population_density: 9.0, price_index: 7.8, digital_facilities: 7.0
    },
    tags: ['seaside', 'spring_climate', 'quiet']
  },
  {
    name: '乳山',
    province: '山东',
    country: '中国',
    slogan: '超低成本海滨养老',
    population: 530000,
    avg_rent: 400,
    avg_temp: 12.0,
    distance_to_sea: 0,
    city_tier: 'small',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 10.0, climate: 8.0, slow_pace: 9.8, medical_access: 6.0,
      nature: 9.5, population_density: 10.0, price_index: 10.0, digital_facilities: 5.0
    },
    tags: ['seaside', 'low_rent', 'quiet', 'elderly_friendly']
  },
  {
    name: '芒市',
    province: '云南',
    country: '中国',
    slogan: '边境小城慢生活',
    population: 420000,
    avg_rent: 500,
    avg_temp: 19.0,
    altitude: 870,
    city_tier: 'small',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 9.8, climate: 9.2, slow_pace: 9.8, medical_access: 5.5,
      nature: 9.0, population_density: 10.0, price_index: 9.5, digital_facilities: 5.0
    },
    tags: ['mountain', 'spring_climate', 'low_rent', 'quiet']
  },
  {
    name: '玉溪',
    province: '云南',
    country: '中国',
    slogan: '抚仙湖畔宜居城',
    population: 2350000,
    avg_rent: 800,
    avg_temp: 16.0,
    has_lake: 1,
    altitude: 1630,
    city_tier: 'tier3',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 9.0, climate: 9.5, slow_pace: 9.0, medical_access: 7.0,
      nature: 10.0, population_density: 8.5, price_index: 8.5, digital_facilities: 6.8
    },
    tags: ['lake', 'spring_climate', 'low_rent', 'mountain']
  },
  {
    name: '文山',
    province: '云南',
    country: '中国',
    slogan: '世外桃源',
    population: 3600000,
    avg_rent: 550,
    avg_temp: 17.5,
    altitude: 1260,
    city_tier: 'tier3',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 9.6, climate: 9.0, slow_pace: 9.5, medical_access: 6.5,
      nature: 9.0, population_density: 9.0, price_index: 9.2, digital_facilities: 5.5
    },
    tags: ['mountain', 'spring_climate', 'low_rent', 'quiet']
  },
  {
    name: '三亚',
    province: '海南',
    country: '中国',
    slogan: '热带海滨度假城',
    population: 1030000,
    avg_rent: 1800,
    avg_temp: 25.5,
    distance_to_sea: 0,
    city_tier: 'tier3',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 5.0, climate: 8.5, slow_pace: 8.0, medical_access: 7.5,
      nature: 10.0, population_density: 9.0, price_index: 5.5, digital_facilities: 7.5
    },
    tags: ['seaside', 'elderly_friendly']
  },
  {
    name: '台州',
    province: '浙江',
    country: '中国',
    slogan: '江南海滨小城',
    population: 6600000,
    avg_rent: 1000,
    avg_temp: 17.0,
    distance_to_sea: 0,
    city_tier: 'tier3',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 8.0, climate: 8.8, slow_pace: 8.0, medical_access: 8.0,
      nature: 9.0, population_density: 7.5, price_index: 7.5, digital_facilities: 7.5
    },
    tags: ['seaside', 'spring_climate', 'medical_complete']
  },
  {
    name: '保山',
    province: '云南',
    country: '中国',
    slogan: '滇西边城',
    population: 2600000,
    avg_rent: 550,
    avg_temp: 15.5,
    altitude: 1650,
    city_tier: 'tier3',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 9.6, climate: 9.0, slow_pace: 9.2, medical_access: 6.5,
      nature: 8.8, population_density: 9.0, price_index: 9.0, digital_facilities: 5.8
    },
    tags: ['mountain', 'spring_climate', 'low_rent', 'quiet']
  },
  {
    name: '漳州',
    province: '福建',
    country: '中国',
    slogan: '闽南宜居小城',
    population: 5200000,
    avg_rent: 900,
    avg_temp: 21.0,
    distance_to_sea: 5,
    city_tier: 'tier3',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 8.5, climate: 9.2, slow_pace: 8.5, medical_access: 7.5,
      nature: 8.8, population_density: 8.0, price_index: 8.2, digital_facilities: 7.2
    },
    tags: ['seaside', 'spring_climate', 'low_rent']
  },
  {
    name: '德宏',
    province: '云南',
    country: '中国',
    slogan: '孔雀之乡',
    population: 1310000,
    avg_rent: 550,
    avg_temp: 19.0,
    altitude: 900,
    city_tier: 'small',
    list_type: 'china_layflat',
    dimensions: {
      rent_cost: 9.6, climate: 9.2, slow_pace: 9.8, medical_access: 5.5,
      nature: 9.5, population_density: 9.5, price_index: 9.2, digital_facilities: 5.0
    },
    tags: ['mountain', 'spring_climate', 'low_rent', 'quiet']
  }
];

async function seedData() {
  const db = new sqlite3.Database(dbPath);

  const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  };

  const get = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  };

  try {
    console.log('开始添加躺平小城示例数据...');

    for (const city of layflatCities) {
      // 检查城市是否已存在
      const existing = await get('SELECT id FROM cities WHERE name = ?', [city.name]);

      if (existing) {
        console.log(`城市 ${city.name} 已存在，跳过...`);
        continue;
      }

      // 计算躺平评分
      const dims = city.dimensions;
      const layflatScore = (
        dims.rent_cost * 0.20 +
        dims.climate * 0.15 +
        dims.slow_pace * 0.15 +
        dims.medical_access * 0.15 +
        dims.nature * 0.10 +
        dims.population_density * 0.10 +
        dims.price_index * 0.10 +
        dims.digital_facilities * 0.05
      );

      // 插入城市
      const result = await run(
        `INSERT INTO cities (
          name, province, country, slogan, population, avg_rent, avg_temp,
          distance_to_sea, has_lake, altitude, city_tier, list_type,
          layflat_score, overall_score, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          city.name, city.province, city.country, city.slogan, city.population,
          city.avg_rent, city.avg_temp, city.distance_to_sea || null,
          city.has_lake || 0, city.altitude || null, city.city_tier,
          city.list_type, layflatScore.toFixed(2), layflatScore.toFixed(2), 'approved'
        ]
      );

      const cityId = result.id;

      // 插入维度数据
      await run(
        `INSERT INTO city_dimensions (
          city_id, rent_cost, climate, slow_pace, medical_access,
          nature, population_density, price_index, digital_facilities
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cityId, dims.rent_cost, dims.climate, dims.slow_pace, dims.medical_access,
          dims.nature, dims.population_density, dims.price_index, dims.digital_facilities
        ]
      );

      // 插入标签
      for (const tagKey of city.tags) {
        const tagNames = {
          seaside: '🏖️ 看海小城',
          mountain: '🏔️ 山居小城',
          low_rent: '💰 超低房租',
          spring_climate: '🌡️ 四季如春',
          medical_complete: '🏥 医疗完善',
          quiet: '🤫 极度安静',
          elderly_friendly: '👴 养老天堂',
          digital_nomad: '💻 数字游民友好',
          lake: '🌊 临湖'
        };

        await run(
          `INSERT INTO city_tags (city_id, tag_key, tag_name, tag_icon, is_primary)
           VALUES (?, ?, ?, ?, ?)`,
          [cityId, tagKey, tagNames[tagKey], tagNames[tagKey].split(' ')[0], 1]
        );
      }

      console.log(`✓ 添加城市: ${city.name} (评分: ${layflatScore.toFixed(2)})`);
    }

    console.log('\n示例数据添加完成！');
    console.log(`共添加 ${layflatCities.length} 个躺平小城`);

  } catch (error) {
    console.error('添加数据失败:', error);
    throw error;
  } finally {
    db.close();
  }
}

// 运行数据添加
seedData().catch(console.error);
