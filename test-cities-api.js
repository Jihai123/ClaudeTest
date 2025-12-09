// 城市 API 诊断脚本
require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(process.env.DB_PATH || './database.sqlite');

console.log('=== 数据库诊断 ===\n');

// 检查城市总数
db.get('SELECT COUNT(*) as count FROM cities', (err, row) => {
  if (err) {
    console.error('❌ 查询城市总数失败:', err.message);
  } else {
    console.log(`总城市数: ${row.count}`);
  }
});

// 检查已审核城市数
db.get('SELECT COUNT(*) as count FROM cities WHERE status = ?', ['approved'], (err, row) => {
  if (err) {
    console.error('❌ 查询已审核城市失败:', err.message);
  } else {
    console.log(`已审核城市数: ${row.count}`);
  }
});

// 检查各榜单的城市数
const listTypes = ['china_general', 'layflat_index', 'world'];
listTypes.forEach(listType => {
  db.get(
    'SELECT COUNT(*) as count FROM cities WHERE list_type = ? AND status = ?',
    [listType, 'approved'],
    (err, row) => {
      if (err) {
        console.error(`❌ 查询榜单 ${listType} 失败:`, err.message);
      } else {
        console.log(`榜单 ${listType}: ${row.count} 个城市`);
      }
    }
  );
});

// 查看前5个城市示例
setTimeout(() => {
  console.log('\n=== 城市示例 ===\n');
  db.all(
    'SELECT id, name, list_type, status FROM cities LIMIT 5',
    (err, rows) => {
      if (err) {
        console.error('❌ 查询城市示例失败:', err.message);
      } else if (rows.length === 0) {
        console.log('⚠️ 数据库中没有城市数据！');
        console.log('\n💡 解决方案：运行数据填充脚本');
        console.log('   npm run seed-cities');
        console.log('   npm run seed-layflat');
      } else {
        console.table(rows);
      }

      db.close();

      // 测试路由
      console.log('\n=== 路由测试 ===\n');
      console.log('BASE_PATH:', process.env.BASE_PATH);

      try {
        const citiesRouter = require('./server/routes/cities');
        console.log('✅ cities 路由加载成功');
        console.log('路由栈:', citiesRouter.stack?.map(r => {
          return {
            path: r.route?.path,
            methods: Object.keys(r.route?.methods || {})
          };
        }).filter(r => r.path));
      } catch (e) {
        console.error('❌ cities 路由加载失败:', e.message);
      }
    }
  );
}, 100);
