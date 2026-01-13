const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const { validateId } = require('../middleware/validator');
const { deleteFromR2, batchDeleteFromR2 } = require('../utils/r2Utils');

// 所有管理员路由都需要管理员权限
router.use(verifyToken, verifyAdmin);

// 获取待审核的城市列表
router.get('/cities/pending', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

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
        cd.actual_level,
        u.username as submitted_by
      FROM cities c
      LEFT JOIN city_dimensions cd ON c.id = cd.city_id
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.status = 'pending'
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?`,
      [parseInt(limit), parseInt(offset)]
    );

    const { total } = await db.get(
      "SELECT COUNT(*) as total FROM cities WHERE status = 'pending'"
    );

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
    console.error('获取待审核城市失败:', error);
    res.status(500).json({ error: '获取待审核城市失败' });
  }
});

// 审核城市（通过或拒绝）
router.put('/cities/:id/review', validateId, async (req, res) => {
  try {
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: '无效的审核状态' });
    }

    const city = await db.get('SELECT * FROM cities WHERE id = ?', [req.params.id]);

    if (!city) {
      return res.status(404).json({ error: '城市不存在' });
    }

    await db.run(
      'UPDATE cities SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, req.params.id]
    );

    res.json({
      message: status === 'approved' ? '城市已通过审核' : '城市已被拒绝',
      city_id: req.params.id
    });
  } catch (error) {
    console.error('审核城市失败:', error);
    res.status(500).json({ error: '审核城市失败' });
  }
});

// 删除城市
router.delete('/cities/:id', validateId, async (req, res) => {
  try {
    const city = await db.get('SELECT * FROM cities WHERE id = ?', [req.params.id]);

    if (!city) {
      return res.status(404).json({ error: '城市不存在' });
    }

    await db.run('DELETE FROM cities WHERE id = ?', [req.params.id]);

    res.json({ message: '城市删除成功' });
  } catch (error) {
    console.error('删除城市失败:', error);
    res.status(500).json({ error: '删除城市失败' });
  }
});

// 获取待审核的评价列表
router.get('/reviews/pending', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const reviews = await db.query(
      `SELECT
        r.*,
        u.username,
        c.name as city_name
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      JOIN cities c ON r.city_id = c.id
      WHERE r.status = 'pending'
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?`,
      [parseInt(limit), parseInt(offset)]
    );

    const { total } = await db.get(
      "SELECT COUNT(*) as total FROM reviews WHERE status = 'pending'"
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
    console.error('获取待审核评价失败:', error);
    res.status(500).json({ error: '获取待审核评价失败' });
  }
});

// 审核评价
router.put('/reviews/:id/review', validateId, async (req, res) => {
  try {
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: '无效的审核状态' });
    }

    const review = await db.get('SELECT * FROM reviews WHERE id = ?', [req.params.id]);

    if (!review) {
      return res.status(404).json({ error: '评价不存在' });
    }

    await db.run(
      'UPDATE reviews SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, req.params.id]
    );

    res.json({
      message: status === 'approved' ? '评价已通过审核' : '评价已被拒绝',
      review_id: req.params.id
    });
  } catch (error) {
    console.error('审核评价失败:', error);
    res.status(500).json({ error: '审核评价失败' });
  }
});

// 删除评价/评论
router.delete('/reviews/:id', validateId, async (req, res) => {
  try {
    const review = await db.get('SELECT * FROM reviews WHERE id = ?', [req.params.id]);

    if (!review) {
      return res.status(404).json({ error: '评价不存在' });
    }

    // 同时删除相关的回复和点赞
    await db.run('DELETE FROM review_replies WHERE review_id = ?', [req.params.id]);
    await db.run('DELETE FROM review_likes WHERE review_id = ?', [req.params.id]);
    await db.run('DELETE FROM reviews WHERE id = ?', [req.params.id]);

    res.json({ message: '评价删除成功' });
  } catch (error) {
    console.error('删除评价失败:', error);
    res.status(500).json({ error: '删除评价失败' });
  }
});

// 获取统计信息
router.get('/stats', async (req, res) => {
  try {
    const stats = {};

    // 城市统计
    stats.cities = await db.get(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM cities
    `);

    // 用户统计
    stats.users = await db.get(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins,
        SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as users
      FROM users
    `);

    // 评价统计
    stats.reviews = await db.get(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        AVG(rating) as avg_rating
      FROM reviews
    `);

    // 最近活动
    const recentCities = await db.query(`
      SELECT name, created_at, status
      FROM cities
      ORDER BY created_at DESC
      LIMIT 5
    `);

    const recentReviews = await db.query(`
      SELECT r.rating, r.created_at, c.name as city_name, u.username
      FROM reviews r
      JOIN cities c ON r.city_id = c.id
      JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC
      LIMIT 5
    `);

    stats.recent_activity = {
      cities: recentCities,
      reviews: recentReviews
    };

    res.json(stats);
  } catch (error) {
    console.error('获取统计信息失败:', error);
    res.status(500).json({ error: '获取统计信息失败' });
  }
});

// 获取所有用户列表
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const users = await db.query(
      `SELECT
        u.id,
        u.username,
        u.email,
        u.role,
        u.created_at,
        COUNT(DISTINCT c.id) as cities_count,
        COUNT(DISTINCT r.id) as reviews_count
      FROM users u
      LEFT JOIN cities c ON u.id = c.user_id
      LEFT JOIN reviews r ON u.id = r.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?`,
      [parseInt(limit), parseInt(offset)]
    );

    const { total } = await db.get('SELECT COUNT(*) as total FROM users');

    res.json({
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// 更新用户角色
router.put('/users/:id/role', validateId, async (req, res) => {
  try {
    const { role } = req.body;

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: '无效的角色' });
    }

    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    await db.run(
      'UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [role, req.params.id]
    );

    res.json({ message: '用户角色更新成功' });
  } catch (error) {
    console.error('更新用户角色失败:', error);
    res.status(500).json({ error: '更新用户角色失败' });
  }
});

// ==================== 图片管理接口 ====================

// 获取所有图片列表（支持筛选）
router.get('/images', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, city_id } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params = [];

    if (status) {
      whereClause += ' AND ci.status = ?';
      params.push(status);
    }

    if (city_id) {
      whereClause += ' AND ci.city_id = ?';
      params.push(city_id);
    }

    const images = await db.query(
      `SELECT
        ci.*,
        c.name as city_name,
        u.username as uploader_name
      FROM city_images ci
      LEFT JOIN cities c ON ci.city_id = c.id
      LEFT JOIN users u ON ci.uploader_id = u.id
      WHERE ${whereClause}
      ORDER BY ci.created_at DESC
      LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const { total } = await db.get(
      `SELECT COUNT(*) as total FROM city_images ci WHERE ${whereClause}`,
      params
    );

    res.json({
      images,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('获取图片列表失败:', error);
    res.status(500).json({ error: '获取图片列表失败' });
  }
});

// 获取待审核的图片列表
router.get('/images/pending', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const images = await db.query(
      `SELECT
        ci.*,
        c.name as city_name,
        u.username as uploader_name
      FROM city_images ci
      LEFT JOIN cities c ON ci.city_id = c.id
      LEFT JOIN users u ON ci.uploader_id = u.id
      WHERE ci.status = 'pending'
      ORDER BY ci.created_at DESC
      LIMIT ? OFFSET ?`,
      [parseInt(limit), parseInt(offset)]
    );

    const { total } = await db.get(
      "SELECT COUNT(*) as total FROM city_images WHERE status = 'pending'"
    );

    res.json({
      images,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('获取待审核图片失败:', error);
    res.status(500).json({ error: '获取待审核图片失败' });
  }
});

// 审核图片（通过或拒绝）
router.put('/images/:id/review', validateId, async (req, res) => {
  try {
    const { status, rejection_reason } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: '无效的审核状态' });
    }

    const image = await db.get('SELECT * FROM city_images WHERE id = ?', [req.params.id]);

    if (!image) {
      return res.status(404).json({ error: '图片不存在' });
    }

    await db.run(
      `UPDATE city_images SET
        status = ?,
        rejection_reason = ?,
        reviewer_id = ?,
        reviewed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [status, rejection_reason || null, req.user.id, req.params.id]
    );

    res.json({
      message: status === 'approved' ? '图片已通过审核' : '图片已被拒绝',
      image_id: req.params.id
    });
  } catch (error) {
    console.error('审核图片失败:', error);
    res.status(500).json({ error: '审核图片失败' });
  }
});

// 删除图片
router.delete('/images/:id', validateId, async (req, res) => {
  try {
    const image = await db.get('SELECT * FROM city_images WHERE id = ?', [req.params.id]);

    if (!image) {
      return res.status(404).json({ error: '图片不存在' });
    }

    // 先删除 R2 存储中的文件（如果是 R2 图片）
    if (image.image_url) {
      await deleteFromR2(image.image_url);
    }
    if (image.thumbnail_url && image.thumbnail_url !== image.image_url) {
      await deleteFromR2(image.thumbnail_url);
    }

    // 再删除数据库记录
    await db.run('DELETE FROM city_images WHERE id = ?', [req.params.id]);

    res.json({ message: '图片删除成功' });
  } catch (error) {
    console.error('删除图片失败:', error);
    res.status(500).json({ error: '删除图片失败' });
  }
});

// 批量删除图片
router.post('/images/batch-delete', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: '请提供要删除的图片ID列表' });
    }

    // 先获取所有要删除的图片信息
    const placeholders = ids.map(() => '?').join(',');
    const images = await db.query(
      `SELECT id, image_url, thumbnail_url FROM city_images WHERE id IN (${placeholders})`,
      ids
    );

    // 收集所有需要删除的 R2 文件 URL
    const urlsToDelete = [];
    for (const img of images) {
      if (img.image_url) {
        urlsToDelete.push(img.image_url);
      }
      if (img.thumbnail_url && img.thumbnail_url !== img.image_url) {
        urlsToDelete.push(img.thumbnail_url);
      }
    }

    // 批量删除 R2 文件
    if (urlsToDelete.length > 0) {
      await batchDeleteFromR2(urlsToDelete);
    }

    // 删除数据库记录
    await db.run(
      `DELETE FROM city_images WHERE id IN (${placeholders})`,
      ids
    );

    res.json({ message: `成功删除 ${ids.length} 张图片` });
  } catch (error) {
    console.error('批量删除图片失败:', error);
    res.status(500).json({ error: '批量删除图片失败' });
  }
});

// 批量审核图片
router.post('/images/batch-review', async (req, res) => {
  try {
    const { ids, status } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: '请提供要审核的图片ID列表' });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: '无效的审核状态' });
    }

    const placeholders = ids.map(() => '?').join(',');
    await db.run(
      `UPDATE city_images SET
        status = ?,
        reviewer_id = ?,
        reviewed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders})`,
      [status, req.user.id, ...ids]
    );

    res.json({ message: `成功${status === 'approved' ? '通过' : '拒绝'} ${ids.length} 张图片` });
  } catch (error) {
    console.error('批量审核图片失败:', error);
    res.status(500).json({ error: '批量审核图片失败' });
  }
});

// 检查并清理 404 图片
router.post('/images/cleanup-404', async (req, res) => {
  try {
    const { dryRun = true, limit = 0 } = req.body;

    // 获取所有图片
    let query = `
      SELECT id, city_id, image_url, alt_text
      FROM city_images
      ORDER BY id
    `;
    if (limit > 0) {
      query += ` LIMIT ${parseInt(limit)}`;
    }

    const images = await db.query(query);

    if (images.length === 0) {
      return res.json({
        message: '没有图片需要检查',
        total: 0,
        valid: 0,
        notFound: 0,
        errors: 0,
        deleted: 0
      });
    }

    // 检查每个图片 URL
    const notFoundIds = [];
    const errorImages = [];
    let validCount = 0;
    const BATCH_SIZE = 10;

    for (let i = 0; i < images.length; i += BATCH_SIZE) {
      const batch = images.slice(i, i + BATCH_SIZE);
      const checks = await Promise.all(
        batch.map(async (img) => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            // 使用 GET + Range 请求
            const response = await fetch(img.image_url, {
              method: 'GET',
              headers: { 'Range': 'bytes=0-0' },
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.status === 404) {
              return { id: img.id, status: 404 };
            }
            if (response.status === 200 || response.status === 206 || response.status === 304) {
              return { id: img.id, status: 'valid' };
            }
            return { id: img.id, status: response.status, url: img.image_url };
          } catch (error) {
            return {
              id: img.id,
              status: 'ERROR',
              error: error.code || error.message?.substring(0, 50),
              url: img.image_url
            };
          }
        })
      );

      for (const result of checks) {
        if (result.status === 404) {
          notFoundIds.push(result.id);
        } else if (result.status === 'valid') {
          validCount++;
        } else {
          errorImages.push(result);
        }
      }
    }

    let deleted = 0;

    // 如果不是 dry run，执行删除 404 图片
    if (!dryRun && notFoundIds.length > 0) {
      const placeholders = notFoundIds.map(() => '?').join(',');
      const imagesToDelete = await db.query(
        `SELECT id, image_url, thumbnail_url FROM city_images WHERE id IN (${placeholders})`,
        notFoundIds
      );

      const urlsToDelete = [];
      for (const img of imagesToDelete) {
        if (img.image_url) urlsToDelete.push(img.image_url);
        if (img.thumbnail_url && img.thumbnail_url !== img.image_url) {
          urlsToDelete.push(img.thumbnail_url);
        }
      }

      if (urlsToDelete.length > 0) {
        await batchDeleteFromR2(urlsToDelete);
      }

      await db.run(
        `DELETE FROM city_images WHERE id IN (${placeholders})`,
        notFoundIds
      );

      deleted = notFoundIds.length;
    }

    res.json({
      message: dryRun ? '检查完成（未删除）' : '清理完成',
      total: images.length,
      valid: validCount,
      notFound: notFoundIds.length,
      errors: errorImages.length,
      deleted: deleted,
      notFoundIds: dryRun ? notFoundIds.slice(0, 100) : undefined,
      errorSamples: errorImages.slice(0, 10)
    });

  } catch (error) {
    console.error('清理 404 图片失败:', error);
    res.status(500).json({ error: '清理 404 图片失败' });
  }
});

module.exports = router;
