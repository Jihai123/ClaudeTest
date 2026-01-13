/**
 * 为城市设置封面图片
 * 从 city_images 表中选取已有的图片作为封面
 *
 * 运行方式: node server/utils/seedCityImages.js
 */

const db = require('../models/database');

// R2 图片基础 URL
const R2_BASE_URL = 'https://cityimg.zhibeimao.com/city_images';

async function seedCityImages() {
  console.log('开始为城市设置封面图片...');
  console.log('R2 图片基础 URL:', R2_BASE_URL);

  let successCount = 0;
  let skipCount = 0;
  let createdCount = 0;
  let failCount = 0;

  try {
    // 获取所有城市
    const cities = await db.query('SELECT id, name FROM cities WHERE status = ?', ['approved']);
    console.log(`找到 ${cities.length} 个城市\n`);

    for (const city of cities) {
      try {
        // 检查是否已有封面图片
        const existingCover = await db.get(
          'SELECT id, image_url FROM city_images WHERE city_id = ? AND is_cover = 1',
          [city.id]
        );

        if (existingCover) {
          console.log(`✓ ${city.name} (ID:${city.id}) 已有封面: ${existingCover.image_url}`);
          skipCount++;
          continue;
        }

        // 查找该城市的现有图片（按权重排序，取第一张）
        const existingImage = await db.get(
          `SELECT id, image_url FROM city_images
           WHERE city_id = ? AND status = 'approved'
           ORDER BY weight DESC, created_at ASC
           LIMIT 1`,
          [city.id]
        );

        if (existingImage) {
          // 将现有图片设为封面
          await db.run(
            'UPDATE city_images SET is_cover = 1, is_featured = 1 WHERE id = ?',
            [existingImage.id]
          );
          console.log(`✓ ${city.name} (ID:${city.id}) 设置封面: ${existingImage.image_url}`);
          successCount++;
        } else {
          // 没有现有图片，尝试创建默认图片记录
          // 使用 R2 的标准路径格式: city_images/{city_id}/{city_id}_1.jpeg
          const defaultImageUrl = `${R2_BASE_URL}/${city.id}/${city.id}_1.jpeg`;

          await db.run(
            `INSERT INTO city_images
             (city_id, image_url, thumbnail_url, alt_text, image_type, is_cover, is_featured, status, weight)
             VALUES (?, ?, ?, ?, 'cover', 1, 1, 'approved', 100)`,
            [city.id, defaultImageUrl, defaultImageUrl, `${city.name}风景图`]
          );
          console.log(`+ ${city.name} (ID:${city.id}) 创建封面: ${defaultImageUrl}`);
          createdCount++;
        }
      } catch (error) {
        console.error(`✗ ${city.name} (ID:${city.id}) 失败:`, error.message);
        failCount++;
      }
    }

    console.log('\n========== 完成 ==========');
    console.log(`设置封面: ${successCount}`);
    console.log(`创建新图片: ${createdCount}`);
    console.log(`已有封面: ${skipCount}`);
    console.log(`失败: ${failCount}`);
    console.log(`总计: ${cities.length}`);

  } catch (error) {
    console.error('执行失败:', error);
  }
}

// 运行
seedCityImages()
  .then(() => {
    console.log('\n脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('脚本执行失败:', error);
    process.exit(1);
  });
