// 路由测试脚本
require('dotenv').config();

console.log('=== 环境配置 ===');
console.log('PORT:', process.env.PORT);
console.log('BASE_PATH:', process.env.BASE_PATH);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('IMAGE_UPLOAD_METHOD:', process.env.IMAGE_UPLOAD_METHOD);
console.log('\n=== 期望的路由 ===');
console.log('健康检查:', `${process.env.BASE_PATH}/api/health`);
console.log('图片上传:', `${process.env.BASE_PATH}/api/upload`);

// 测试模块加载
console.log('\n=== 测试模块加载 ===');
try {
  const uploadRouter = require('./server/routes/upload');
  console.log('✅ upload.js 加载成功');
  console.log('路由栈:', uploadRouter.stack?.map(r => {
    return {
      path: r.route?.path,
      methods: r.route?.methods
    };
  }).filter(r => r.path));
} catch (e) {
  console.error('❌ upload.js 加载失败:', e.message);
}
