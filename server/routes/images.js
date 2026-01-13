const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { verifyToken, optionalAuth } = require('../middleware/auth');
const { validateId } = require('../middleware/validator');
const { deleteFromR2 } = require('../utils/r2Utils');

// 获取城市图片列表
router.get('/city/:cityId', async (req, res) => {
  try {
    const { type, limit = 20, status = 'approved' } = req.query;

    let whereClause = 'WHERE city_id = ? AND status = ?';
    let params = [req.params.cityId, status];

    if (type) {
      whereClause += ' AND image_type = ?';
      params.push(type);
    }

    const images = await db.query(
      `SELECT
        ci.*,
        u.username as uploader_name
      FROM city_images ci
      LEFT JOIN users u ON ci.uploader_id = u.id
      ${whereClause}
      ORDER BY ci.weight DESC, ci.likes_count DESC, ci.created_at DESC
      LIMIT ?`,
      [...params, parseInt(limit)]
    );

    res.json({ images });
  } catch (error) {
    console.error('获取城市图片失败:', error);
    res.status(500).json({ error: '获取城市图片失败' });
  }
});

// 上传图片 (需要登录)
router.post('/upload', verifyToken, async (req, res) => {
  try {
    const {
      city_id,
      image_url,
      thumbnail_url,
      alt_text,
      image_type = 'user',
      tags,
      season
    } = req.body;

    if (!city_id || !image_url) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 检查城市是否存在
    const city = await db.get('SELECT id FROM cities WHERE id = ?', [city_id]);
    if (!city) {
      return res.status(404).json({ error: '城市不存在' });
    }

    // 插入图片记录
    const result = await db.run(
      `INSERT INTO city_images (
        city_id, image_url, thumbnail_url, alt_text, image_type,
        tags, uploader_id, weight, status, season
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        city_id,
        image_url,
        thumbnail_url || image_url,
        alt_text || '',
        image_type,
        JSON.stringify(tags || []),
        req.user.id,
        image_type === 'user' ? 30 : 10, // 默认权重
        'approved', // MVP版本自动通过
        season || null
      ]
    );

    // 更新用户上传计数
    await db.run(
      'UPDATE users SET images_count = images_count + 1 WHERE id = ?',
      [req.user.id]
    );

    res.status(201).json({
      message: '图片上传成功',
      image_id: result.id
    });
  } catch (error) {
    console.error('上传图片失败:', error);
    res.status(500).json({ error: '上传图片失败' });
  }
});

// 获取图片详情
router.get('/:id', validateId, async (req, res) => {
  try {
    const image = await db.get(
      `SELECT
        ci.*,
        u.username as uploader_name,
        c.name as city_name
      FROM city_images ci
      LEFT JOIN users u ON ci.uploader_id = u.id
      LEFT JOIN cities c ON ci.city_id = c.id
      WHERE ci.id = ?`,
      [req.params.id]
    );

    if (!image) {
      return res.status(404).json({ error: '图片不存在' });
    }

    // 增加浏览次数
    await db.run(
      'UPDATE city_images SET views_count = views_count + 1 WHERE id = ?',
      [req.params.id]
    );

    res.json(image);
  } catch (error) {
    console.error('获取图片详情失败:', error);
    res.status(500).json({ error: '获取图片详情失败' });
  }
});

// 图片点赞
router.post('/:id/like', verifyToken, validateId, async (req, res) => {
  try {
    const image = await db.get('SELECT id FROM city_images WHERE id = ?', [req.params.id]);

    if (!image) {
      return res.status(404).json({ error: '图片不存在' });
    }

    // 增加点赞数
    await db.run(
      'UPDATE city_images SET likes_count = likes_count + 1 WHERE id = ?',
      [req.params.id]
    );

    res.json({ message: '点赞成功' });
  } catch (error) {
    console.error('点赞失败:', error);
    res.status(500).json({ error: '点赞失败' });
  }
});

// 删除图片 (需要是上传者或管理员)
router.delete('/:id', verifyToken, validateId, async (req, res) => {
  try {
    const image = await db.get('SELECT * FROM city_images WHERE id = ?', [req.params.id]);

    if (!image) {
      return res.status(404).json({ error: '图片不存在' });
    }

    // 只有管理员或上传者可以删除
    if (req.user.role !== 'admin' && image.uploader_id !== req.user.id) {
      return res.status(403).json({ error: '无权限删除此图片' });
    }

    // 先删除 R2 存储中的文件（如果是 R2 图片）
    if (image.image_url) {
      await deleteFromR2(image.image_url);
    }
    if (image.thumbnail_url && image.thumbnail_url !== image.image_url) {
      await deleteFromR2(image.thumbnail_url);
    }

    // 删除数据库记录
    await db.run('DELETE FROM city_images WHERE id = ?', [req.params.id]);

    // 更新用户上传计数
    if (image.uploader_id) {
      await db.run(
        'UPDATE users SET images_count = images_count - 1 WHERE id = ?',
        [image.uploader_id]
      );
    }

    res.json({ message: '图片已删除' });
  } catch (error) {
    console.error('删除图片失败:', error);
    res.status(500).json({ error: '删除图片失败' });
  }
});

// 获取精选图片 (用于首页展示)
router.get('/featured/list', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const images = await db.query(
      `SELECT
        ci.*,
        c.name as city_name,
        c.province,
        u.username as uploader_name
      FROM city_images ci
      LEFT JOIN cities c ON ci.city_id = c.id
      LEFT JOIN users u ON ci.uploader_id = u.id
      WHERE ci.is_featured = 1 AND ci.status = 'approved'
      ORDER BY ci.weight DESC, ci.created_at DESC
      LIMIT ?`,
      [parseInt(limit)]
    );

    res.json({ images });
  } catch (error) {
    console.error('获取精选图片失败:', error);
    res.status(500).json({ error: '获取精选图片失败' });
  }
});

module.exports = router;
