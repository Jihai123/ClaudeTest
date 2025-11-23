const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { verifyToken, optionalAuth } = require('../middleware/auth');
const { validateReview, validateReply, validateId } = require('../middleware/validator');
const { sanitizeObject } = require('../utils/sanitize');

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
    const { city_id, rating, comment } = sanitizeObject(req.body);

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
    const result = await db.run(
      'INSERT INTO reviews (city_id, user_id, rating, comment) VALUES (?, ?, ?, ?)',
      [city_id, req.user.id, rating, comment || null]
    );

    res.status(201).json({
      message: '评价提交成功',
      review_id: result.id
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

    const { rating, comment } = sanitizeObject(req.body);

    await db.run(
      'UPDATE reviews SET rating = ?, comment = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [rating, comment || null, req.params.id]
    );

    res.json({ message: '评价更新成功' });
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

    await db.run('DELETE FROM reviews WHERE id = ?', [req.params.id]);

    res.json({ message: '评价删除成功' });
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

    res.json({ reviews });
  } catch (error) {
    console.error('获取用户评价失败:', error);
    res.status(500).json({ error: '获取用户评价失败' });
  }
});

module.exports = router;
