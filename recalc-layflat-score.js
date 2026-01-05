#!/usr/bin/env node
/**
 * 重新计算旅居城市评分（layflat_score）
 *
 * 评分维度及权重：
 * - 生活成本低 (25%) - 越低越好
 * - 气候舒适度 (20%) - 四季如春/温暖
 * - 空气质量 (15%)
 * - 自然环境 (15%)
 * - 安全指数 (10%)
 * - 医疗条件 (10%)
 * - 慢节奏生活 (5%)
 */
const db = require('./server/models/database');

// 气候评分 - 基于省份
const CLIMATE_SCORES = {
  // 四季如春型 - 最高分
  '云南': 9.5, '云南省': 9.5,
  // 温暖舒适型
  '海南': 9.0, '海南省': 9.0,
  '广东': 8.5, '广东省': 8.5,
  '广西': 8.5, '广西壮族自治区': 8.5,
  '福建': 8.3, '福建省': 8.3,
  '贵州': 8.0, '贵州省': 8.0,
  // 温和型
  '浙江': 7.5, '浙江省': 7.5,
  '江苏': 7.0, '江苏省': 7.0,
  '四川': 7.5, '四川省': 7.5,
  '重庆': 7.0, '重庆市': 7.0,
  '湖南': 7.0, '湖南省': 7.0,
  '湖北': 6.8, '湖北省': 6.8,
  '江西': 7.2, '江西省': 7.2,
  '安徽': 6.8, '安徽省': 6.8,
  // 偏冷型
  '山东': 6.5, '山东省': 6.5,
  '河南': 6.0, '河南省': 6.0,
  '河北': 5.5, '河北省': 5.5,
  '山西': 5.5, '山西省': 5.5,
  '陕西': 6.0, '陕西省': 6.0,
  '甘肃': 5.0, '甘肃省': 5.0,
  '宁夏': 5.0, '宁夏回族自治区': 5.0,
  '青海': 4.5, '青海省': 4.5,
  '新疆': 4.5, '新疆维吾尔自治区': 4.5,
  '内蒙古': 4.0, '内蒙古自治区': 4.0,
  // 寒冷型 - 最低分
  '辽宁': 4.5, '辽宁省': 4.5,
  '吉林': 4.0, '吉林省': 4.0,
  '黑龙江': 3.5, '黑龙江省': 3.5,
  // 特别区域
  '北京': 5.5, '北京市': 5.5,
  '上海': 7.0, '上海市': 7.0,
  '天津': 5.5, '天津市': 5.5,
};

// 自然环境评分 - 基于省份
const NATURE_SCORES = {
  '云南': 9.5, '云南省': 9.5,
  '贵州': 9.0, '贵州省': 9.0,
  '海南': 9.0, '海南省': 9.0,
  '广西': 8.5, '广西壮族自治区': 8.5,
  '四川': 8.5, '四川省': 8.5,
  '福建': 8.0, '福建省': 8.0,
  '浙江': 7.5, '浙江省': 7.5,
  '江西': 7.5, '江西省': 7.5,
  '湖南': 7.0, '湖南省': 7.0,
  '安徽': 7.0, '安徽省': 7.0,
  '广东': 7.0, '广东省': 7.0,
};

async function recalculateLayflatScore() {
  console.log('=== 重新计算旅居城市评分 ===\n');

  await db.init();
  await new Promise(r => setTimeout(r, 500));

  try {
    // 获取所有旅居榜城市
    const cities = await db.query(`
      SELECT c.id, c.name, c.province, c.avg_rent,
             cd.living_cost, cd.air_quality, cd.safety, cd.medical_facilities
      FROM cities c
      LEFT JOIN city_dimensions cd ON c.id = cd.city_id
      WHERE c.list_type = 'china_layflat'
    `);

    console.log(`共 ${cities.length} 个旅居城市需要重算评分\n`);

    // 获取租金范围用于归一化
    const rentStats = await db.get(`
      SELECT MIN(avg_rent) as min_rent, MAX(avg_rent) as max_rent
      FROM cities WHERE list_type = 'china_layflat' AND avg_rent > 0
    `);
    const minRent = rentStats.min_rent || 50;
    const maxRent = rentStats.max_rent || 3000;

    let updated = 0;

    for (const city of cities) {
      // 1. 生活成本评分 (基于租金，越低越好)
      let costScore = 5;
      if (city.avg_rent) {
        // 租金越低分越高：50元=10分，3000元=3分
        costScore = 10 - (city.avg_rent - minRent) / (maxRent - minRent) * 7;
        costScore = Math.max(3, Math.min(10, costScore));
      }

      // 2. 气候评分
      const climateScore = CLIMATE_SCORES[city.province] || 6.0;

      // 3. 空气质量
      const airScore = city.air_quality || 6.5;

      // 4. 自然环境
      const natureScore = NATURE_SCORES[city.province] || 6.0;

      // 5. 安全指数
      const safetyScore = city.safety || 7.0;

      // 6. 医疗条件
      const medicalScore = city.medical_facilities || 5.0;

      // 7. 慢节奏生活 (小城市更慢节奏)
      let paceScore = 7.0; // 默认中等

      // 计算综合评分
      // 权重：成本25% + 气候20% + 空气15% + 自然15% + 安全10% + 医疗10% + 节奏5%
      const layflatScore = (
        costScore * 0.25 +
        climateScore * 0.20 +
        airScore * 0.15 +
        natureScore * 0.15 +
        safetyScore * 0.10 +
        medicalScore * 0.10 +
        paceScore * 0.05
      );

      // 四舍五入到一位小数
      const finalScore = Math.round(layflatScore * 10) / 10;

      // 更新数据库
      await db.run(
        'UPDATE cities SET layflat_score = ? WHERE id = ?',
        [finalScore, city.id]
      );

      updated++;
    }

    console.log(`已更新 ${updated} 个城市的layflat_score\n`);

    // 显示新排名
    console.log('【新旅居榜TOP20】');
    const newTop = await db.query(`
      SELECT name, province, layflat_score, avg_rent
      FROM cities WHERE list_type = 'china_layflat'
      ORDER BY layflat_score DESC
      LIMIT 20
    `);
    newTop.forEach((c, i) => {
      console.log(`  ${(i+1).toString().padStart(2)}. ${c.name.padEnd(10)} (${(c.province || '').padEnd(6)}) - 评分:${c.layflat_score} 月租:${c.avg_rent}元`);
    });

    console.log('\n=== 计算完成 ===');

  } catch (error) {
    console.error('计算失败:', error);
  } finally {
    await db.close();
  }
}

recalculateLayflatScore();
