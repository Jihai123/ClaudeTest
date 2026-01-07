const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../models/database');
const { validateRegister, validateLogin } = require('../middleware/validator');
const { sanitizeObject } = require('../utils/sanitize');

// 生成JWT令牌
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// 用户注册
router.post('/register', validateRegister, async (req, res) => {
  try {
    const { username, email, password } = sanitizeObject(req.body);

    // 检查用户名是否已存在
    const existingUser = await db.get(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existingUser) {
      return res.status(400).json({ error: '用户名或邮箱已被注册' });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户
    const result = await db.run(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword]
    );

    const user = {
      id: result.id,
      username,
      email,
      role: 'user'
    };

    const token = generateToken(user);

    res.status(201).json({
      message: '注册成功',
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
      token
    });
  } catch (error) {
    console.error('注册失败:', error);
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

// 微信小程序登录
router.post('/wechat-login', async (req, res) => {
  try {
    const { code, userInfo } = req.body;

    if (!code) {
      return res.status(400).json({ error: '缺少登录凭证' });
    }

    // 调用微信接口获取openid
    // 注意：实际生产环境需要配置 WECHAT_APPID 和 WECHAT_SECRET
    const appid = process.env.WECHAT_APPID;
    const secret = process.env.WECHAT_SECRET;

    let openid;

    if (appid && secret) {
      // 生产环境：调用微信接口
      const https = require('https');
      const wxUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;

      const wxRes = await new Promise((resolve, reject) => {
        https.get(wxUrl, (response) => {
          let data = '';
          response.on('data', chunk => data += chunk);
          response.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
      });

      if (wxRes.errcode) {
        return res.status(400).json({ error: '微信登录失败: ' + wxRes.errmsg });
      }

      openid = wxRes.openid;
    } else {
      // 开发环境：使用code作为模拟openid
      openid = 'wx_' + code.substring(0, 20);
    }

    // 查找或创建用户
    let user = await db.get('SELECT * FROM users WHERE wechat_openid = ?', [openid]);

    if (!user) {
      // 创建新用户
      const nickname = userInfo?.nickName || '微信用户' + openid.substring(0, 6);
      const avatar = userInfo?.avatarUrl || '';

      const result = await db.run(
        'INSERT INTO users (username, wechat_openid, avatar, role) VALUES (?, ?, ?, ?)',
        [nickname, openid, avatar, 'user']
      );

      user = {
        id: result.id,
        username: nickname,
        wechat_openid: openid,
        avatar,
        role: 'user'
      };
    }

    const token = generateToken(user);

    res.json({
      message: '登录成功',
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        role: user.role
      },
      token
    });
  } catch (error) {
    console.error('微信登录失败:', error);
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

// 用户登录
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { username, password } = req.body;

    // 查找用户
    const user = await db.get(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, username]
    );

    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = generateToken(user);

    res.json({
      message: '登录成功',
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
      token
    });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

module.exports = router;
