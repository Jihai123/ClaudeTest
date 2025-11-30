const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { verifyToken, optionalAuth } = require('../middleware/auth');
const { validateCity, validateDimensions, validateId } = require('../middleware/validator');
const { sanitizeObject } = require('../utils/sanitize');

// 获取城市列表（支持搜索、排序、分页、榜单筛选、高级筛选）
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      search,
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

    // 高级筛选
    if (filters) {
      try {
        const filterObj = JSON.parse(filters);

        // 海边城市
        if (filterObj.seaside) {
          whereClause += ' AND c.distance_to_sea < 10';
        }

        // 低房租
        if (filterObj.low_rent) {
          whereClause += ' AND c.avg_rent < 1000';
        }

        // 超低房租
        if (filterObj.super_low_rent) {
          whereClause += ' AND c.avg_rent < 500';
        }

        // 四季如春
        if (filterObj.spring_climate) {
          whereClause += ' AND c.avg_temp BETWEEN 15 AND 25';
        }

        // 安静(人口少)
        if (filterObj.quiet) {
          whereClause += ' AND c.population < 500000';
        }

        // 医疗完善
        if (filterObj.medical) {
          whereClause += ' AND cd.medical_access >= 7';
        }

        // 数字游民友好
        if (filterObj.digital_nomad) {
          whereClause += ' AND c.digital_nomad_score >= 7';
        }

        // 适合养老
        if (filterObj.elderly) {
          whereClause += ' AND cd.elderly_care >= 8';
        }

        // 临湖
        if (filterObj.lake) {
          whereClause += ' AND c.has_lake = 1';
        }

        // 山居
        if (filterObj.mountain) {
          whereClause += ' AND c.altitude BETWEEN 800 AND 2000';
        }
      } catch (e) {
        console.warn('筛选条件解析失败:', e);
      }
    }

    // 根据榜单类型决定排序字段
    const validSortFields = ['name', 'overall_score', 'layflat_score', 'world_score', 'population', 'created_at'];
    let sortField = validSortFields.includes(sort) ? sort : 'overall_score';

    // 如果指定了榜单类型，使用对应的评分字段
    if (list_type === 'china_layflat' && sort === 'overall_score') {
      sortField = 'layflat_score';
    } else if (list_type === 'world' && sort === 'overall_score') {
      sortField = 'world_score';
    }

    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

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
      ORDER BY c.${sortField} ${sortOrder}
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
