const db = require('./server/models/database');

/**
 * 清除世界宜居城市排行榜数据的脚本
 * 用于清理乱码或错误数据，准备重新导入
 */
async function clearWorldCities() {
  try {
    console.log('\n========================================');
    console.log('清除世界宜居城市排行榜数据');
    console.log('========================================\n');

    // 先查询要删除的数据数量
    const count = await db.get(
      "SELECT COUNT(*) as count FROM cities WHERE list_type='world'"
    );

    if (count.count === 0) {
      console.log('✓ 数据库中没有世界城市数据，无需清除');
      process.exit(0);
    }

    console.log(`发现 ${count.count} 条世界城市数据`);
    console.log('正在删除...\n');

    // 删除世界城市数据
    // 由于设置了 ON DELETE CASCADE，相关的维度数据也会自动删除
    const result = await db.run(
      "DELETE FROM cities WHERE list_type='world'"
    );

    console.log('========================================');
    console.log(`✓ 成功删除 ${result.changes} 条世界城市数据`);
    console.log('✓ 相关的维度数据也已自动清除');
    console.log('========================================\n');
    console.log('现在可以重新运行导入脚本:');
    console.log('  node import-world-cities.js');
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ 清除数据失败:', error.message);
    process.exit(1);
  }
}

// 执行清除
if (require.main === module) {
  clearWorldCities();
}

module.exports = clearWorldCities;
