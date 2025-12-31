/**
 * 数据库迁移脚本：扩展评价系统功能
 * 添加：六维评分、图片、有用计数、居住年限等
 */

const db = require('../models/database');

async function migrate() {
  try {
    console.log('开始迁移：扩展reviews表...');

    // 1. 为reviews表添加新字段
    const newFields = [
      { name: 'images', type: 'TEXT', comment: 'JSON格式存储图片URLs' },
      { name: 'living_cost_rating', type: 'DECIMAL(2,1)', comment: '生活成本评分' },
      { name: 'air_quality_rating', type: 'DECIMAL(2,1)', comment: '空气质量评分' },
      { name: 'medical_rating', type: 'DECIMAL(2,1)', comment: '医疗设施评分' },
      { name: 'employment_rating', type: 'DECIMAL(2,1)', comment: '就业机会评分' },
      { name: 'safety_rating', type: 'DECIMAL(2,1)', comment: '安全指数评分' },
      { name: 'elderly_care_rating', type: 'DECIMAL(2,1)', comment: '养老设施评分' },
      { name: 'helpful_count', type: 'INTEGER DEFAULT 0', comment: '有用标记数' },
      { name: 'residence_years', type: 'INTEGER', comment: '居住年限' },
      { name: 'is_anonymous', type: 'BOOLEAN DEFAULT 0', comment: '是否匿名' }
    ];

    for (const field of newFields) {
      try {
        await db.run(`ALTER TABLE reviews ADD COLUMN ${field.name} ${field.type}`);
        console.log(`✓ 添加字段: ${field.name} - ${field.comment}`);
      } catch (err) {
        if (err.message.includes('duplicate column name')) {
          console.log(`- 字段已存在: ${field.name}`);
        } else {
          throw err;
        }
      }
    }

    // 2. 创建review_helpful表（标记"有用"）
    console.log('\n创建review_helpful表...');
    await db.run(`
      CREATE TABLE IF NOT EXISTS review_helpful (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        is_helpful BOOLEAN NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(review_id, user_id),
        FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    console.log('✓ review_helpful表创建成功');

    // 3. 创建review_images表（评价图片）
    console.log('\n创建review_images表...');
    await db.run(`
      CREATE TABLE IF NOT EXISTS review_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_id INTEGER NOT NULL,
        image_url VARCHAR(500) NOT NULL,
        thumbnail_url VARCHAR(500),
        upload_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ review_images表创建成功');

    // 4. 创建索引
    console.log('\n创建索引...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_review_helpful_review_id ON review_helpful(review_id)',
      'CREATE INDEX IF NOT EXISTS idx_review_helpful_user_id ON review_helpful(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_review_images_review_id ON review_images(review_id)',
      'CREATE INDEX IF NOT EXISTS idx_reviews_helpful_count ON reviews(helpful_count DESC)'
    ];

    for (const indexSql of indexes) {
      await db.run(indexSql);
      console.log(`✓ 索引创建成功`);
    }

    console.log('\n✅ 数据库迁移完成！');
    console.log('\n新增功能:');
    console.log('  - 六维度细分评分（生活成本、空气、医疗、就业、安全、养老）');
    console.log('  - 图片上传支持');
    console.log('  - "有用"标记功能');
    console.log('  - 居住年限记录');
    console.log('  - 匿名评价选项');

  } catch (error) {
    console.error('❌ 迁移失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('\n迁移成功完成');
      process.exit(0);
    })
    .catch((err) => {
      console.error('迁移失败:', err);
      process.exit(1);
    });
}

module.exports = migrate;
