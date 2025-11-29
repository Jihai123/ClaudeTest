# 宜居城市排行榜 MVP 功能说明

## 📋 MVP 功能清单

### ✅ 已完成功能

#### 1. 数据库扩展
- ✅ 扩展 `cities` 表，添加躺平榜相关字段
  - 地理信息: `latitude`, `longitude`, `altitude`, `distance_to_sea`, `has_lake`
  - 榜单评分: `world_score`, `layflat_score`, `list_type`
  - 躺平属性: `avg_rent`, `avg_temp`, `slow_pace_score`, `digital_nomad_score`
  - 一句话总结: `slogan`

- ✅ 扩展 `city_dimensions` 表
  - 躺平维度: `rent_cost`, `climate`, `slow_pace`, `medical_access`, `nature`, `population_density`, `price_index`, `digital_facilities`
  - 世界榜维度: `visa_friendly`, `language`, `culture`

- ✅ 新增 `ranking_lists` 表 - 三大榜单配置
  - 世界宜居城市排行榜
  - 中国综合宜居城市排行榜
  - 中国躺平/旅居/养老小城排行榜

- ✅ 新增 `city_images` 表 - 图片系统
  - 支持官方图、街景图、用户实拍图
  - 图片权重、精选、封面机制
  - 点赞、浏览统计

- ✅ 新增 `city_tags` 表 - 标签系统
  - 🏖️ 看海小城
  - 🏔️ 山居小城
  - 💰 超低房租
  - 🌡️ 四季如春
  - 🏥 医疗完善
  - 🤫 极度安静
  - 👴 养老天堂
  - 💻 数字游民友好
  - 🌊 临湖

- ✅ 新增 `favorites` 表 - 收藏功能

#### 2. 后端 API

##### 榜单 API (`/api/rankings`)
- `GET /api/rankings` - 获取所有榜单
- `GET /api/rankings/:list_key` - 获取榜单详情

##### 城市 API (`/api/cities`)
- `GET /api/cities?list_type=china_layflat` - 获取躺平榜城市列表
- `GET /api/cities?filters={}` - 高级筛选
  - 支持筛选: 海边、低房租、四季如春、安静、医疗、数字游民、山居、临湖
- `GET /api/cities/:id` - 获取城市详情（含标签、图片）

##### 图片 API (`/api/images`)
- `GET /api/images/city/:cityId` - 获取城市图片
- `POST /api/images/upload` - 上传图片 (需登录)
- `GET /api/images/:id` - 获取图片详情
- `POST /api/images/:id/like` - 图片点赞
- `DELETE /api/images/:id` - 删除图片
- `GET /api/images/featured/list` - 获取精选图片

##### 标签 API (`/api/tags`)
- `GET /api/tags/city/:cityId` - 获取城市标签
- `POST /api/tags/city/:cityId` - 添加标签
- `DELETE /api/tags/:id` - 删除标签
- `GET /api/tags/definitions` - 获取所有可用标签
- `GET /api/tags/filter?tags=seaside,low_rent` - 标签筛选城市

#### 3. 示例数据
- ✅ 30个精选躺平小城数据
  - 包含完整的维度评分
  - 自动生成标签
  - 计算躺平评分 (根据权重公式)

#### 4. 前端测试页面
- ✅ 创建 `/test.html` 测试页面
  - 三大榜单切换
  - 筛选器功能
  - 城市卡片展示
  - 统计数据展示

### 🚧 待完成功能 (后续迭代)

1. **城市详情页重构**
   - 头部大图轮播
   - 躺平标签栏
   - 核心指标卡片
   - 躺平指数雷达图
   - 图片墙 (官方图/街景/用户实拍)
   - 用户评价区
   - 月度成本估算
   - 养老适配度分析

2. **首页完整重构**
   - Hero Banner
   - 榜单切换导航
   - 完整筛选器UI
   - 城市卡片网格

3. **用户功能**
   - 图片上传界面
   - 收藏功能
   - 用户中心

## 🚀 快速开始

### 1. 初始化数据库
```bash
npm run init-db
```

### 2. 添加躺平小城数据
```bash
npm run seed-layflat
```

### 3. 启动服务器
```bash
npm start
```

### 4. 访问测试页面
打开浏览器访问: `http://localhost:3000/test.html`

## 📊 数据库迁移

如果你已有旧数据库，运行迁移脚本：
```bash
npm run migrate-db
```

## 🔧 API 使用示例

### 获取躺平榜前10名
```bash
curl "http://localhost:3000/api/cities?list_type=china_layflat&limit=10"
```

### 筛选海边+低房租城市
```bash
curl "http://localhost:3000/api/cities?list_type=china_layflat&filters=%7B%22seaside%22%3Atrue%2C%22low_rent%22%3Atrue%7D"
```

### 获取所有榜单
```bash
curl "http://localhost:3000/api/rankings"
```

### 获取城市标签
```bash
curl "http://localhost:3000/api/tags/city/1"
```

## 📈 评分算法

### 躺平榜评分公式
```
layflat_score = (
  rent_cost * 0.20 +          # 房租成本 (20%)
  climate * 0.15 +             # 气候舒适度 (15%)
  slow_pace * 0.15 +           # 慢节奏指数 (15%)
  medical_access * 0.15 +      # 医疗可达性 (15%)
  nature * 0.10 +              # 自然资源 (10%)
  population_density * 0.10 +  # 人口密度 (10%)
  price_index * 0.10 +         # 物价指数 (10%)
  digital_facilities * 0.05    # 数字设施 (5%)
)
```

## 🎯 标签定义

| 标签 | 触发条件 |
|------|---------|
| 🏖️ 看海小城 | distance_to_sea < 10km |
| 🏔️ 山居小城 | altitude: 800-2000m |
| 💰 超低房租 | avg_rent < 500元 |
| 🌡️ 四季如春 | avg_temp: 15-25°C |
| 🏥 医疗完善 | medical_access >= 7 |
| 🤫 极度安静 | population < 50万 |
| 👴 养老天堂 | elderly_care >= 8 |
| 💻 数字游民友好 | digital_nomad_score >= 7 |
| 🌊 临湖 | has_lake = 1 |

## 🌟 TOP 5 躺平小城

1. **荣成** (山东) - 8.85分
   - 🏖️ 看海 💰 超低房租 🤫 极度安静
   - 月租: ¥500

2. **乳山** (山东) - 8.77分
   - 🏖️ 看海 💰 超低房租 🤫 极度安静 👴 养老天堂
   - 月租: ¥400

3. **芒市** (云南) - 8.73分
   - 🏔️ 山居 🌡️ 四季如春 💰 超低房租 🤫 极度安静
   - 月租: ¥500

4. **防城港** (广西) - 8.71分
   - 🏖️ 看海 🌡️ 四季如春 💰 超低房租 🤫 极度安静
   - 月租: ¥600

5. **西昌** (四川) - 8.68分
   - 🌊 临湖 🌡️ 四季如春 💰 超低房租 🤫 极度安静 🏔️ 山居
   - 月租: ¥700

## 📝 下一步计划

1. **图片系统完善**
   - 集成图床服务 (七牛云/阿里云OSS)
   - 图片审核流程
   - 用户上传界面

2. **前端完整重构**
   - 使用现代前端框架 (Vue 3 / React)
   - 响应式设计
   - 动画效果

3. **数据丰富**
   - 爬取城市图片
   - 补充维度数据
   - 用户评价

4. **功能扩展**
   - 城市对比雷达图
   - 个性化推荐
   - 社交分享

## 📄 License

MIT

---

**注意**: 当前为MVP版本，主要验证核心功能和数据模型。后续将持续迭代优化。
