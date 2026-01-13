/**
 * 测试图片URL访问脚本
 * 用于诊断服务器上fetch请求失败的原因
 */

const testUrls = [
  'https://cityimg.zhibeimao.com/city_images/1211/20260110150702_72ee0d0c.jpeg',
  'https://cityimg.zhibeimao.com/1765202570629-b49f3f79e3867611.jpg',
  'https://1fe46217d231bb495f63dfc25f2e1567.r2.cloudflarestorage.com/1765199057290-ca0676306684b910.jpg'
];

async function testFetch() {
  console.log('Node.js 版本:', process.version);
  console.log('测试图片URL访问...\n');

  for (const url of testUrls) {
    console.log('测试 URL:', url);

    // 测试1: 使用 HEAD 请求
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      console.log('  HEAD 请求: 状态码', response.status);
    } catch (error) {
      console.log('  HEAD 请求失败:', error.code || error.cause?.code || error.message);
    }

    // 测试2: 使用 GET + Range 请求
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Range': 'bytes=0-0' },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      console.log('  GET+Range 请求: 状态码', response.status);
    } catch (error) {
      console.log('  GET+Range 请求失败:', error.code || error.cause?.code || error.message);
      if (error.cause) {
        console.log('    详细错误:', error.cause);
      }
    }

    console.log('');
  }
}

// 也测试一下 https 模块
async function testHttps() {
  const https = require('https');
  const url = new URL(testUrls[0]);

  console.log('使用 https 模块测试...');

  return new Promise((resolve) => {
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'HEAD',
      timeout: 10000
    }, (res) => {
      console.log('  https 模块: 状态码', res.statusCode);
      resolve();
    });

    req.on('error', (error) => {
      console.log('  https 模块失败:', error.code || error.message);
      resolve();
    });

    req.on('timeout', () => {
      console.log('  https 模块超时');
      req.destroy();
      resolve();
    });

    req.end();
  });
}

async function main() {
  await testFetch();
  await testHttps();
  console.log('\n测试完成');
}

main().catch(console.error);
