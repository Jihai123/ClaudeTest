/**
 * 为城市添加真实封面图片
 * 使用稳定可靠的图片 CDN 源
 *
 * 运行方式: node server/utils/seedCityImages.js
 */

const db = require('../models/database');

// 城市真实图片映射
// 使用高质量的风景图片 URL
// 生产环境建议将这些图片上传到自己的云存储（腾讯云COS、阿里云OSS等）
const CITY_REAL_IMAGES = {
  // 一线城市
  '北京': {
    url: 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=800&h=600&fit=crop',
    alt: '北京故宫'
  },
  '上海': {
    url: 'https://images.unsplash.com/photo-1538428494232-9c0d8a3ab403?w=800&h=600&fit=crop',
    alt: '上海外滩'
  },
  '广州': {
    url: 'https://images.unsplash.com/photo-1583001809873-a128495da465?w=800&h=600&fit=crop',
    alt: '广州塔'
  },
  '深圳': {
    url: 'https://images.unsplash.com/photo-1598711796884-f221383f7a7b?w=800&h=600&fit=crop',
    alt: '深圳城市景观'
  },

  // 热门旅居城市
  '成都': {
    url: 'https://images.unsplash.com/photo-1590650046871-92c887180603?w=800&h=600&fit=crop',
    alt: '成都宽窄巷子'
  },
  '杭州': {
    url: 'https://images.unsplash.com/photo-1600054800747-be294a6a0d26?w=800&h=600&fit=crop',
    alt: '杭州西湖'
  },
  '重庆': {
    url: 'https://images.unsplash.com/photo-1607697210821-e1aff0769b09?w=800&h=600&fit=crop',
    alt: '重庆洪崖洞'
  },
  '西安': {
    url: 'https://images.unsplash.com/photo-1624204621668-f7124c85c49a?w=800&h=600&fit=crop',
    alt: '西安城墙'
  },
  '苏州': {
    url: 'https://images.unsplash.com/photo-1567706054965-4d25339ce9a5?w=800&h=600&fit=crop',
    alt: '苏州园林'
  },
  '南京': {
    url: 'https://images.unsplash.com/photo-1599571234909-29ed5d1321d6?w=800&h=600&fit=crop',
    alt: '南京中山陵'
  },

  // 沿海城市
  '厦门': {
    url: 'https://images.unsplash.com/photo-1569949381669-ecf31ae8e613?w=800&h=600&fit=crop',
    alt: '厦门鼓浪屿'
  },
  '青岛': {
    url: 'https://images.unsplash.com/photo-1548991422-02ba3a9fe29a?w=800&h=600&fit=crop',
    alt: '青岛海滨'
  },
  '三亚': {
    url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop',
    alt: '三亚海滩'
  },
  '珠海': {
    url: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop',
    alt: '珠海渔女'
  },
  '大连': {
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=600&fit=crop',
    alt: '大连海滨'
  },
  '威海': {
    url: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=800&h=600&fit=crop',
    alt: '威海海景'
  },
  '北海': {
    url: 'https://images.unsplash.com/photo-1471922694854-ff1b63b20054?w=800&h=600&fit=crop',
    alt: '北海银滩'
  },

  // 云南城市
  '大理': {
    url: 'https://images.unsplash.com/photo-1537531383496-f4749c6e5d74?w=800&h=600&fit=crop',
    alt: '大理洱海'
  },
  '丽江': {
    url: 'https://images.unsplash.com/photo-1591122947157-26bad3a117d2?w=800&h=600&fit=crop',
    alt: '丽江古城'
  },
  '昆明': {
    url: 'https://images.unsplash.com/photo-1590650516494-0c8e4a4dd67e?w=800&h=600&fit=crop',
    alt: '昆明滇池'
  },
  '西双版纳': {
    url: 'https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?w=800&h=600&fit=crop',
    alt: '西双版纳热带雨林'
  },
  '腾冲': {
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&h=600&fit=crop',
    alt: '腾冲火山地热'
  },

  // 其他热门城市
  '武汉': {
    url: 'https://images.unsplash.com/photo-1583001931096-959e9a1a6223?w=800&h=600&fit=crop',
    alt: '武汉黄鹤楼'
  },
  '长沙': {
    url: 'https://images.unsplash.com/photo-1590736969955-71cc94901144?w=800&h=600&fit=crop',
    alt: '长沙橘子洲'
  },
  '天津': {
    url: 'https://images.unsplash.com/photo-1580077812579-4e0b6db9e7da?w=800&h=600&fit=crop',
    alt: '天津之眼'
  },
  '南宁': {
    url: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=800&h=600&fit=crop',
    alt: '南宁城市'
  },
  '桂林': {
    url: 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=800&h=600&fit=crop',
    alt: '桂林山水'
  },
  '贵阳': {
    url: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800&h=600&fit=crop',
    alt: '贵阳城市风光'
  },
  '海口': {
    url: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&h=600&fit=crop',
    alt: '海口海滨'
  },
  '福州': {
    url: 'https://images.unsplash.com/photo-1513415756790-2ac1db1297d0?w=800&h=600&fit=crop',
    alt: '福州三坊七巷'
  },
  '宁波': {
    url: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&h=600&fit=crop',
    alt: '宁波天一阁'
  },
  '无锡': {
    url: 'https://images.unsplash.com/photo-1533104816931-20fa691ff6ca?w=800&h=600&fit=crop',
    alt: '无锡太湖'
  },
  '扬州': {
    url: 'https://images.unsplash.com/photo-1514539079130-25950c84af65?w=800&h=600&fit=crop',
    alt: '扬州瘦西湖'
  },
  '泉州': {
    url: 'https://images.unsplash.com/photo-1544892999-46a73b2c0e19?w=800&h=600&fit=crop',
    alt: '泉州古城'
  },
  '烟台': {
    url: 'https://images.unsplash.com/photo-1484291470158-b8f8d608850d?w=800&h=600&fit=crop',
    alt: '烟台海滨'
  },
  '洛阳': {
    url: 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=800&h=600&fit=crop',
    alt: '洛阳牡丹'
  },
  '郑州': {
    url: 'https://images.unsplash.com/photo-1514539079130-25950c84af65?w=800&h=600&fit=crop',
    alt: '郑州城市'
  },
  '合肥': {
    url: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=800&h=600&fit=crop',
    alt: '合肥城市'
  },
  '济南': {
    url: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&h=600&fit=crop',
    alt: '济南泉城'
  },
  '沈阳': {
    url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=800&h=600&fit=crop',
    alt: '沈阳故宫'
  },
  '哈尔滨': {
    url: 'https://images.unsplash.com/photo-1517483000871-1dbf64a6e1c6?w=800&h=600&fit=crop',
    alt: '哈尔滨冰雪大世界'
  },
  '长春': {
    url: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&h=600&fit=crop',
    alt: '长春城市'
  },
};

async function seedCityImages() {
  console.log('开始为城市添加真实封面图片...');

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const [cityName, imageInfo] of Object.entries(CITY_REAL_IMAGES)) {
    try {
      // 查找城市
      const city = await db.get('SELECT id FROM cities WHERE name = ?', [cityName]);

      if (!city) {
        console.log(`城市不存在: ${cityName}`);
        skipCount++;
        continue;
      }

      // 检查是否已有封面图片
      const existingCover = await db.get(
        'SELECT id FROM city_images WHERE city_id = ? AND is_cover = 1',
        [city.id]
      );

      if (existingCover) {
        // 更新现有封面图片
        await db.run(
          `UPDATE city_images
           SET image_url = ?, thumbnail_url = ?, alt_text = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [imageInfo.url, imageInfo.url, imageInfo.alt, existingCover.id]
        );
        console.log(`✓ 更新封面图片: ${cityName}`);
      } else {
        // 插入新的封面图片
        await db.run(
          `INSERT INTO city_images
           (city_id, image_url, thumbnail_url, alt_text, image_type, is_cover, is_featured, status, weight)
           VALUES (?, ?, ?, ?, 'cover', 1, 1, 'approved', 100)`,
          [city.id, imageInfo.url, imageInfo.url, imageInfo.alt]
        );
        console.log(`✓ 添加封面图片: ${cityName}`);
      }

      successCount++;
    } catch (error) {
      console.error(`✗ 处理失败 ${cityName}:`, error.message);
      failCount++;
    }
  }

  console.log('\n========== 完成 ==========');
  console.log(`成功: ${successCount}`);
  console.log(`跳过: ${skipCount}`);
  console.log(`失败: ${failCount}`);
}

// 运行
seedCityImages()
  .then(() => {
    console.log('脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('脚本执行失败:', error);
    process.exit(1);
  });
