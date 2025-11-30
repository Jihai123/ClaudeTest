/**
 * 添加缺失字段默认值的工具脚本
 * 用于为现有数据库记录填充默认值
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../database.sqlite');

async function addMissingFields() {
  const db = new sqlite3.Database(dbPath);

  const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  };

  const query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  };

  try {
    console.log('开始填充缺失字段...');

    // 1. 更新cities表的默认值
    console.log('\n1. 更新cities表默认值...');

    // 设置默认list_type
    const result1 = await run(`
      UPDATE cities
      SET list_type = 'china_general'
      WHERE list_type IS NULL OR list_type = ''
    `);
    console.log(`  - 设置默认list_type: ${result1.changes}条记录`);

    // 设置默认country
    const result2 = await run(`
      UPDATE cities
      SET country = '中国'
      WHERE country IS NULL OR country = ''
    `);
    console.log(`  - 设置默认country: ${result2.changes}条记录`);

    // 设置默认status
    const result3 = await run(`
      UPDATE cities
      SET status = 'approved'
      WHERE status IS NULL OR status = ''
    `);
    console.log(`  - 设置默认status: ${result3.changes}条记录`);

    // 设置数值字段默认值为0
    const numericFields = [
      'overall_score', 'world_score', 'layflat_score',
      'views_count', 'favorites_count',
      'population', 'gdp', 'area',
      'latitude', 'longitude', 'altitude', 'distance_to_sea',
      'avg_rent', 'avg_temp', 'slow_pace_score', 'digital_nomad_score'
    ];

    for (const field of numericFields) {
      try {
        const result = await run(`
          UPDATE cities
          SET ${field} = 0
          WHERE ${field} IS NULL
        `);
        if (result.changes > 0) {
          console.log(`  - 设置${field}默认值: ${result.changes}条记录`);
        }
      } catch (err) {
        // 字段可能不存在，忽略
      }
    }

    // 设置布尔字段默认值
    const result4 = await run(`
      UPDATE cities
      SET has_lake = 0
      WHERE has_lake IS NULL
    `);
    if (result4.changes > 0) {
      console.log(`  - 设置has_lake默认值: ${result4.changes}条记录`);
    }

    // 2. 为没有city_dimensions记录的城市创建记录
    console.log('\n2. 创建缺失的city_dimensions记录...');

    const citiesWithoutDimensions = await query(`
      SELECT c.id
      FROM cities c
      LEFT JOIN city_dimensions cd ON c.id = cd.city_id
      WHERE cd.id IS NULL
    `);

    if (citiesWithoutDimensions.length > 0) {
      for (const city of citiesWithoutDimensions) {
        await run(`
          INSERT INTO city_dimensions (
            city_id,
            living_cost, air_quality, medical_facilities, employment, safety, elderly_care,
            rent_cost, climate, slow_pace, medical_access, nature, population_density, price_index, digital_facilities,
            visa_friendly, language, culture
          ) VALUES (?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
        `, [city.id]);
      }
      console.log(`  - 创建了${citiesWithoutDimensions.length}条city_dimensions记录`);
    } else {
      console.log('  - 所有城市都已有dimensions记录');
    }

    // 3. 更新city_dimensions表的默认值
    console.log('\n3. 更新city_dimensions表默认值...');

    const dimensionFields = [
      'living_cost', 'air_quality', 'medical_facilities', 'employment', 'safety', 'elderly_care',
      'rent_cost', 'climate', 'slow_pace', 'medical_access', 'nature',
      'population_density', 'price_index', 'digital_facilities',
      'visa_friendly', 'language', 'culture'
    ];

    for (const field of dimensionFields) {
      try {
        const result = await run(`
          UPDATE city_dimensions
          SET ${field} = 0
          WHERE ${field} IS NULL
        `);
        if (result.changes > 0) {
          console.log(`  - 设置${field}默认值: ${result.changes}条记录`);
        }
      } catch (err) {
        // 字段可能不存在，忽略
      }
    }

    // 4. 更新users表的默认值
    console.log('\n4. 更新users表默认值...');

    const result5 = await run(`
      UPDATE users
      SET role = 'user'
      WHERE role IS NULL OR role = ''
    `);
    if (result5.changes > 0) {
      console.log(`  - 设置默认role: ${result5.changes}条记录`);
    }

    const userNumericFields = ['reviews_count', 'images_count'];
    for (const field of userNumericFields) {
      try {
        const result = await run(`
          UPDATE users
          SET ${field} = 0
          WHERE ${field} IS NULL
        `);
        if (result.changes > 0) {
          console.log(`  - 设置${field}默认值: ${result.changes}条记录`);
        }
      } catch (err) {
        // 字段可能不存在，忽略
      }
    }

    // 5. 更新reviews表的默认值
    console.log('\n5. 更新reviews表默认值...');

    const result6 = await run(`
      UPDATE reviews
      SET status = 'approved'
      WHERE status IS NULL OR status = ''
    `);
    if (result6.changes > 0) {
      console.log(`  - 设置默认status: ${result6.changes}条记录`);
    }

    const reviewNumericFields = ['likes', 'dislikes'];
    for (const field of reviewNumericFields) {
      try {
        const result = await run(`
          UPDATE reviews
          SET ${field} = 0
          WHERE ${field} IS NULL
        `);
        if (result.changes > 0) {
          console.log(`  - 设置${field}默认值: ${result.changes}条记录`);
        }
      } catch (err) {
        // 字段可能不存在
      }
    }

    console.log('\n✅ 所有缺失字段已填充完成！');

  } catch (error) {
    console.error('❌ 填充失败:', error);
    throw error;
  } finally {
    db.close();
  }
}

// 运行脚本
addMissingFields().catch(console.error);
