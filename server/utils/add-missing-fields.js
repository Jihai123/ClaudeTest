#!/usr/bin/env node
/**
 * 添加缺失的字段到cities表
 */

const db = require('../models/database');

async function addMissingFields() {
  console.log('🚀 开始添加缺失的字段...\n');

  try {
    await db.init();
    console.log('✓ 数据库连接成功\n');

    // 添加 house_price 字段
    try {
      await db.run(`ALTER TABLE cities ADD COLUMN house_price DECIMAL(12, 2)`);
      console.log('✓ 添加 house_price 字段成功');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('⊘ house_price 字段已存在');
      } else {
        console.error('✗ 添加 house_price 字段失败:', error.message);
      }
    }

    // 添加 climate_desc 字段
    try {
      await db.run(`ALTER TABLE cities ADD COLUMN climate_desc TEXT`);
      console.log('✓ 添加 climate_desc 字段成功');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('⊘ climate_desc 字段已存在');
      } else {
        console.error('✗ 添加 climate_desc 字段失败:', error.message);
      }
    }

    console.log('\n========================================');
    console.log('✅ 字段添加完成！');
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ 添加字段过程出错:', error);
  } finally {
    await db.close();
    process.exit(0);
  }
}

// 运行
addMissingFields();
