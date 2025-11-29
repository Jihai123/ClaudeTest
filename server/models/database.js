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
      // 用户表 - 扩展版
      await this.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(100) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          role VARCHAR(20) DEFAULT 'user',
          avatar_url VARCHAR(500),
          bio TEXT,
          current_city_id INTEGER,
          reviews_count INTEGER DEFAULT 0,
          images_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (current_city_id) REFERENCES cities(id)
        )
      `);

      // 城市表 - 扩展版
      await this.run(`
        CREATE TABLE IF NOT EXISTS cities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name VARCHAR(100) NOT NULL,
          name_en VARCHAR(100),
          province VARCHAR(50),
          country VARCHAR(50) DEFAULT '中国',
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

          -- 地理信息
          latitude DECIMAL(10, 6),
          longitude DECIMAL(10, 6),
          altitude INTEGER,
          distance_to_sea DECIMAL(10, 2),
          has_lake BOOLEAN DEFAULT 0,

          -- 三个榜单独立评分
          overall_score DECIMAL(5, 2) DEFAULT 0,
          world_score DECIMAL(5, 2) DEFAULT 0,
          layflat_score DECIMAL(5, 2) DEFAULT 0,

          -- 榜单归属
          list_type VARCHAR(50) DEFAULT 'china_general',

          -- 城市类型
          city_tier VARCHAR(10),

          -- 躺平城市独有字段
          avg_rent DECIMAL(10, 2),
          avg_temp DECIMAL(5, 2),
          slow_pace_score DECIMAL(5, 2),
          digital_nomad_score DECIMAL(5, 2),

          -- 一句话总结
          slogan VARCHAR(200),

          status VARCHAR(20) DEFAULT 'pending',
          user_id INTEGER,
          views_count INTEGER DEFAULT 0,
          favorites_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);

      // 城市维度数据表 - 扩展版
      await this.run(`
        CREATE TABLE IF NOT EXISTS city_dimensions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          city_id INTEGER NOT NULL,

          -- 原有维度
          living_cost DECIMAL(5, 2) DEFAULT 0,
          air_quality DECIMAL(5, 2) DEFAULT 0,
          medical_facilities DECIMAL(5, 2) DEFAULT 0,
          employment DECIMAL(5, 2) DEFAULT 0,
          safety DECIMAL(5, 2) DEFAULT 0,
          elderly_care DECIMAL(5, 2) DEFAULT 0,

          -- 躺平榜新增维度
          rent_cost DECIMAL(5, 2) DEFAULT 0,
          climate DECIMAL(5, 2) DEFAULT 0,
          slow_pace DECIMAL(5, 2) DEFAULT 0,
          medical_access DECIMAL(5, 2) DEFAULT 0,
          nature DECIMAL(5, 2) DEFAULT 0,
          population_density DECIMAL(5, 2) DEFAULT 0,
          price_index DECIMAL(5, 2) DEFAULT 0,
          digital_facilities DECIMAL(5, 2) DEFAULT 0,

          -- 世界榜新增维度
          visa_friendly DECIMAL(5, 2) DEFAULT 0,
          language DECIMAL(5, 2) DEFAULT 0,
          culture DECIMAL(5, 2) DEFAULT 0,

          -- 其他字段
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

      // 用户评价表 - 扩展版
      await this.run(`
        CREATE TABLE IF NOT EXISTS reviews (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          city_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          rating DECIMAL(3, 1) NOT NULL,
          comment TEXT,

          -- 居住经历
          living_duration VARCHAR(50),
          living_purpose VARCHAR(50),

          likes INTEGER DEFAULT 0,
          dislikes INTEGER DEFAULT 0,
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

      // 榜单表
      await this.run(`
        CREATE TABLE IF NOT EXISTS ranking_lists (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          list_key VARCHAR(50) UNIQUE NOT NULL,
          list_name VARCHAR(100) NOT NULL,
          list_description TEXT,
          dimensions_config TEXT,
          is_active BOOLEAN DEFAULT 1,
          sort_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 城市图片表
      await this.run(`
        CREATE TABLE IF NOT EXISTS city_images (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          city_id INTEGER NOT NULL,
          image_url VARCHAR(500) NOT NULL,
          thumbnail_url VARCHAR(500),
          alt_text VARCHAR(200),
          image_type VARCHAR(20) NOT NULL,
          tags TEXT,
          uploader_id INTEGER,
          upload_source VARCHAR(50) DEFAULT 'user',
          weight INTEGER DEFAULT 0,
          is_featured BOOLEAN DEFAULT 0,
          is_cover BOOLEAN DEFAULT 0,
          status VARCHAR(20) DEFAULT 'pending',
          reviewer_id INTEGER,
          reviewed_at DATETIME,
          rejection_reason TEXT,
          likes_count INTEGER DEFAULT 0,
          views_count INTEGER DEFAULT 0,
          exif_data TEXT,
          season VARCHAR(20),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
          FOREIGN KEY (uploader_id) REFERENCES users(id),
          FOREIGN KEY (reviewer_id) REFERENCES users(id)
        )
      `);

      // 城市标签表
      await this.run(`
        CREATE TABLE IF NOT EXISTS city_tags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          city_id INTEGER NOT NULL,
          tag_key VARCHAR(50) NOT NULL,
          tag_name VARCHAR(50) NOT NULL,
          tag_icon VARCHAR(20),
          is_primary BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE
        )
      `);

      // 收藏表
      await this.run(`
        CREATE TABLE IF NOT EXISTS favorites (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          city_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, city_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE
        )
      `);

      // 创建索引
      await this.run('CREATE INDEX IF NOT EXISTS idx_cities_list_type ON cities(list_type)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_cities_layflat_score ON cities(layflat_score DESC)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_cities_country ON cities(country)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_city_dimensions_city_id ON city_dimensions(city_id)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_city_images_city_id ON city_images(city_id)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_city_images_status ON city_images(status)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_city_images_weight ON city_images(weight DESC)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_city_tags_city_id ON city_tags(city_id)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_city_tags_tag_key ON city_tags(tag_key)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_favorites_city_id ON favorites(city_id)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_reviews_city_id ON reviews(city_id)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id)');

      // 插入榜单预置数据
      await this.run(`
        INSERT OR IGNORE INTO ranking_lists (list_key, list_name, list_description, dimensions_config)
        VALUES
          ('world', '世界宜居城市排行榜', '全球视野,适合数字游民/海外养老',
           '{"living_cost":0.20,"safety":0.15,"medical_facilities":0.15,"climate":0.10,"visa_friendly":0.10,"language":0.10,"culture":0.10,"nature":0.10}'),
          ('china_general', '中国综合宜居城市排行榜', '主流城市,适合工作+生活平衡',
           '{"living_cost":0.15,"air_quality":0.15,"medical_facilities":0.15,"employment":0.15,"safety":0.15,"elderly_care":0.10,"education":0.10,"transportation":0.05}'),
          ('china_layflat', '中国躺平/旅居/养老小城排行榜', '慢节奏小城,适合逃离内卷/养老/远程工作',
           '{"rent_cost":0.20,"climate":0.15,"slow_pace":0.15,"medical_access":0.15,"nature":0.10,"population_density":0.10,"price_index":0.10,"digital_facilities":0.05}')
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
