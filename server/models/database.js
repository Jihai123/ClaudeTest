const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../database.sqlite');

class Database {
  constructor() {
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('数据库连接失败:', err.message);
      } else {
        console.log('数据库连接成功');
      }
    });
  }

  // 执行查询
  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 执行单条查询
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // 执行插入/更新/删除
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  // 初始化数据库表
  async init() {
    try {
      // 用户表
      await this.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(100) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          role VARCHAR(20) DEFAULT 'user',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 城市表
      await this.run(`
        CREATE TABLE IF NOT EXISTS cities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name VARCHAR(100) NOT NULL,
          province VARCHAR(50),
          city_name VARCHAR(100),
          district VARCHAR(100),
          standard_location VARCHAR(200),
          city_level VARCHAR(50),
          grade_level VARCHAR(50),
          location_intro TEXT,
          population INTEGER,
          gdp DECIMAL(15, 2),
          area DECIMAL(10, 2),
          link VARCHAR(500),
          key_points TEXT,
          climate VARCHAR(100),
          evaluation TEXT,
          notes TEXT,
          overall_score DECIMAL(5, 2) DEFAULT 0,
          status VARCHAR(20) DEFAULT 'pending',
          user_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);

      // 城市维度数据表
      await this.run(`
        CREATE TABLE IF NOT EXISTS city_dimensions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          city_id INTEGER NOT NULL,
          living_cost DECIMAL(5, 2) DEFAULT 0,
          air_quality DECIMAL(5, 2) DEFAULT 0,
          medical_facilities DECIMAL(5, 2) DEFAULT 0,
          employment DECIMAL(5, 2) DEFAULT 0,
          safety DECIMAL(5, 2) DEFAULT 0,
          elderly_care DECIMAL(5, 2) DEFAULT 0,
          medical VARCHAR(100),
          transportation VARCHAR(100),
          internet VARCHAR(100),
          education VARCHAR(100),
          actual_level VARCHAR(100),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE
        )
      `);

      // 用户评价表
      await this.run(`
        CREATE TABLE IF NOT EXISTS reviews (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          city_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          rating DECIMAL(3, 1) NOT NULL,
          comment TEXT,
          likes INTEGER DEFAULT 0,
          status VARCHAR(20) DEFAULT 'approved',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);

      // 评论回复表
      await this.run(`
        CREATE TABLE IF NOT EXISTS review_replies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          review_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          content TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);

      // 点赞表
      await this.run(`
        CREATE TABLE IF NOT EXISTS review_likes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          review_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(review_id, user_id),
          FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);

      // 城市对比历史表
      await this.run(`
        CREATE TABLE IF NOT EXISTS comparison_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          city_ids TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);

      // 爬虫数据记录表
      await this.run(`
        CREATE TABLE IF NOT EXISTS crawl_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_url VARCHAR(255),
          status VARCHAR(20),
          cities_updated INTEGER DEFAULT 0,
          error_message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('数据库表初始化成功');
    } catch (error) {
      console.error('数据库初始化失败:', error);
      throw error;
    }
  }

  // 关闭数据库连接
  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

module.exports = new Database();
