/**
 * 清理 404 图片脚本
 *
 * 功能：
 * 1. 检查数据库中所有图片 URL 是否可访问
 * 2. 删除返回 404 的图片记录
 *
 * 运行方式:
 *   node cleanup-404-images.js           # 仅检查，不删除（dry run）
 *   node cleanup-404-images.js --delete  # 检查并删除 404 图片
 *
 * 注意：此脚本会直接删除数据库记录，请先备份数据库
 */

const db = require('./server/models/database');

// 并发限制
const CONCURRENCY = 10;
// 请求超时时间（毫秒）
const TIMEOUT = 10000;

// 是否真正删除
const shouldDelete = process.argv.includes('--delete');

/**
 * 检查 URL 是否可访问
 */
async function checkUrl(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

    // 使用 GET 请求（Range header 只获取第一个字节，减少流量）
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Range': 'bytes=0-0'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // 206 Partial Content 或 200 OK 都表示文件存在
    if (response.status === 206 || response.status === 200 || response.status === 304) {
      return 200;
    }
    return response.status;
  } catch (error) {
    if (error.name === 'AbortError') {
      return 'TIMEOUT';
    }
    // 返回更详细的错误信息
    return `ERROR:${error.code || error.message?.substring(0, 30) || 'unknown'}`;
  }
}

/**
 * 分批处理
 */
async function processInBatches(items, batchSize, processor) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    // 显示进度
    const progress = Math.min(i + batchSize, items.length);
    console.log(`进度: ${progress}/${items.length}`);
  }
  return results;
}

async function main() {
  console.log('========================================');
  console.log('     404 图片清理脚本');
  console.log('========================================');
  console.log(`模式: ${shouldDelete ? '删除模式' : '检查模式（dry run）'}`);
  console.log(`并发数: ${CONCURRENCY}`);
  console.log(`超时: ${TIMEOUT}ms`);
  console.log('');

  try {
    // 获取所有图片
    console.log('正在获取数据库中的图片...');
    const images = await db.query(`
      SELECT id, city_id, image_url, thumbnail_url, alt_text
      FROM city_images
      ORDER BY id
    `);

    console.log(`共找到 ${images.length} 条图片记录\n`);

    if (images.length === 0) {
      console.log('没有图片需要检查');
      return;
    }

    // 检查每个图片
    console.log('开始检查图片 URL...\n');

    const notFoundImages = [];
    const errorImages = [];
    const validImages = [];

    const results = await processInBatches(images, CONCURRENCY, async (image) => {
      const status = await checkUrl(image.image_url);
      return { image, status };
    });

    // 分类结果
    for (const { image, status } of results) {
      if (status === 404) {
        notFoundImages.push(image);
      } else if (status === 200 || status === 304) {
        validImages.push(image);
      } else {
        errorImages.push({ image, status });
      }
    }

    // 输出统计
    console.log('\n========================================');
    console.log('     检查结果统计');
    console.log('========================================');
    console.log(`有效图片 (200/304): ${validImages.length}`);
    console.log(`404 图片:           ${notFoundImages.length}`);
    console.log(`其他错误:           ${errorImages.length}`);
    console.log('');

    // 显示 404 图片详情
    if (notFoundImages.length > 0) {
      console.log('========================================');
      console.log('     404 图片列表');
      console.log('========================================');
      for (const img of notFoundImages.slice(0, 20)) {
        console.log(`ID: ${img.id}, 城市ID: ${img.city_id}`);
        console.log(`   URL: ${img.image_url}`);
        console.log(`   描述: ${img.alt_text || '无'}`);
        console.log('');
      }
      if (notFoundImages.length > 20) {
        console.log(`... 还有 ${notFoundImages.length - 20} 条记录`);
      }
    }

    // 显示其他错误
    if (errorImages.length > 0) {
      console.log('========================================');
      console.log('     其他错误列表');
      console.log('========================================');
      for (const { image, status } of errorImages.slice(0, 10)) {
        console.log(`ID: ${image.id}, 状态: ${status}`);
        console.log(`   URL: ${image.image_url}`);
      }
      if (errorImages.length > 10) {
        console.log(`... 还有 ${errorImages.length - 10} 条记录`);
      }
    }

    // 如果是删除模式，执行删除
    if (shouldDelete && notFoundImages.length > 0) {
      console.log('\n========================================');
      console.log('     执行删除操作');
      console.log('========================================');

      const idsToDelete = notFoundImages.map(img => img.id);
      const placeholders = idsToDelete.map(() => '?').join(',');

      await db.run(`DELETE FROM city_images WHERE id IN (${placeholders})`, idsToDelete);

      console.log(`成功删除 ${idsToDelete.length} 条 404 图片记录`);
    } else if (!shouldDelete && notFoundImages.length > 0) {
      console.log('\n========================================');
      console.log('     下一步');
      console.log('========================================');
      console.log(`发现 ${notFoundImages.length} 条 404 图片`);
      console.log('如需删除，请运行: node cleanup-404-images.js --delete');
    }

    console.log('\n脚本执行完成');

  } catch (error) {
    console.error('执行失败:', error);
    process.exit(1);
  }
}

// 运行
main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
