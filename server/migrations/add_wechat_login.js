/**
 * 添加微信登录支持
 * 运行: node server/migrations/add_wechat_login.js
 */

const db = require('../models/database');

async function migrate() {
  console.log('=== 添加微信登录支持 ===\n');

  try {
    await db.init();
    await new Promise(r => setTimeout(r, 500));

    // 检查是否已有 wechat_openid 字段
    const columns = await db.query('PRAGMA table_info(users)');
    const hasOpenid = columns.some(col => col.name === 'wechat_openid');

    if (!hasOpenid) {
      console.log('添加 wechat_openid 字段...');
      await db.run('ALTER TABLE users ADD COLUMN wechat_openid VARCHAR(100)');
      console.log('✓ wechat_openid 字段已添加');
    } else {
      console.log('✓ wechat_openid 字段已存在');
    }

    // 检查是否已有 avatar 字段
    const hasAvatar = columns.some(col => col.name === 'avatar');
    if (!hasAvatar) {
      console.log('添加 avatar 字段...');
      await db.run('ALTER TABLE users ADD COLUMN avatar VARCHAR(500)');
      console.log('✓ avatar 字段已添加');
    }

    // 创建索引
    try {
      await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wechat_openid ON users(wechat_openid)');
      console.log('✓ wechat_openid 索引已创建');
    } catch (e) {
      // 索引可能已存在
    }

    console.log('\n=== 迁移完成 ===');

  } catch (error) {
    console.error('迁移失败:', error);
  } finally {
    await db.close();
  }
}

migrate();
