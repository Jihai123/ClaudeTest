const express = require('express');
const router = express.Router();
const db = require('../models/database');

// 获取所有榜单
router.get('/', async (req, res) => {
  try {
    const rankings = await db.query(
      'SELECT * FROM ranking_lists WHERE is_active = 1 ORDER BY sort_order ASC'
    );

    res.json({ rankings });
  } catch (error) {
    console.error('获取榜单列表失败:', error);
    res.status(500).json({ error: '获取榜单列表失败' });
  }
});

// 获取榜单详情
router.get('/:list_key', async (req, res) => {
  try {
    const ranking = await db.get(
      'SELECT * FROM ranking_lists WHERE list_key = ?',
      [req.params.list_key]
    );

    if (!ranking) {
      return res.status(404).json({ error: '榜单不存在' });
    }

    res.json(ranking);
  } catch (error) {
    console.error('获取榜单详情失败:', error);
    res.status(500).json({ error: '获取榜单详情失败' });
  }
});

module.exports = router;
