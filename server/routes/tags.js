const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { verifyToken } = require('../middleware/auth');
const { validateId } = require('../middleware/validator');

// 标签定义
const TAG_DEFINITIONS = {
  seaside: { name: '🏖️ 看海小城', icon: '🏖️' },
  mountain: { name: '🏔️ 山居小城', icon: '🏔️' },
  low_rent: { name: '💰 超低房租', icon: '💰' },
  spring_climate: { name: '🌡️ 四季如春', icon: '🌡️' },
  medical_complete: { name: '🏥 医疗完善', icon: '🏥' },
  quiet: { name: '🤫 极度安静', icon: '🤫' },
  elderly_friendly: { name: '👴 养老天堂', icon: '👴' },
  digital_nomad: { name: '💻 数字游民友好', icon: '💻' },
  lake: { name: '🌊 临湖', icon: '🌊' },
  forest: { name: '🌳 森林', icon: '🌳' }
};

// 获取城市标签
router.get('/city/:cityId', async (req, res) => {
  try {
    const tags = await db.query(
      `SELECT * FROM city_tags
       WHERE city_id = ?
       ORDER BY is_primary DESC, created_at ASC`,
      [req.params.cityId]
    );

    res.json({ tags });
  } catch (error) {
    console.error('获取城市标签失败:', error);
    res.status(500).json({ error: '获取城市标签失败' });
  }
});

// 为城市添加标签 (需要登录)
router.post('/city/:cityId', verifyToken, async (req, res) => {
  try {
    const { tag_key, is_primary } = req.body;

    if (!tag_key || !TAG_DEFINITIONS[tag_key]) {
      return res.status(400).json({ error: '无效的标签' });
    }

    // 检查城市是否存在
    const city = await db.get('SELECT id FROM cities WHERE id = ?', [req.params.cityId]);
    if (!city) {
      return res.status(404).json({ error: '城市不存在' });
    }

    // 检查标签是否已存在
    const existingTag = await db.get(
      'SELECT id FROM city_tags WHERE city_id = ? AND tag_key = ?',
      [req.params.cityId, tag_key]
    );

    if (existingTag) {
      return res.status(400).json({ error: '该标签已存在' });
    }

    // 添加标签
    const tagDef = TAG_DEFINITIONS[tag_key];
    await db.run(
      `INSERT INTO city_tags (city_id, tag_key, tag_name, tag_icon, is_primary)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.cityId, tag_key, tagDef.name, tagDef.icon, is_primary || 0]
    );

    res.status(201).json({ message: '标签添加成功' });
  } catch (error) {
    console.error('添加标签失败:', error);
    res.status(500).json({ error: '添加标签失败' });
  }
});

// 删除城市标签 (需要登录)
router.delete('/:id', verifyToken, validateId, async (req, res) => {
  try {
    const tag = await db.get('SELECT * FROM city_tags WHERE id = ?', [req.params.id]);

    if (!tag) {
      return res.status(404).json({ error: '标签不存在' });
    }

    await db.run('DELETE FROM city_tags WHERE id = ?', [req.params.id]);

    res.json({ message: '标签已删除' });
  } catch (error) {
    console.error('删除标签失败:', error);
    res.status(500).json({ error: '删除标签失败' });
  }
});

// 获取所有可用标签
router.get('/definitions', (req, res) => {
  res.json({ tags: TAG_DEFINITIONS });
});

// 根据标签筛选城市
router.get('/filter', async (req, res) => {
  try {
    const { tags } = req.query; // 逗号分隔的标签keys

    if (!tags) {
      return res.status(400).json({ error: '请提供标签' });
    }

    const tagKeys = tags.split(',');
    const placeholders = tagKeys.map(() => '?').join(',');

    const cities = await db.query(
      `SELECT DISTINCT c.*, COUNT(ct.id) as matched_tags
       FROM cities c
       INNER JOIN city_tags ct ON c.id = ct.city_id
       WHERE ct.tag_key IN (${placeholders}) AND c.status = 'approved'
       GROUP BY c.id
       HAVING matched_tags = ?
       ORDER BY c.layflat_score DESC`,
      [...tagKeys, tagKeys.length]
    );

    res.json({ cities });
  } catch (error) {
    console.error('标签筛选失败:', error);
    res.status(500).json({ error: '标签筛选失败' });
  }
});

module.exports = router;
