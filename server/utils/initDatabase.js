require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../models/database');

// 初始城市数据
const initialCities = [
  {
    name: '成都',
    province: '四川省',
    population: 21000000,
    gdp: 20817.5,
    area: 14335,
    dimensions: {
      living_cost: 7.5,
      air_quality: 6.8,
      medical_facilities: 8.5,
      employment: 8.2,
      safety: 8.8,
      elderly_care: 8.0
    }
  },
  {
    name: '杭州',
    province: '浙江省',
    population: 12200000,
    gdp: 18753,
    area: 16850,
    dimensions: {
      living_cost: 6.5,
      air_quality: 7.5,
      medical_facilities: 8.8,
      employment: 9.0,
      safety: 9.2,
      elderly_care: 8.5
    }
  },
  {
    name: '青岛',
    province: '山东省',
    population: 10000000,
    gdp: 14920,
    area: 11282,
    dimensions: {
      living_cost: 7.8,
      air_quality: 8.2,
      medical_facilities: 8.0,
      employment: 7.5,
      safety: 8.5,
      elderly_care: 7.8
    }
  },
  {
    name: '厦门',
    province: '福建省',
    population: 5280000,
    gdp: 7033,
    area: 1700,
    dimensions: {
      living_cost: 6.8,
      air_quality: 8.8,
      medical_facilities: 7.8,
      employment: 7.2,
      safety: 9.0,
      elderly_care: 8.2
    }
  },
  {
    name: '大连',
    province: '辽宁省',
    population: 7450000,
    gdp: 8430,
    area: 12574,
    dimensions: {
      living_cost: 7.5,
      air_quality: 7.8,
      medical_facilities: 7.5,
      employment: 6.8,
      safety: 8.2,
      elderly_care: 7.5
    }
  },
  {
    name: '昆明',
    province: '云南省',
    population: 8500000,
    gdp: 7222,
    area: 21012,
    dimensions: {
      living_cost: 8.2,
      air_quality: 8.5,
      medical_facilities: 7.2,
      employment: 6.5,
      safety: 7.8,
      elderly_care: 8.5
    }
  },
  {
    name: '苏州',
    province: '江苏省',
    population: 12900000,
    gdp: 23958,
    area: 8657,
    dimensions: {
      living_cost: 6.8,
      air_quality: 7.2,
      medical_facilities: 8.5,
      employment: 8.8,
      safety: 8.8,
      elderly_care: 8.0
    }
  },
  {
    name: '珠海',
    province: '广东省',
    population: 2440000,
    gdp: 3881,
    area: 1736,
    dimensions: {
      living_cost: 7.0,
      air_quality: 8.5,
      medical_facilities: 7.8,
      employment: 7.5,
      safety: 8.5,
      elderly_care: 7.8
    }
  },
  {
    name: '威海',
    province: '山东省',
    population: 2900000,
    gdp: 3463,
    area: 5797,
    dimensions: {
      living_cost: 8.5,
      air_quality: 9.0,
      medical_facilities: 7.0,
      employment: 6.5,
      safety: 8.8,
      elderly_care: 8.5
    }
  },
  {
    name: '南京',
    province: '江苏省',
    population: 9300000,
    gdp: 16907,
    area: 6587,
    dimensions: {
      living_cost: 7.0,
      air_quality: 7.0,
      medical_facilities: 9.0,
      employment: 8.5,
      safety: 8.5,
      elderly_care: 8.2
    }
  }
];

async function initDatabase() {
  try {
    console.log('开始初始化数据库...');

    // 初始化表结构
    await db.init();

    // 创建管理员账户
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';

    const existingAdmin = await db.get('SELECT * FROM users WHERE username = ?', [adminUsername]);

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await db.run(
        'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
        [adminUsername, adminEmail, hashedPassword, 'admin']
      );
      console.log(`管理员账户创建成功: ${adminUsername}`);
    } else {
      console.log('管理员账户已存在');
    }

    // 插入初始城市数据
    for (const cityData of initialCities) {
      // 检查城市是否已存在
      const existingCity = await db.get('SELECT * FROM cities WHERE name = ?', [cityData.name]);

      if (!existingCity) {
        // 计算综合评分
        const dimensions = cityData.dimensions;
        const overallScore = (
          dimensions.living_cost +
          dimensions.air_quality +
          dimensions.medical_facilities +
          dimensions.employment +
          dimensions.safety +
          dimensions.elderly_care
        ) / 6;

        // 插入城市基本信息
        const result = await db.run(
          `INSERT INTO cities (name, province, population, gdp, area, overall_score, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [cityData.name, cityData.province, cityData.population, cityData.gdp, cityData.area,
           overallScore.toFixed(2), 'approved']
        );

        // 插入城市维度数据
        await db.run(
          `INSERT INTO city_dimensions (city_id, living_cost, air_quality, medical_facilities,
           employment, safety, elderly_care) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [result.id, dimensions.living_cost, dimensions.air_quality, dimensions.medical_facilities,
           dimensions.employment, dimensions.safety, dimensions.elderly_care]
        );

        console.log(`城市 ${cityData.name} 添加成功`);
      }
    }

    console.log('数据库初始化完成!');
    console.log(`\n请使用以下账户登录管理后台:`);
    console.log(`用户名: ${adminUsername}`);
    console.log(`密码: ${adminPassword}`);

    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('数据库初始化失败:', error);
    process.exit(1);
  }
}

initDatabase();
