# 中国宜居城市排行榜

一个全栈Web应用，提供中国城市宜居度评估、排名、对比和社区互动功能。

## 功能特性

### 核心功能
- 📊 **城市排行榜** - 基于多维度数据的城市综合评分排名
- 🔍 **智能搜索** - 支持城市名称和省份快速搜索
- ⚖️ **城市对比** - 多城市多维度数据可视化对比
- 📝 **用户评价** - 用户评分、评论、点赞和回复系统
- ⬆️ **上传城市** - 用户可提交城市数据（需审核）
- 📈 **数据可视化** - 基于ECharts的雷达图和对比图表

### 评估维度
- 生活成本 - 住房、交通、食品等日常开销
- 空气质量 - 污染指数和空气质量指数(AQI)
- 医疗设施 - 医院数量、医疗服务质量
- 就业机会 - 就业率、行业分布、薪资水平
- 安全指数 - 治安情况、犯罪率
- 适合养老 - 养老设施、生活便利度、环境

### 用户功能
- 🔐 用户注册和登录（JWT认证）
- 💬 发表城市评价和评论
- ❤️ 点赞和回复他人评论
- 📋 查看和管理个人评价历史
- 🏙️ 上传和分享城市数据

### 管理功能
- 👨‍💼 管理员后台
- ✅ 审核用户提交的城市和评价
- 📊 系统统计数据仪表板
- 👥 用户管理和角色分配
- 🗑️ 内容管理和删除

### 技术特性
- 🛡️ XSS攻击防护和输入验证
- 🚦 API速率限制
- 📱 完全响应式设计
- ⚡ 性能优化和懒加载
- 🔒 HTTPS就绪和安全headers
- 🔄 数据爬取功能（示例实现）
- 🔍 SEO优化 - 动态Sitemap、robots.txt、Meta标签、结构化数据

## 技术栈

### 后端
- **Node.js** - JavaScript运行时
- **Express** - Web框架
- **SQLite** - 轻量级数据库
- **JWT** - 用户认证
- **bcryptjs** - 密码加密
- **Helmet** - 安全中间件
- **express-validator** - 输入验证
- **Cheerio** - 网页爬取

### 前端
- **HTML5** - 语义化标记
- **CSS3** - 现代样式和响应式设计
- **Vanilla JavaScript** - 原生JavaScript
- **ECharts** - 数据可视化
- **Fetch API** - HTTP请求

## 快速开始

### 环境要求
- Node.js >= 14.0.0
- npm >= 6.0.0

### 安装步骤

1. 克隆项目
```bash
git clone <repository-url>
cd ClaudeTest
```

2. 安装依赖
```bash
npm install
```

3. 配置环境变量
```bash
cp .env.example .env
# 编辑.env文件，修改必要的配置
```

4. 初始化数据库
```bash
npm run init-db
```

5. 启动开发服务器
```bash
npm run dev
```

6. 访问应用
```
打开浏览器访问: http://localhost:3000
```

### 生产部署

1. 设置环境变量
```bash
export NODE_ENV=production
export JWT_SECRET=your-secure-secret-key
```

2. 启动生产服务器
```bash
npm start
```

## 项目结构

```
ClaudeTest/
├── server/                 # 后端代码
│   ├── models/            # 数据库模型
│   │   └── database.js
│   ├── routes/            # API路由
│   │   ├── auth.js
│   │   ├── cities.js
│   │   ├── reviews.js
│   │   └── admin.js
│   ├── middleware/        # 中间件
│   │   ├── auth.js
│   │   └── validator.js
│   └── utils/             # 工具函数
│       ├── sanitize.js
│       ├── crawler.js
│       └── initDatabase.js
├── public/                # 前端静态文件
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── api.js
│   │   ├── auth.js
│   │   └── app.js
│   └── index.html
├── config/                # 配置文件
├── server.js             # 主服务器文件
├── package.json
├── .env                  # 环境变量
└── README.md
```

## API文档

### 认证相关

#### 注册用户
```
POST /api/auth/register
Content-Type: application/json

{
  "username": "user123",
  "email": "user@example.com",
  "password": "password123"
}
```

#### 用户登录
```
POST /api/auth/login
Content-Type: application/json

{
  "username": "user123",
  "password": "password123"
}
```

### 城市相关

#### 获取城市列表
```
GET /api/cities?page=1&limit=20&sort=overall_score&order=DESC&search=北京
```

#### 获取城市详情
```
GET /api/cities/:id
```

#### 创建城市（需登录）
```
POST /api/cities
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "城市名称",
  "province": "省份",
  "population": 1000000,
  "gdp": 5000,
  "area": 1000,
  "dimensions": {
    "living_cost": 7.5,
    "air_quality": 8.0,
    ...
  }
}
```

#### 城市对比
```
POST /api/cities/compare
Content-Type: application/json

{
  "city_ids": [1, 2, 3]
}
```

### 评价相关

#### 获取城市评价
```
GET /api/reviews/city/:cityId?page=1&limit=10&sort=created_at
```

#### 发表评价（需登录）
```
POST /api/reviews
Authorization: Bearer <token>
Content-Type: application/json

{
  "city_id": 1,
  "rating": 4.5,
  "comment": "这是一个很好的城市"
}
```

#### 点赞评价（需登录）
```
POST /api/reviews/:id/like
Authorization: Bearer <token>
```

#### 回复评价（需登录）
```
POST /api/reviews/:id/reply
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "我同意你的观点"
}
```

### 管理员相关（需管理员权限）

#### 获取统计数据
```
GET /api/admin/stats
Authorization: Bearer <token>
```

#### 审核城市
```
PUT /api/admin/cities/:id/review
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "approved" | "rejected"
}
```

## 默认管理员账户

初始化数据库后，系统会创建默认管理员账户：

- 用户名: `admin`
- 密码: `admin123`
- 邮箱: `admin@example.com`

⚠️ **重要**: 请在生产环境中立即修改默认密码！

## 数据爬取

项目包含一个示例数据爬取模块(`server/utils/crawler.js`)，可以从第三方网站获取城市排名数据。

### 使用说明

1. 根据目标网站的HTML结构修改解析逻辑
2. 遵守目标网站的robots.txt规则
3. 设置合理的请求间隔，避免过度请求
4. 确保符合相关法律法规

### 示例代码
```javascript
const crawler = require('./server/utils/crawler');

// 爬取并更新数据
crawler.crawlAndUpdate('https://example.com/city-rankings')
  .then(result => {
    console.log(`成功更新 ${result.updated} 个城市`);
  });
```

## 安全建议

### 生产环境部署前

1. **修改JWT密钥**
   ```bash
   # 生成强随机密钥
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **修改管理员密码**
   - 首次登录后立即在管理后台修改

3. **配置HTTPS**
   - 使用Let's Encrypt免费SSL证书
   - 配置Nginx反向代理

4. **配置CORS**
   - 限制允许的源域名
   ```bash
   CORS_ORIGIN=https://yourdomain.com
   ```

5. **数据库备份**
   - 定期备份SQLite数据库文件
   ```bash
   cp database.sqlite database.backup.sqlite
   ```

6. **限制文件上传**
   - 如需文件上传功能，添加文件类型和大小限制

7. **监控和日志**
   - 配置应用日志
   - 监控异常请求

## 性能优化

### 已实现的优化
- ✅ 静态资源压缩
- ✅ 数据库查询优化
- ✅ API速率限制
- ✅ 客户端缓存策略
- ✅ 响应式图片加载
- ✅ 懒加载技术

### 进一步优化建议
- 使用CDN加速静态资源
- 配置Redis缓存
- 数据库连接池
- 图片压缩和优化
- Gzip压缩
- 服务端渲染(SSR)

## 浏览器兼容性

支持所有现代浏览器：
- Chrome/Edge (最新版)
- Firefox (最新版)
- Safari (最新版)
- Opera (最新版)

## 常见问题

### 1. 数据库连接失败
确保已运行`npm run init-db`初始化数据库。

### 2. 端口被占用
修改`.env`文件中的`PORT`配置。

### 3. JWT令牌过期
默认令牌有效期为7天，可在`.env`中修改`JWT_EXPIRE`。

### 4. 跨域问题
检查`.env`中的`CORS_ORIGIN`配置。

## 开发路线图

- [ ] 移动端App开发
- [ ] 微信小程序版本
- [ ] 数据导出功能
- [ ] 高级数据分析
- [ ] 城市推荐算法
- [ ] 社交分享功能
- [ ] 多语言支持
- [ ] 深色模式

## 贡献指南

欢迎提交Issue和Pull Request！

1. Fork项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启Pull Request

## 许可证

MIT License

## 联系方式

如有问题或建议，请通过Issue联系我们。

## 致谢

- [Express](https://expressjs.com/) - Web框架
- [ECharts](https://echarts.apache.org/) - 数据可视化
- [SQLite](https://www.sqlite.org/) - 数据库
- 所有贡献者和用户

---

**注意**: 本项目仅供学习和参考使用，数据仅为示例数据。实际使用时请替换为真实、可靠的数据源。
