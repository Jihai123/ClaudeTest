const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { verifyToken, optionalAuth } = require('../middleware/auth');
const { validateCity, validateDimensions, validateId } = require('../middleware/validator');
const { sanitizeObject } = require('../utils/sanitize');

// 【新增】获取热门城市
router.get('/hot', async (req, res) => {
  try {
    const { type = 'weekly', limit = 6 } = req.query;
    let query, params;

    switch (type) {
      case 'weekly':
        // 本周热门 - 按浏览量排序（最近7天）
        query = `
          SELECT
            c.id, c.name, c.province, c.avg_rent,
            c.layflat_score, c.overall_score, c.world_score,
            c.views_count, c.created_at
          FROM cities c
          WHERE c.status = 'approved'
          ORDER BY c.views_count DESC, c.layflat_score DESC
          LIMIT ?
        `;
        params = [parseInt(limit)];
        break;

      case 'featured':
        // 编辑推荐 - 高评分 + 低房租的优质城市
        query = `
          SELECT
            c.id, c.name, c.province, c.avg_rent,
            c.layflat_score, c.overall_score, c.world_score,
            c.views_count, c.created_at
          FROM cities c
          WHERE c.status = 'approved'
            AND c.avg_rent IS NOT NULL
            AND c.avg_rent < 2000
            AND (c.layflat_score >= 7.5 OR c.overall_score >= 7.5)
          ORDER BY c.layflat_score DESC, c.avg_rent ASC
          LIMIT ?
        `;
        params = [parseInt(limit)];
        break;

      case 'new':
        // 最新上榜 - 最近添加的城市
        query = `
          SELECT
            c.id, c.name, c.province, c.avg_rent,
            c.layflat_score, c.overall_score, c.world_score,
            c.views_count, c.created_at
          FROM cities c
          WHERE c.status = 'approved'
          ORDER BY c.created_at DESC
          LIMIT ?
        `;
        params = [parseInt(limit)];
        break;

      default:
        return res.status(400).json({ error: '无效的类型参数' });
    }

    const cities = await db.query(query, params);

    // 获取城市标签
    for (let city of cities) {
      const tags = await db.query(
        'SELECT * FROM city_tags WHERE city_id = ? AND is_primary = 1',
        [city.id]
      );
      city.tags = tags;
    }

    res.json({ cities });

  } catch (error) {
    console.error('获取热门城市失败:', error);
    res.status(500).json({ error: '获取热门城市失败' });
  }
});

// 获取城市列表（支持搜索、排序、分页、榜单筛选、高级筛选）
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      search,
      keywords, // 逗号分隔的关键词列表
      sort = 'overall_score',
      order = 'DESC',
      page = 1,
      limit = 20,
      status = 'approved',
      list_type, // 榜单类型: world, china_general, china_layflat
      filters // JSON字符串的筛选条件
    } = req.query;

    const offset = (page - 1) * limit;

    let whereClause = 'WHERE c.status = ?';
    let params = [status];

    // 榜单类型筛选
    if (list_type) {
      whereClause += ' AND c.list_type = ?';
      params.push(list_type);
    }

    // 搜索
    if (search) {
      whereClause += ' AND (c.name LIKE ? OR c.province LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // 关键词匹配（用于智能搜索）
    if (keywords) {
      const keywordList = keywords.split(',').map(k => k.trim()).filter(k => k);
      if (keywordList.length > 0) {
        const keywordConditions = keywordList.map(() => 'c.name LIKE ?').join(' OR ');
        whereClause += ` AND (${keywordConditions})`;
        keywordList.forEach(keyword => {
          params.push(`%${keyword}%`);
        });
      }
    }

    // 高级筛选
    if (filters) {
      try {
        const filterObj = JSON.parse(filters);

        // 省份筛选
        if (filterObj.province) {
          whereClause += ' AND c.province = ?';
          params.push(filterObj.province);
        }

        // 国家筛选（用于世界榜单）
        if (filterObj.country) {
          whereClause += ' AND c.country = ?';
          params.push(filterObj.country);
        }

        // 【重构】沿海城市筛选 - 使用标签
        if (filterObj.coastal || filterObj.seaside) {
          whereClause += ` AND c.id IN (
            SELECT DISTINCT city_id FROM city_tags
            WHERE tag_key = 'coastal' AND tag_value = 'true'
          )`;
        }

        // 【新增】租金区间筛选
        if (filterObj.rent) {
          if (filterObj.rent === '5000+') {
            whereClause += ' AND c.avg_rent >= 5000';
          } else {
            const [min, max] = filterObj.rent.split('-').map(Number);
            whereClause += ` AND c.avg_rent >= ${min} AND c.avg_rent <= ${max}`;
          }
        }

        // 【新增】地区筛选
        if (filterObj.region) {
          const regionMapping = {
            '华东': ['上海', '江苏', '浙江', '安徽', '福建', '江西', '山东'],
            '华南': ['广东', '广西', '海南'],
            '华北': ['北京', '天津', '河北', '山西', '内蒙古'],
            '西南': ['重庆', '四川', '贵州', '云南', '西藏'],
            '西北': ['陕西', '甘肃', '青海', '宁夏', '新疆'],
            '东北': ['辽宁', '吉林', '黑龙江'],
            '华中': ['河南', '湖北', '湖南']
          };

          const provinces = regionMapping[filterObj.region];
          if (provinces) {
            const placeholders = provinces.map(() => '?').join(',');
            whereClause += ` AND c.province IN (${placeholders})`;
            params.push(...provinces);
          }
        }

        // 【新增】城市等级筛选
        if (filterObj.tier) {
          const tierMapping = {
            '一线': '一线',
            '新一线': '新一线',
            '二线': '二线',
            '三线': '三线'
          };

          const tierValue = tierMapping[filterObj.tier];
          if (tierValue) {
            if (tierValue === '三线') {
              whereClause += ` AND (c.city_tier = ? OR c.city_tier IS NULL OR c.city_tier NOT IN ('一线', '新一线', '二线'))`;
              params.push(tierValue);
            } else {
              whereClause += ' AND c.city_tier = ?';
              params.push(tierValue);
            }
          }
        }

        // 【重构】特色标签筛选 - 使用city_tags表进行筛选
        const features = filterObj.features || [];

        if (features.length > 0) {
          // 使用子查询检查城市是否有对应的标签
          const tagPlaceholders = features.map(() => '?').join(',');
          whereClause += ` AND c.id IN (
            SELECT DISTINCT city_id FROM city_tags
            WHERE tag_key IN (${tagPlaceholders})
          )`;
          params.push(...features);
        }

        // 【兼容旧版】保留旧的 boolean 筛选方式支持（同样使用city_tags）
        const legacyFeatures = [];
        if (filterObj.seaside) legacyFeatures.push('seaside');
        if (filterObj.low_rent) legacyFeatures.push('low_rent');
        if (filterObj.spring_climate) legacyFeatures.push('spring_climate');
        if (filterObj.quiet) legacyFeatures.push('quiet');
        if (filterObj.medical) legacyFeatures.push('medical');
        if (filterObj.digital_nomad) legacyFeatures.push('digital_nomad');
        if (filterObj.elderly) legacyFeatures.push('elderly_friendly');
        if (filterObj.lake) legacyFeatures.push('lake');
        if (filterObj.mountain) legacyFeatures.push('mountain');

        if (legacyFeatures.length > 0) {
          const legacyPlaceholders = legacyFeatures.map(() => '?').join(',');
          whereClause += ` AND c.id IN (
            SELECT DISTINCT city_id FROM city_tags
            WHERE tag_key IN (${legacyPlaceholders})
          )`;
          params.push(...legacyFeatures);
        }

        // 【新增】维度范围筛选支持
        // 支持格式: field_min, field_max, field (精确匹配)
        const dimensionFields = [
          'living_cost', 'air_quality', 'medical_facilities', 'employment',
          'safety', 'elderly_care', 'rent_cost', 'climate',
          'slow_pace', 'medical_access', 'nature', 'population_density',
          'price_index', 'digital_facilities', 'medical', 'transportation',
          'internet', 'education', 'actual_level', 'overall_score'
        ];

        for (const field of dimensionFields) {
          // 最小值筛选
          if (filterObj[`${field}_min`] !== undefined) {
            const minValue = parseFloat(filterObj[`${field}_min`]);
            if (!isNaN(minValue)) {
              // overall_score在主表，其他在维度表
              const tablePrefix = field === 'overall_score' ? 'c' : 'cd';
              whereClause += ` AND ${tablePrefix}.${field} >= ?`;
              params.push(minValue);
            }
          }

          // 最大值筛选
          if (filterObj[`${field}_max`] !== undefined) {
            const maxValue = parseFloat(filterObj[`${field}_max`]);
            if (!isNaN(maxValue)) {
              const tablePrefix = field === 'overall_score' ? 'c' : 'cd';
              whereClause += ` AND ${tablePrefix}.${field} <= ?`;
              params.push(maxValue);
            }
          }

          // 精确匹配（如果没有_min/_max后缀）
          if (filterObj[field] !== undefined &&
              filterObj[`${field}_min`] === undefined &&
              filterObj[`${field}_max`] === undefined) {
            const exactValue = parseFloat(filterObj[field]);
            if (!isNaN(exactValue)) {
              const tablePrefix = field === 'overall_score' ? 'c' : 'cd';
              whereClause += ` AND ${tablePrefix}.${field} = ?`;
              params.push(exactValue);
            }
          }
        }

        // 人口范围筛选
        if (filterObj.population_min !== undefined) {
          const minPop = parseInt(filterObj.population_min);
          if (!isNaN(minPop)) {
            whereClause += ' AND c.population >= ?';
            params.push(minPop);
          }
        }

        if (filterObj.population_max !== undefined) {
          const maxPop = parseInt(filterObj.population_max);
          if (!isNaN(maxPop)) {
            whereClause += ' AND c.population <= ?';
            params.push(maxPop);
          }
        }

      } catch (e) {
        console.warn('筛选条件解析失败:', e);
      }
    }

    // 根据榜单类型决定排序字段
    const validSortFields = [
      'name', 'overall_score', 'layflat_score', 'world_score', 'population', 'created_at',
      // 维度字段排序支持
      'living_cost', 'air_quality', 'medical_facilities', 'employment',
      'safety', 'elderly_care', 'rent_cost', 'climate'
    ];
    let sortField = validSortFields.includes(sort) ? sort : 'overall_score';

    // 判断排序字段是在主表还是维度表
    const dimensionSortFields = [
      'living_cost', 'air_quality', 'medical_facilities', 'employment',
      'safety', 'elderly_care', 'rent_cost', 'climate'
    ];
    const sortTablePrefix = dimensionSortFields.includes(sortField) ? 'cd' : 'c';

    let orderByClause = '';

    // 躺平榜使用随机排序（打乱排名）
    if (list_type === 'china_layflat') {
      orderByClause = 'ORDER BY RANDOM()';
    } else {
      // 如果指定了榜单类型，使用对应的评分字段
      if (list_type === 'world' && sort === 'overall_score') {
        sortField = 'world_score';
      }
      const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      // 使用正确的表前缀
      orderByClause = `ORDER BY ${sortTablePrefix}.${sortField} ${sortOrder}`;
    }

    const query = `
      SELECT
        c.id, c.name, c.name_en, c.province, c.country, c.city_name, c.district,
        c.standard_location, c.city_level, c.grade_level, c.location_intro,
        c.population, c.gdp, c.area, c.link, c.key_points, c.climate, c.climate_desc,
        c.evaluation, c.notes, c.latitude, c.longitude, c.altitude,
        c.distance_to_sea, c.has_lake, c.overall_score, c.world_score, c.layflat_score,
        c.list_type, c.city_tier, c.avg_rent, c.house_price, c.avg_temp,
        c.slow_pace_score, c.digital_nomad_score, c.slogan, c.status,
        c.user_id, c.views_count, c.favorites_count, c.created_at, c.updated_at,
        cd.living_cost, cd.air_quality, cd.medical_facilities, cd.employment,
        cd.safety, cd.elderly_care, cd.rent_cost, cd.climate as climate_score,
        cd.slow_pace, cd.medical_access, cd.nature, cd.population_density,
        cd.price_index, cd.digital_facilities, cd.medical, cd.transportation,
        cd.internet, cd.education, cd.actual_level,
        COUNT(DISTINCT r.id) as review_count,
        AVG(r.rating) as avg_rating
      FROM cities c
      LEFT JOIN city_dimensions cd ON c.id = cd.city_id
      LEFT JOIN reviews r ON c.id = r.city_id AND r.status = 'approved'
      ${whereClause}
      GROUP BY c.id
      ${orderByClause}
      LIMIT ? OFFSET ?
    `;

    const cities = await db.query(query, [...params, parseInt(limit), parseInt(offset)]);

    // 获取城市标签
    for (let city of cities) {
      const tags = await db.query(
        'SELECT * FROM city_tags WHERE city_id = ? AND is_primary = 1',
        [city.id]
      );
      city.tags = tags;
    }

    const countQuery = `SELECT COUNT(*) as total FROM cities c LEFT JOIN city_dimensions cd ON c.id = cd.city_id ${whereClause}`;
    const { total } = await db.get(countQuery, params);

    res.json({
      cities,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('获取城市列表失败:', error);
    res.status(500).json({ error: '获取城市列表失败' });
  }
});

// 获取省份/国家列表（必须在/:id路由之前）
// 根据榜单类型返回不同的地理筛选选项
router.get('/provinces', async (req, res) => {
  try {
    const { list_type } = req.query;

    if (list_type === 'world') {
      // 世界榜单：返回国家列表
      const countries = await db.query(
        `SELECT DISTINCT country
         FROM cities
         WHERE country IS NOT NULL AND country != '' AND list_type = 'world'
         ORDER BY country`
      );

      // 如果没有world类型的城市，返回所有非中国的国家
      if (countries.length === 0) {
        const allCountries = await db.query(
          `SELECT DISTINCT country
           FROM cities
           WHERE country IS NOT NULL AND country != '' AND country != '中国'
           ORDER BY country`
        );
        res.json({
          type: 'country',
          label: '选择国家',
          items: allCountries.map(c => c.country)
        });
      } else {
        res.json({
          type: 'country',
          label: '选择国家',
          items: countries.map(c => c.country)
        });
      }
    } else {
      // 中国榜单：返回省份列表
      const provinces = await db.query(
        `SELECT DISTINCT province
         FROM cities
         WHERE province IS NOT NULL AND province != '' AND country = '中国'
         ORDER BY province`
      );

      res.json({
        type: 'province',
        label: '选择省份',
        items: provinces.map(p => p.province)
      });
    }
  } catch (error) {
    console.error('获取省份/国家列表失败:', error);
    res.status(500).json({ error: '获取省份/国家列表失败' });
  }
});

// 获取城市详情
router.get('/:id', validateId, async (req, res) => {
  try {
    const city = await db.get(
      `SELECT
        c.*,
        cd.*
      FROM cities c
      LEFT JOIN city_dimensions cd ON c.id = cd.city_id
      WHERE c.id = ?`,
      [req.params.id]
    );

    if (!city) {
      return res.status(404).json({ error: '城市不存在' });
    }

    // 获取评价统计
    const reviewStats = await db.get(
      `SELECT
        COUNT(*) as total_reviews,
        AVG(rating) as avg_rating
      FROM reviews
      WHERE city_id = ? AND status = 'approved'`,
      [req.params.id]
    );

    // 计算综合评分（结合系统评分和用户评分）
    const reviewCount = reviewStats.total_reviews || 0;
    const avgRating = reviewStats.avg_rating || 0;
    const userScoreMapped = avgRating * 2; // 用户评分映射到10分制

    // 根据评价数量确定权重
    let userWeight = 0;
    if (reviewCount < 5) userWeight = 0.1;
    else if (reviewCount < 20) userWeight = 0.2;
    else if (reviewCount < 50) userWeight = 0.3;
    else userWeight = 0.4;
    const systemWeight = 1 - userWeight;

    // 根据榜单类型选择系统评分
    let systemScore;
    if (city.list_type === 'world') {
      systemScore = city.world_score || 0;
    } else if (city.list_type === 'china_layflat') {
      systemScore = city.layflat_score || 0;
    } else {
      systemScore = city.overall_score || 0;
    }

    // 计算综合评分
    let combinedScore = reviewCount === 0
      ? systemScore
      : systemScore * systemWeight + userScoreMapped * userWeight;
    combinedScore = Math.round(combinedScore * 100) / 100;

    // 评分详情
    const scoreBreakdown = {
      system_score: systemScore,
      user_score: reviewCount > 0 ? userScoreMapped : null,
      user_rating_original: reviewCount > 0 ? avgRating : null,
      review_count: reviewCount,
      user_weight: userWeight,
      system_weight: systemWeight,
      combined_score: combinedScore
    };

    // 获取城市标签
    const tags = await db.query(
      'SELECT * FROM city_tags WHERE city_id = ? ORDER BY is_primary DESC',
      [req.params.id]
    );

    // 获取城市图片
    const images = await db.query(
      `SELECT * FROM city_images
       WHERE city_id = ? AND status = 'approved'
       ORDER BY weight DESC, likes_count DESC
       LIMIT 10`,
      [req.params.id]
    );

    // 获取封面图
    const coverImage = await db.get(
      `SELECT * FROM city_images
       WHERE city_id = ? AND is_cover = 1 AND status = 'approved'
       LIMIT 1`,
      [req.params.id]
    );

    // 增加浏览次数
    await db.run(
      'UPDATE cities SET views_count = views_count + 1 WHERE id = ?',
      [req.params.id]
    );

    res.json({
      ...city,
      review_stats: reviewStats,
      score_breakdown: scoreBreakdown,
      tags,
      images,
      cover_image: coverImage
    });
  } catch (error) {
    console.error('获取城市详情失败:', error);
    res.status(500).json({ error: '获取城市详情失败' });
  }
});

// 创建城市（需要登录）
router.post('/', verifyToken, validateCity, async (req, res) => {
  try {
    const cityData = sanitizeObject(req.body);
    const {
      name, province, city_name, district, standard_location,
      city_level, grade_level, location_intro, population, gdp, area,
      link, key_points, climate, evaluation, notes, dimensions
    } = cityData;

    // 检查城市是否已存在
    const existingCity = await db.get('SELECT * FROM cities WHERE name = ?', [name]);
    if (existingCity) {
      return res.status(400).json({ error: '该城市已存在' });
    }

    // 计算综合评分
    let overallScore = 0;
    if (dimensions) {
      overallScore = (
        parseFloat(dimensions.living_cost || 0) +
        parseFloat(dimensions.air_quality || 0) +
        parseFloat(dimensions.medical_facilities || 0) +
        parseFloat(dimensions.employment || 0) +
        parseFloat(dimensions.safety || 0) +
        parseFloat(dimensions.elderly_care || 0)
      ) / 6;
    }

    // 创建城市
    const result = await db.run(
      `INSERT INTO cities (name, province, city_name, district, standard_location,
       city_level, grade_level, location_intro, population, gdp, area, link,
       key_points, climate, evaluation, notes, overall_score, user_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, province || null, city_name || null, district || null, standard_location || null,
       city_level || null, grade_level || null, location_intro || null,
       population || null, gdp || null, area || null, link || null,
       key_points || null, climate || null, evaluation || null, notes || null,
       overallScore.toFixed(2), req.user.id, 'pending']
    );

    // 插入维度数据
    if (dimensions) {
      await db.run(
        `INSERT INTO city_dimensions (city_id, living_cost, air_quality, medical_facilities,
         employment, safety, elderly_care, medical, transportation, internet, education, actual_level)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [result.id, dimensions.living_cost || 0, dimensions.air_quality || 0,
         dimensions.medical_facilities || 0, dimensions.employment || 0,
         dimensions.safety || 0, dimensions.elderly_care || 0,
         dimensions.medical || null, dimensions.transportation || null,
         dimensions.internet || null, dimensions.education || null, dimensions.actual_level || null]
      );
    }

    res.status(201).json({
      message: '城市提交成功，等待管理员审核',
      city_id: result.id
    });
  } catch (error) {
    console.error('创建城市失败:', error);
    res.status(500).json({ error: '创建城市失败' });
  }
});

// 更新城市维度数据（需要登录）
router.put('/:id/dimensions', verifyToken, validateId, validateDimensions, async (req, res) => {
  try {
    const city = await db.get('SELECT * FROM cities WHERE id = ?', [req.params.id]);

    if (!city) {
      return res.status(404).json({ error: '城市不存在' });
    }

    // 只有管理员或城市创建者可以更新
    if (req.user.role !== 'admin' && city.user_id !== req.user.id) {
      return res.status(403).json({ error: '无权限更新此城市' });
    }

    const dimensions = sanitizeObject(req.body);

    // 更新维度数据
    await db.run(
      `UPDATE city_dimensions
       SET living_cost = ?, air_quality = ?, medical_facilities = ?,
           employment = ?, safety = ?, elderly_care = ?, medical = ?,
           transportation = ?, internet = ?, education = ?, actual_level = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE city_id = ?`,
      [dimensions.living_cost, dimensions.air_quality, dimensions.medical_facilities,
       dimensions.employment, dimensions.safety, dimensions.elderly_care,
       dimensions.medical || null, dimensions.transportation || null,
       dimensions.internet || null, dimensions.education || null,
       dimensions.actual_level || null, req.params.id]
    );

    // 更新综合评分
    const overallScore = (
      parseFloat(dimensions.living_cost) +
      parseFloat(dimensions.air_quality) +
      parseFloat(dimensions.medical_facilities) +
      parseFloat(dimensions.employment) +
      parseFloat(dimensions.safety) +
      parseFloat(dimensions.elderly_care)
    ) / 6;

    await db.run(
      'UPDATE cities SET overall_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [overallScore.toFixed(2), req.params.id]
    );

    res.json({ message: '城市数据更新成功' });
  } catch (error) {
    console.error('更新城市数据失败:', error);
    res.status(500).json({ error: '更新城市数据失败' });
  }
});

// 城市对比
router.post('/compare', async (req, res) => {
  try {
    const { city_ids } = req.body;

    if (!Array.isArray(city_ids) || city_ids.length < 2 || city_ids.length > 5) {
      return res.status(400).json({ error: '请选择2-5个城市进行对比' });
    }

    const placeholders = city_ids.map(() => '?').join(',');
    const cities = await db.query(
      `SELECT
        c.*,
        cd.living_cost,
        cd.air_quality,
        cd.medical_facilities,
        cd.employment,
        cd.safety,
        cd.elderly_care,
        cd.medical,
        cd.transportation,
        cd.internet,
        cd.education,
        cd.actual_level
      FROM cities c
      LEFT JOIN city_dimensions cd ON c.id = cd.city_id
      WHERE c.id IN (${placeholders}) AND c.status = 'approved'`,
      city_ids
    );

    if (cities.length !== city_ids.length) {
      return res.status(404).json({ error: '部分城市不存在' });
    }

    // 记录对比历史（如果用户已登录）
    if (req.user) {
      await db.run(
        'INSERT INTO comparison_history (user_id, city_ids) VALUES (?, ?)',
        [req.user.id, JSON.stringify(city_ids)]
      );
    }

    res.json({ cities });
  } catch (error) {
    console.error('城市对比失败:', error);
    res.status(500).json({ error: '城市对比失败' });
  }
});

module.exports = router;
