const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { verifyToken, optionalAuth } = require('../middleware/auth');
const { validateReview, validateReply, validateId } = require('../middleware/validator');
const { sanitizeObject } = require('../utils/sanitize');

/**
 * 计算城市的综合评分（结合系统评分和用户评分）
 *
 * 加权公式：综合评分 = 系统评分 × 系统权重 + 用户平均评分 × 用户权重
 * 权重动态调整：评价数量越多，用户评分权重越大
 *   - 评价数 < 5：用户权重 = 10%
 *   - 5 <= 评价数 < 20：用户权重 = 20%
 *   - 20 <= 评价数 < 50：用户权重 = 30%
 *   - 评价数 >= 50：用户权重 = 40%
 *
 * 用户评分（1-5分）会被映射到10分制
 *
 * 注意：此函数不会修改数据库中的系统评分，而是返回综合评分信息
 * 供前端展示使用。这样可以保留原始的系统评分数据。
 */
async function calculateCombinedScore(cityId) {
  try {
    // 获取城市当前的系统评分
    const city = await db.get(
      'SELECT overall_score, layflat_score, world_score, list_type FROM cities WHERE id = ?',
      [cityId]
    );

    if (!city) {
      return null;
    }

    // 获取城市的用户评价统计
    const reviewStats = await db.get(
      `SELECT COUNT(*) as review_count, AVG(rating) as avg_rating
       FROM reviews
       WHERE city_id = ? AND status = 'approved'`,
      [cityId]
    );

    const reviewCount = reviewStats.review_count || 0;
    const avgRating = reviewStats.avg_rating || 0;

    // 将用户评分（1-5分）映射到10分制
    const userScoreMapped = avgRating * 2;

    // 根据评价数量确定用户评分权重
    let userWeight = 0;
    if (reviewCount < 5) {
      userWeight = 0.1;
    } else if (reviewCount < 20) {
      userWeight = 0.2;
    } else if (reviewCount < 50) {
      userWeight = 0.3;
    } else {
      userWeight = 0.4;
    }
    const systemWeight = 1 - userWeight;

    // 根据榜单类型选择对应的系统评分
    let systemScore;
    if (city.list_type === 'world') {
      systemScore = city.world_score || 0;
    } else if (city.list_type === 'china_layflat') {
      systemScore = city.layflat_score || 0;
    } else {
      systemScore = city.overall_score || 0;
    }

    // 计算综合评分
    let combinedScore;
    if (reviewCount === 0) {
      combinedScore = systemScore;
    } else {
      combinedScore = systemScore * systemWeight + userScoreMapped * userWeight;
    }

    // 保留两位小数
    combinedScore = Math.round(combinedScore * 100) / 100;

    return {
      system_score: systemScore,
      user_score: userScoreMapped,
      user_rating_original: avgRating, // 原始的1-5分
      review_count: reviewCount,
      user_weight: userWeight,
      system_weight: systemWeight,
      combined_score: combinedScore
    };

  } catch (error) {
    console.error(`计算城市综合评分失败 [ID: ${cityId}]:`, error);
    return null;
  }
}

// 导出计算函数供其他模块使用
module.exports.calculateCombinedScore = calculateCombinedScore;

// 获取城市的评价列表
router.get('/city/:cityId', optionalAuth, async (req, res) => {
  try {
    const { cityId } = req.params;
    const { sort = 'created_at', order = 'DESC', page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const validSortFields = ['created_at', 'rating', 'likes'];
    const sortField = validSortFields.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const reviews = await db.query(
      `SELECT
        r.*,
        u.username,
        (SELECT COUNT(*) FROM review_likes WHERE review_id = r.id) as likes,
        ${req.user ? `(SELECT COUNT(*) FROM review_likes WHERE review_id = r.id AND user_id = ?) as user_liked` : '0 as user_liked'}
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.city_id = ? AND r.status = 'approved'
      ORDER BY r.${sortField} ${sortOrder}
      LIMIT ? OFFSET ?`,
      req.user ? [req.user.id, cityId, parseInt(limit), parseInt(offset)] : [cityId, parseInt(limit), parseInt(offset)]
    );

    // 获取每个评价的回复
    for (let review of reviews) {
      const replies = await db.query(
        `SELECT rr.*, u.username
         FROM review_replies rr
         JOIN users u ON rr.user_id = u.id
         WHERE rr.review_id = ?
         ORDER BY rr.created_at ASC`,
        [review.id]
      );
      review.replies = replies;
    }

    const { total } = await db.get(
      'SELECT COUNT(*) as total FROM reviews WHERE city_id = ? AND status = ?',
      [cityId, 'approved']
    );

    res.json({
      reviews,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('获取评价列表失败:', error);
    res.status(500).json({ error: '获取评价列表失败' });
  }
});

// 创建评价（需要登录）
router.post('/', verifyToken, validateReview, async (req, res) => {
  try {
    const {
      city_id,
      rating,
      comment,
      living_duration,
      living_purpose,
      residence_years,
      is_anonymous = false,
      // 六维评分
      living_cost_rating,
      air_quality_rating,
      medical_rating,
      employment_rating,
      safety_rating,
      elderly_care_rating,
      // 图片
      images = []
    } = sanitizeObject(req.body);

    // 检查城市是否存在
    const city = await db.get('SELECT * FROM cities WHERE id = ?', [city_id]);
    if (!city) {
      return res.status(404).json({ error: '城市不存在' });
    }

    // 检查用户是否已经评价过该城市
    const existingReview = await db.get(
      'SELECT * FROM reviews WHERE city_id = ? AND user_id = ?',
      [city_id, req.user.id]
    );

    if (existingReview) {
      return res.status(400).json({ error: '您已经评价过该城市' });
    }

    // 创建评价
    const imagesJson = JSON.stringify(images);
    const result = await db.run(
      `INSERT INTO reviews (
        city_id, user_id, rating, comment,
        living_duration, living_purpose, residence_years,
        is_anonymous, images,
        living_cost_rating, air_quality_rating, medical_rating,
        employment_rating, safety_rating, elderly_care_rating
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        city_id, req.user.id, rating, comment || null,
        living_duration, living_purpose, residence_years,
        is_anonymous, imagesJson,
        living_cost_rating, air_quality_rating, medical_rating,
        employment_rating, safety_rating, elderly_care_rating
      ]
    );

    // 计算并返回新的综合评分
    const scoreInfo = await calculateCombinedScore(city_id);

    res.status(201).json({
      message: '评价提交成功',
      review_id: result.id,
      score_info: scoreInfo
    });
  } catch (error) {
    console.error('创建评价失败:', error);
    res.status(500).json({ error: '创建评价失败' });
  }
});

// 更新评价（需要登录）
router.put('/:id', verifyToken, validateId, validateReview, async (req, res) => {
  try {
    const review = await db.get('SELECT * FROM reviews WHERE id = ?', [req.params.id]);

    if (!review) {
      return res.status(404).json({ error: '评价不存在' });
    }

    if (review.user_id !== req.user.id) {
      return res.status(403).json({ error: '无权限修改此评价' });
    }

    const {
      rating,
      comment,
      living_duration,
      living_purpose,
      residence_years,
      living_cost_rating,
      air_quality_rating,
      medical_rating,
      employment_rating,
      safety_rating,
      elderly_care_rating,
      images
    } = sanitizeObject(req.body);

    const imagesJson = images ? JSON.stringify(images) : review.images;

    await db.run(
      `UPDATE reviews SET
        rating = ?,
        comment = ?,
        living_duration = ?,
        living_purpose = ?,
        residence_years = ?,
        living_cost_rating = ?,
        air_quality_rating = ?,
        medical_rating = ?,
        employment_rating = ?,
        safety_rating = ?,
        elderly_care_rating = ?,
        images = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        rating, comment || null,
        living_duration, living_purpose, residence_years,
        living_cost_rating, air_quality_rating, medical_rating,
        employment_rating, safety_rating, elderly_care_rating,
        imagesJson, req.params.id
      ]
    );

    // 计算并返回新的综合评分
    const scoreInfo = await calculateCombinedScore(review.city_id);

    res.json({ message: '评价更新成功', score_info: scoreInfo });
  } catch (error) {
    console.error('更新评价失败:', error);
    res.status(500).json({ error: '更新评价失败' });
  }
});

// 删除评价（需要登录）
router.delete('/:id', verifyToken, validateId, async (req, res) => {
  try {
    const review = await db.get('SELECT * FROM reviews WHERE id = ?', [req.params.id]);

    if (!review) {
      return res.status(404).json({ error: '评价不存在' });
    }

    if (review.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限删除此评价' });
    }

    const cityId = review.city_id; // 保存城市ID，删除后需要用到

    await db.run('DELETE FROM reviews WHERE id = ?', [req.params.id]);

    // 计算并返回新的综合评分
    const scoreInfo = await calculateCombinedScore(cityId);

    res.json({ message: '评价删除成功', score_info: scoreInfo });
  } catch (error) {
    console.error('删除评价失败:', error);
    res.status(500).json({ error: '删除评价失败' });
  }
});

// 点赞/取消点赞评价（需要登录）
router.post('/:id/like', verifyToken, validateId, async (req, res) => {
  try {
    const review = await db.get('SELECT * FROM reviews WHERE id = ?', [req.params.id]);

    if (!review) {
      return res.status(404).json({ error: '评价不存在' });
    }

    // 检查是否已经点赞
    const existingLike = await db.get(
      'SELECT * FROM review_likes WHERE review_id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (existingLike) {
      // 取消点赞
      await db.run(
        'DELETE FROM review_likes WHERE review_id = ? AND user_id = ?',
        [req.params.id, req.user.id]
      );
      res.json({ message: '取消点赞成功', liked: false });
    } else {
      // 点赞
      await db.run(
        'INSERT INTO review_likes (review_id, user_id) VALUES (?, ?)',
        [req.params.id, req.user.id]
      );
      res.json({ message: '点赞成功', liked: true });
    }
  } catch (error) {
    console.error('点赞操作失败:', error);
    res.status(500).json({ error: '点赞操作失败' });
  }
});

// 回复评价（需要登录）
router.post('/:id/reply', verifyToken, validateId, validateReply, async (req, res) => {
  try {
    const review = await db.get('SELECT * FROM reviews WHERE id = ?', [req.params.id]);

    if (!review) {
      return res.status(404).json({ error: '评价不存在' });
    }

    const { content } = sanitizeObject(req.body);

    const result = await db.run(
      'INSERT INTO review_replies (review_id, user_id, content) VALUES (?, ?, ?)',
      [req.params.id, req.user.id, content]
    );

    res.status(201).json({
      message: '回复成功',
      reply_id: result.id
    });
  } catch (error) {
    console.error('回复失败:', error);
    res.status(500).json({ error: '回复失败' });
  }
});

// 获取用户的评价列表（需要登录）
router.get('/user/me', verifyToken, async (req, res) => {
  try {
    const reviews = await db.query(
      `SELECT
        r.*,
        c.name as city_name,
        (SELECT COUNT(*) FROM review_likes WHERE review_id = r.id) as likes
      FROM reviews r
      JOIN cities c ON r.city_id = c.id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC`,
      [req.user.id]
    );

    // 解析images字段
    reviews.forEach(review => {
      if (review.images) {
        try {
          review.images = JSON.parse(review.images);
        } catch (e) {
          review.images = [];
        }
      } else {
        review.images = [];
      }
    });

    res.json({ reviews });
  } catch (error) {
    console.error('获取用户评价失败:', error);
    res.status(500).json({ error: '获取用户评价失败' });
  }
});

// 标记评价"有用"或"没用"（需要登录）
router.post('/:id/helpful', verifyToken, validateId, async (req, res) => {
  try {
    const review = await db.get('SELECT * FROM reviews WHERE id = ?', [req.params.id]);

    if (!review) {
      return res.status(404).json({ error: '评价不存在' });
    }

    const { is_helpful } = req.body;

    if (typeof is_helpful !== 'boolean') {
      return res.status(400).json({ error: 'is_helpful必须为布尔值' });
    }

    // 检查是否已经标记过
    const existing = await db.get(
      'SELECT * FROM review_helpful WHERE review_id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (existing) {
      // 更新标记
      await db.run(
        'UPDATE review_helpful SET is_helpful = ? WHERE review_id = ? AND user_id = ?',
        [is_helpful, req.params.id, req.user.id]
      );
    } else {
      // 新增标记
      await db.run(
        'INSERT INTO review_helpful (review_id, user_id, is_helpful) VALUES (?, ?, ?)',
        [req.params.id, req.user.id, is_helpful]
      );
    }

    // 重新计算helpful_count（只统计is_helpful=true的数量）
    const countResult = await db.get(
      'SELECT COUNT(*) as count FROM review_helpful WHERE review_id = ? AND is_helpful = 1',
      [req.params.id]
    );

    await db.run(
      'UPDATE reviews SET helpful_count = ? WHERE id = ?',
      [countResult.count, req.params.id]
    );

    res.json({
      message: '标记成功',
      helpful_count: countResult.count
    });

  } catch (error) {
    console.error('标记失败:', error);
    res.status(500).json({ error: '标记失败' });
  }
});

// 获取城市评价统计信息
router.get('/city/:cityId/stats', async (req, res) => {
  try {
    const { cityId } = req.params;

    // 获取各项统计
    const stats = {};

    // 总评价数
    const countResult = await db.get(
      'SELECT COUNT(*) as count FROM reviews WHERE city_id = ? AND status = ?',
      [cityId, 'approved']
    );
    stats.total_reviews = countResult.count;

    // 平均总分
    const avgRating = await db.get(
      'SELECT AVG(rating) as avg FROM reviews WHERE city_id = ? AND status = ?',
      [cityId, 'approved']
    );
    stats.avg_rating = avgRating.avg ? parseFloat(avgRating.avg.toFixed(1)) : 0;

    // 六维平均分
    const dimensionAvg = await db.get(`
      SELECT
        AVG(living_cost_rating) as avg_living_cost,
        AVG(air_quality_rating) as avg_air_quality,
        AVG(medical_rating) as avg_medical,
        AVG(employment_rating) as avg_employment,
        AVG(safety_rating) as avg_safety,
        AVG(elderly_care_rating) as avg_elderly_care
      FROM reviews
      WHERE city_id = ? AND status = ?
    `, [cityId, 'approved']);

    stats.dimension_avg = {
      living_cost: dimensionAvg.avg_living_cost ? parseFloat(dimensionAvg.avg_living_cost.toFixed(1)) : null,
      air_quality: dimensionAvg.avg_air_quality ? parseFloat(dimensionAvg.avg_air_quality.toFixed(1)) : null,
      medical: dimensionAvg.avg_medical ? parseFloat(dimensionAvg.avg_medical.toFixed(1)) : null,
      employment: dimensionAvg.avg_employment ? parseFloat(dimensionAvg.avg_employment.toFixed(1)) : null,
      safety: dimensionAvg.avg_safety ? parseFloat(dimensionAvg.avg_safety.toFixed(1)) : null,
      elderly_care: dimensionAvg.avg_elderly_care ? parseFloat(dimensionAvg.avg_elderly_care.toFixed(1)) : null
    };

    // 评分分布
    const distribution = await db.query(`
      SELECT rating, COUNT(*) as count
      FROM reviews
      WHERE city_id = ? AND status = ?
      GROUP BY rating
      ORDER BY rating DESC
    `, [cityId, 'approved']);

    stats.rating_distribution = distribution;

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('获取统计信息失败:', error);
    res.status(500).json({ error: '获取统计信息失败' });
  }
});

module.exports = router;
