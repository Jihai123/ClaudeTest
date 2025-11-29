require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const db = require('./server/models/database');

// 创建Express应用
const app = express();

// 安全中间件
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  }
}));

// CORS配置
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// 速率限制
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: '请求过于频繁，请稍后再试'
});

// 基础路径配置（支持 nginx 代理环境）
const BASE_PATH = process.env.BASE_PATH || '';

app.use(`${BASE_PATH}/api/`, limiter);

// 解析JSON和URL编码数据
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件服务
app.use(BASE_PATH || '/', express.static(path.join(__dirname, 'public')));

// API路由
app.use(`${BASE_PATH}/api/auth`, require('./server/routes/auth'));
app.use(`${BASE_PATH}/api/cities`, require('./server/routes/cities'));
app.use(`${BASE_PATH}/api/reviews`, require('./server/routes/reviews'));
app.use(`${BASE_PATH}/api/admin`, require('./server/routes/admin'));
app.use(`${BASE_PATH}/api/images`, require('./server/routes/images'));
app.use(`${BASE_PATH}/api/tags`, require('./server/routes/tags'));
app.use(`${BASE_PATH}/api/rankings`, require('./server/routes/rankings'));

// 健康检查
app.get(`${BASE_PATH}/api/health`, (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404处理
app.use(`${BASE_PATH}/api/*`, (req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// 前端路由支持 - 所有非API请求返回index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? '服务器内部错误'
      : err.message
  });
});

// 启动服务器
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // 初始化数据库
    await db.init();
    console.log('数据库初始化成功');

    app.listen(PORT, () => {
      console.log(`服务器运行在 http://localhost:${PORT}`);
      console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('服务器启动失败:', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('收到SIGTERM信号，准备关闭服务器...');
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n收到SIGINT信号，准备关闭服务器...');
  await db.close();
  process.exit(0);
});

startServer();
