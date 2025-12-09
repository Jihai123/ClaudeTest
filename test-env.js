// 环境变量诊断脚本
require('dotenv').config();

console.log('=== 环境变量诊断 ===\n');

console.log('📁 当前工作目录:', process.cwd());
console.log('📄 .env 文件位置:', require('path').join(process.cwd(), '.env'));

console.log('\n=== 关键环境变量 ===\n');

const envVars = [
  'PORT',
  'BASE_PATH',
  'NODE_ENV',
  'IMAGE_UPLOAD_METHOD',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_DOMAIN'
];

envVars.forEach(key => {
  const value = process.env[key];
  if (key.includes('SECRET') || key.includes('PASSWORD')) {
    console.log(`${key}: ${value ? '已配置 (长度: ' + value.length + ')' : '❌ 未配置'}`);
  } else {
    console.log(`${key}: ${value || '❌ 未配置'}`);
  }
});

console.log('\n=== R2 URL 测试 ===\n');

const testFileName = '1765199057290-ca0676306684b910.jpg';
const publicDomain = process.env.R2_PUBLIC_DOMAIN;

if (publicDomain) {
  const cleanDomain = publicDomain.replace(/^https?:\/\//, '');
  const expectedUrl = `https://${cleanDomain}/${testFileName}`;
  console.log('✅ 预期返回URL:', expectedUrl);
} else {
  console.log('❌ R2_PUBLIC_DOMAIN 未配置！');
  console.log('将返回私有URL: https://xxxxx.r2.cloudflarestorage.com/...');
}

console.log('\n=== 修复建议 ===\n');

if (!publicDomain) {
  console.log('1. 编辑 .env 文件:');
  console.log('   nano .env');
  console.log('');
  console.log('2. 添加以下配置:');
  console.log('   R2_PUBLIC_DOMAIN=cityimg.zhibeimao.com');
  console.log('');
  console.log('3. 重启 PM2:');
  console.log('   pm2 restart yijucit');
  console.log('');
  console.log('4. 再次运行此脚本验证:');
  console.log('   node test-env.js');
}
