/**
 * 数据库迁移脚本
 * 用于更新现有数据库以支持MVP新功能
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../database.sqlite');

async function migrate() {
  const db = new sqlite3.Database(dbPath);

  const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  };

  try {
    console.log('开始数据库迁移...');

    // 为cities表添加新列
    const cityColumns = [
      'ALTER TABLE cities ADD COLUMN name_en VARCHAR(100)',
      'ALTER TABLE cities ADD COLUMN country VARCHAR(50) DEFAULT "中国"',
      'ALTER TABLE cities ADD COLUMN latitude DECIMAL(10, 6)',
      'ALTER TABLE cities ADD COLUMN longitude DECIMAL(10, 6)',
      'ALTER TABLE cities ADD COLUMN altitude INTEGER',
      'ALTER TABLE cities ADD COLUMN distance_to_sea DECIMAL(10, 2)',
      'ALTER TABLE cities ADD COLUMN has_lake BOOLEAN DEFAULT 0',
      'ALTER TABLE cities ADD COLUMN world_score DECIMAL(5, 2) DEFAULT 0',
      'ALTER TABLE cities ADD COLUMN layflat_score DECIMAL(5, 2) DEFAULT 0',
      'ALTER TABLE cities ADD COLUMN list_type VARCHAR(50) DEFAULT "china_general"',
      'ALTER TABLE cities ADD COLUMN city_tier VARCHAR(10)',
      'ALTER TABLE cities ADD COLUMN avg_rent DECIMAL(10, 2)',
      'ALTER TABLE cities ADD COLUMN avg_temp DECIMAL(5, 2)',
      'ALTER TABLE cities ADD COLUMN slow_pace_score DECIMAL(5, 2)',
      'ALTER TABLE cities ADD COLUMN digital_nomad_score DECIMAL(5, 2)',
      'ALTER TABLE cities ADD COLUMN slogan VARCHAR(200)',
      'ALTER TABLE cities ADD COLUMN views_count INTEGER DEFAULT 0',
      'ALTER TABLE cities ADD COLUMN favorites_count INTEGER DEFAULT 0'
    ];

    for (const sql of cityColumns) {
      try {
        await run(sql);
      } catch (err) {
        // 列可能已存在，忽略错误
        if (!err.message.includes('duplicate column name')) {
          console.warn(`警告: ${err.message}`);
        }
      }
    }

    // 为city_dimensions表添加新列
    const dimensionColumns = [
      'ALTER TABLE city_dimensions ADD COLUMN rent_cost DECIMAL(5, 2) DEFAULT 0',
      'ALTER TABLE city_dimensions ADD COLUMN climate DECIMAL(5, 2) DEFAULT 0',
      'ALTER TABLE city_dimensions ADD COLUMN slow_pace DECIMAL(5, 2) DEFAULT 0',
      'ALTER TABLE city_dimensions ADD COLUMN medical_access DECIMAL(5, 2) DEFAULT 0',
      'ALTER TABLE city_dimensions ADD COLUMN nature DECIMAL(5, 2) DEFAULT 0',
      'ALTER TABLE city_dimensions ADD COLUMN population_density DECIMAL(5, 2) DEFAULT 0',
      'ALTER TABLE city_dimensions ADD COLUMN price_index DECIMAL(5, 2) DEFAULT 0',
      'ALTER TABLE city_dimensions ADD COLUMN digital_facilities DECIMAL(5, 2) DEFAULT 0',
      'ALTER TABLE city_dimensions ADD COLUMN visa_friendly DECIMAL(5, 2) DEFAULT 0',
      'ALTER TABLE city_dimensions ADD COLUMN language DECIMAL(5, 2) DEFAULT 0',
      'ALTER TABLE city_dimensions ADD COLUMN culture DECIMAL(5, 2) DEFAULT 0'
    ];

    for (const sql of dimensionColumns) {
      try {
        await run(sql);
      } catch (err) {
        if (!err.message.includes('duplicate column name')) {
          console.warn(`警告: ${err.message}`);
        }
      }
    }

    // 为users表添加新列
    const userColumns = [
      'ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500)',
      'ALTER TABLE users ADD COLUMN bio TEXT',
      'ALTER TABLE users ADD COLUMN current_city_id INTEGER',
      'ALTER TABLE users ADD COLUMN reviews_count INTEGER DEFAULT 0',
      'ALTER TABLE users ADD COLUMN images_count INTEGER DEFAULT 0'
    ];

    for (const sql of userColumns) {
      try {
        await run(sql);
      } catch (err) {
        if (!err.message.includes('duplicate column name')) {
          console.warn(`警告: ${err.message}`);
        }
      }
    }

    // 为reviews表添加新列
    const reviewColumns = [
      'ALTER TABLE reviews ADD COLUMN living_duration VARCHAR(50)',
      'ALTER TABLE reviews ADD COLUMN living_purpose VARCHAR(50)',
      'ALTER TABLE reviews ADD COLUMN dislikes INTEGER DEFAULT 0'
    ];

    for (const sql of reviewColumns) {
      try {
        await run(sql);
      } catch (err) {
        if (!err.message.includes('duplicate column name')) {
          console.warn(`警告: ${err.message}`);
        }
      }
    }

    console.log('数据库迁移完成！');
    console.log('请重启服务器以应用新的表结构。');

  } catch (error) {
    console.error('迁移失败:', error);
    throw error;
  } finally {
    db.close();
  }
}

// 运行迁移
migrate().catch(console.error);
