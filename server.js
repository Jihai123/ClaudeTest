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

app.use('/livablecities/api/', limiter);

// 解析JSON和URL编码数据
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件服务 - 在 /livablecities 路径下提供服务
app.use('/livablecities', express.static(path.join(__dirname, 'public')));

// API路由
app.use('/livablecities/api/auth', require('./server/routes/auth'));
app.use('/livablecities/api/cities', require('./server/routes/cities'));
app.use('/livablecities/api/reviews', require('./server/routes/reviews'));
app.use('/livablecities/api/admin', require('./server/routes/admin'));

// 健康检查
app.get('/livablecities/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404处理
app.use('/livablecities/api/*', (req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// /livablecities 路径的前端路由支持
app.get('/livablecities*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 根路径重定向到 /livablecities
app.get('/', (req, res) => {
  res.redirect('/livablecities/');
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
