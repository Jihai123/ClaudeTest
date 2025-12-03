const db = require('./server/models/database');

async function initDatabase() {
  try {
    console.log('正在初始化数据库...');
    await db.init();
    console.log('数据库初始化成功！');
    process.exit(0);
  } catch (error) {
    console.error('数据库初始化失败:', error);
    process.exit(1);
  }
}

initDatabase();
