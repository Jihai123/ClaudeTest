const db = require('../models/database');

/**
 * 迁移脚本：为 city_tags 表添加 tag_value 字段
 * 支持更灵活的标签存储结构
 */

async function migrateCityTags() {
  console.log('开始迁移 city_tags 表结构...\n');

  try {
    // 检查字段是否已存在
    const columns = await db.query(`PRAGMA table_info(city_tags)`);
    const hasTagValue = columns.some(col => col.name === 'tag_value');
    const hasTagNameCn = columns.some(col => col.name === 'tag_name_cn');

    if (hasTagValue && hasTagNameCn) {
      console.log('✓ city_tags 表结构已是最新版本');
      return;
    }

    // 添加 tag_value 字段（存储标签值，如 '一线', 'true'）
    if (!hasTagValue) {
      await db.run(`ALTER TABLE city_tags ADD COLUMN tag_value VARCHAR(100)`);
      console.log('✓ 已添加 tag_value 字段');
    }

    // 添加 tag_name_cn 字段（存储中文显示名称，如 '一线城市'）
    if (!hasTagNameCn) {
      await db.run(`ALTER TABLE city_tags ADD COLUMN tag_name_cn VARCHAR(100)`);
      console.log('✓ 已添加 tag_name_cn 字段');
    }

    // 为新增字段创建索引
    await db.run('CREATE INDEX IF NOT EXISTS idx_city_tags_tag_value ON city_tags(tag_value)');
    console.log('✓ 已创建索引');

    console.log('\n✅ city_tags 表结构迁移完成！\n');

  } catch (error) {
    console.error('迁移失败:', error);
    throw error;
  }
}

// 执行迁移
migrateCityTags()
  .then(() => {
    console.log('可以继续运行 importCityTags.js');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ 迁移失败:', error);
    process.exit(1);
  });

module.exports = { migrateCityTags };
