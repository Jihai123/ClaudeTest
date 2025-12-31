# 用户反馈与高级功能规划方案

## 📋 目录

1. [用户反馈系统](#用户反馈系统)
2. [高级功能建议](#高级功能建议)
3. [社交功能](#社交功能)
4. [个性化推荐](#个性化推荐)
5. [数据可视化](#数据可视化)
6. [实施优先级](#实施优先级)

---

## 🎯 用户反馈系统

### 1.1 城市评价系统 ⭐⭐⭐⭐⭐

**功能描述**:
- 用户可对居住过/访问过的城市进行评分和评价
- 五星评分 + 文字点评
- 支持上传城市照片（最多9张）
- 评价维度细分：生活成本、空气质量、医疗、就业、安全、养老

**数据库设计**:
```sql
-- 已存在的reviews表可以扩展
ALTER TABLE reviews ADD COLUMN images TEXT; -- JSON格式存储图片URLs
ALTER TABLE reviews ADD COLUMN living_cost_rating DECIMAL(2,1);
ALTER TABLE reviews ADD COLUMN air_quality_rating DECIMAL(2,1);
ALTER TABLE reviews ADD COLUMN medical_rating DECIMAL(2,1);
ALTER TABLE reviews ADD COLUMN employment_rating DECIMAL(2,1);
ALTER TABLE reviews ADD COLUMN safety_rating DECIMAL(2,1);
ALTER TABLE reviews ADD COLUMN elderly_care_rating DECIMAL(2,1);
ALTER TABLE reviews ADD COLUMN helpful_count INTEGER DEFAULT 0; -- 有用数
ALTER TABLE reviews ADD COLUMN residence_years INTEGER; -- 居住年限
```

**前端页面**:
- `/pages/review/write` - 写评价页面
- `/pages/review/list` - 城市评价列表
- `/pages/review/detail` - 评价详情页

**实施难度**: ⭐⭐⭐ (中等)

**预期效果**:
- 提升用户参与度
- 补充真实用户数据，优化推断算法
- 增加内容粘性

---

### 1.2 评论互动系统 ⭐⭐⭐⭐

**功能描述**:
- 用户可以对评价进行评论
- 支持"有用"/"没用"标记
- 举报不当评论
- 评论排序（最新/最热/最有用）

**数据库设计**:
```sql
CREATE TABLE review_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id)
);

CREATE TABLE review_helpful (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  is_helpful BOOLEAN NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(review_id, user_id)
);
```

**API接口**:
```javascript
POST /api/reviews/:id/comments    // 添加评论
GET  /api/reviews/:id/comments    // 获取评论列表
POST /api/reviews/:id/helpful     // 标记有用
POST /api/reviews/:id/report      // 举报
```

**实施难度**: ⭐⭐⭐ (中等)

---

### 1.3 用户反馈渠道 ⭐⭐⭐

**功能描述**:
- 数据纠错入口（城市信息错误反馈）
- 功能建议提交
- Bug反馈
- 客服咨询

**实现方式**:
- 微信小程序内置反馈组件
- 使用微信开放能力：`wx.openCustomerServiceChat()`
- 或自建反馈表单

**数据库设计**:
```sql
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  type VARCHAR(20), -- 'error', 'suggestion', 'bug', 'other'
  city_id INTEGER,  -- 如果是城市相关
  content TEXT NOT NULL,
  contact VARCHAR(100), -- 联系方式
  images TEXT,      -- 截图
  status VARCHAR(20) DEFAULT 'pending', -- pending/processing/resolved
  admin_reply TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**前端页面**:
- `/pages/feedback/index` - 反馈中心
- `/pages/feedback/submit` - 提交反馈
- `/pages/feedback/my` - 我的反馈

**实施难度**: ⭐⭐ (简单)

---

## 🚀 高级功能建议

### 2.1 城市对比功能 ⭐⭐⭐⭐⭐

**功能描述**:
- 最多支持3个城市同时对比
- 雷达图展示六大维度对比
- 详细数据表格对比
- 标签差异对比（沿海/内陆、一线/二线等）

**前端实现**:
```javascript
// pages/compare/index
Page({
  data: {
    selectedCities: [], // 最多3个
    comparisonData: {
      dimensions: {},
      tags: {},
      rankings: {}
    }
  },

  // 使用 ECharts 绘制雷达图
  drawRadarChart() {
    const option = {
      radar: {
        indicator: [
          { name: '生活成本', max: 10 },
          { name: '空气质量', max: 10 },
          { name: '医疗设施', max: 10 },
          { name: '就业机会', max: 10 },
          { name: '安全指数', max: 10 },
          { name: '养老设施', max: 10 }
        ]
      },
      series: [{
        type: 'radar',
        data: this.data.selectedCities.map(city => ({
          value: [/* 6个维度数据 */],
          name: city.name
        }))
      }]
    };
  }
});
```

**API接口**:
```javascript
GET /api/cities/compare?ids=1,2,3
```

**实施难度**: ⭐⭐⭐ (中等)

**依赖**:
- 引入 `echarts-for-weixin` 图表库

---

### 2.2 智能推荐系统 ⭐⭐⭐⭐⭐

**功能描述**:
- 基于用户偏好的城市推荐
- 问卷调查（年龄、职业、收入、偏好）
- 机器学习推荐算法

**推荐算法**:
```javascript
// server/utils/recommendCities.js
function recommendCities(userPreferences) {
  const {
    age,              // 年龄段
    occupation,       // 职业
    income,           // 收入水平
    priorities        // 优先考虑的维度 ['employment', 'living_cost']
  } = userPreferences;

  // 1. 计算权重
  const weights = calculateWeights(priorities);

  // 2. 筛选适合城市
  const candidates = filterCitiesByProfile(age, occupation, income);

  // 3. 加权评分
  const scored = candidates.map(city => ({
    ...city,
    matchScore: weights.reduce((sum, w) =>
      sum + city[w.dimension] * w.weight, 0
    )
  }));

  // 4. 排序返回Top 20
  return scored.sort((a, b) => b.matchScore - a.matchScore).slice(0, 20);
}

// 权重计算示例
function calculateWeights(priorities) {
  const baseWeights = {
    living_cost: 1.0,
    air_quality: 1.0,
    medical_facilities: 1.0,
    employment: 1.0,
    safety: 1.0,
    elderly_care: 1.0
  };

  // 用户优先级加倍
  priorities.forEach(p => baseWeights[p] *= 2);

  return Object.entries(baseWeights).map(([dimension, weight]) => ({
    dimension,
    weight
  }));
}
```

**前端页面**:
- `/pages/recommend/questionnaire` - 推荐问卷
- `/pages/recommend/result` - 推荐结果

**数据库设计**:
```sql
CREATE TABLE user_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  age_range VARCHAR(20),
  occupation VARCHAR(50),
  income_range VARCHAR(20),
  priorities TEXT, -- JSON数组
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**实施难度**: ⭐⭐⭐⭐ (较难)

---

### 2.3 城市订阅与动态 ⭐⭐⭐⭐

**功能描述**:
- 用户可以"关注"感兴趣的城市
- 城市有新评价/排名变化时推送通知
- 城市动态流（类似朋友圈）

**数据库设计**:
```sql
CREATE TABLE city_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  city_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, city_id)
);

CREATE TABLE city_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city_id INTEGER NOT NULL,
  type VARCHAR(20), -- 'new_review', 'ranking_change', 'data_update'
  content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**微信推送**:
```javascript
// 使用微信订阅消息
wx.requestSubscribeMessage({
  tmplIds: ['模板ID'],
  success: (res) => {
    // 后端发送订阅消息
  }
});
```

**实施难度**: ⭐⭐⭐⭐ (较难)

**依赖**:
- 微信订阅消息模板
- 定时任务（检测排名变化）

---

### 2.4 高级筛选与搜索 ⭐⭐⭐⭐

**功能描述**:
- 多维度组合筛选
- 滑块控制范围（如：生活成本 5-8分）
- 地图选择（在地图上框选区域）
- 保存筛选条件

**前端实现**:
```javascript
// pages/city-list/filter
Page({
  data: {
    filters: {
      livingCostRange: [0, 10],
      airQualityRange: [0, 10],
      tags: ['coastal', 'capital'],
      province: '广东',
      populationRange: [100, 1000] // 万人
    }
  },

  onFilterChange() {
    // 实时筛选
    this.fetchCities();
  }
});
```

**API接口增强**:
```javascript
GET /api/cities/advanced-search
Query参数:
  living_cost_min=5
  living_cost_max=8
  air_quality_min=7
  tags=coastal,capital
  province=广东
  population_min=1000000
```

**实施难度**: ⭐⭐⭐ (中等)

---

### 2.5 个人定制榜单 ⭐⭐⭐⭐

**功能描述**:
- 用户可以自定义榜单维度权重
- 生成专属榜单
- 分享榜单给好友

**示例**:
```
我的榜单：性价比优先
- 生活成本权重: 40%
- 就业机会权重: 30%
- 医疗设施权重: 20%
- 其他: 10%

Top 1: 成都 (综合得分: 8.5)
Top 2: 长沙 (综合得分: 8.3)
...
```

**数据库设计**:
```sql
CREATE TABLE custom_rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name VARCHAR(100), -- 榜单名称
  weights TEXT,      -- JSON格式权重配置
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**实施难度**: ⭐⭐⭐ (中等)

---

## 👥 社交功能

### 3.1 用户主页 ⭐⭐⭐

**功能描述**:
- 展示用户基本信息
- 居住/去过的城市地图
- 发表的评价列表
- 收藏的城市

**前端页面**:
- `/pages/user/profile` - 个人主页
- `/pages/user/edit` - 编辑资料

**数据库设计**:
```sql
CREATE TABLE user_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  nickname VARCHAR(50),
  avatar_url VARCHAR(255),
  bio TEXT,
  current_city_id INTEGER,
  visited_cities TEXT, -- JSON数组
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**实施难度**: ⭐⭐ (简单)

---

### 3.2 评价分享 ⭐⭐⭐⭐

**功能描述**:
- 生成精美卡片图片
- 分享到微信好友/朋友圈
- 分享到小程序消息

**实现方式**:
```javascript
// 使用 Canvas 生成分享卡片
wx.shareAppMessage({
  title: `我对${city.name}的评价`,
  path: `/pages/review/detail?id=${review.id}`,
  imageUrl: generatedImageUrl
});
```

**实施难度**: ⭐⭐⭐ (中等)

---

### 3.3 城市话题圈 ⭐⭐⭐⭐⭐

**功能描述**:
- 为每个城市创建话题圈
- 用户可发帖讨论、分享经验
- 点赞、评论互动

**数据库设计**:
```sql
CREATE TABLE city_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  title VARCHAR(200),
  content TEXT NOT NULL,
  images TEXT,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE post_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE post_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id, user_id)
);
```

**前端页面**:
- `/pages/community/index` - 话题广场
- `/pages/community/city` - 城市话题圈
- `/pages/community/post-detail` - 帖子详情

**实施难度**: ⭐⭐⭐⭐⭐ (困难)

**注意事项**:
- 需要内容审核（微信小程序要求）
- 使用微信内容安全API进行审核

---

## 🎨 数据可视化

### 4.1 城市数据大屏 ⭐⭐⭐⭐

**功能描述**:
- 全国城市分布地图
- 热力图展示各维度数据
- 动态排行榜动画
- 趋势图（如有历史数据）

**技术方案**:
- ECharts图表库
- 地图组件（腾讯地图/高德地图）

**实现示例**:
```javascript
// 城市分布热力图
const option = {
  geo: {
    map: 'china',
    roam: true
  },
  series: [{
    type: 'scatter',
    coordinateSystem: 'geo',
    data: cities.map(city => ({
      name: city.name,
      value: [city.longitude, city.latitude, city.overall_score]
    })),
    symbolSize: (val) => val[2] * 3
  }]
};
```

**实施难度**: ⭐⭐⭐⭐ (较难)

---

### 4.2 个人数据统计 ⭐⭐⭐

**功能描述**:
- 用户去过的城市足迹地图
- 评价统计（总数、获赞数）
- 偏好分析（喜欢什么类型的城市）

**前端实现**:
```javascript
// pages/user/stats
Page({
  data: {
    visitedCities: 15,
    reviewCount: 8,
    totalLikes: 120,
    preferredTags: ['coastal', 'new_tier_1'],
    cityMap: []  // 足迹地图数据
  }
});
```

**实施难度**: ⭐⭐⭐ (中等)

---

### 4.3 城市对比雷达图 ⭐⭐⭐⭐

(已在2.1城市对比功能中包含)

---

## 📅 实施优先级

### Phase 1: 核心反馈功能（1-2周）⭐⭐⭐⭐⭐

**必做**:
1. ✅ 城市评价系统（评分+文字）
2. ✅ 数据纠错反馈
3. ✅ 评价"有用"标记

**预期收益**:
- 快速获取用户反馈
- 优化推断数据
- 提升用户参与度

---

### Phase 2: 高级功能（2-3周）⭐⭐⭐⭐

**推荐实施**:
1. ✅ 城市对比功能（雷达图）
2. ✅ 高级筛选器
3. ✅ 智能推荐问卷
4. ✅ 用户主页

**预期收益**:
- 增强工具实用性
- 提升用户体验
- 数据可视化吸引用户

---

### Phase 3: 社交与互动（3-4周）⭐⭐⭐

**可选实施**:
1. 🔄 评论互动系统
2. 🔄 城市订阅与通知
3. 🔄 评价分享卡片
4. 🔄 个人定制榜单

**预期收益**:
- 增加用户粘性
- 促进传播
- 建立社区氛围

---

### Phase 4: 社区生态（长期规划）⭐⭐

**未来规划**:
1. 🔮 城市话题圈
2. 🔮 数据大屏可视化
3. 🔮 城市变化追踪
4. 🔮 数据API开放

**预期收益**:
- 打造UGC内容生态
- 数据持续更新
- 商业化可能性

---

## 💡 技术选型建议

### 前端库推荐

```json
{
  "echarts-for-weixin": "^5.0.0",  // 图表库
  "weui-wxss": "^2.5.0",           // UI组件库
  "wx-promise-pro": "^3.0.0"       // Promise化微信API
}
```

### 后端依赖

```json
{
  "express": "^4.18.0",
  "express-rate-limit": "^6.0.0",  // 已有
  "node-schedule": "^2.1.0",       // 定时任务（订阅通知）
  "nodemailer": "^6.9.0"           // 邮件通知（管理员）
}
```

### 第三方服务

- **内容安全**: 微信内容安全API（必须）
- **地图服务**: 腾讯地图/高德地图（可选）
- **云存储**: 微信云开发/阿里云OSS（图片存储）
- **推送通知**: 微信订阅消息（免费）

---

## 🔒 安全与合规

### 内容审核

```javascript
// server/utils/contentModeration.js
const axios = require('axios');

async function checkContent(content) {
  // 调用微信内容安全API
  const res = await axios.post(
    'https://api.weixin.qq.com/wxa/msg_sec_check',
    { content },
    { params: { access_token: getAccessToken() } }
  );

  return res.data.errcode === 0; // 0=安全, 其他=违规
}
```

### 用户隐私

- 评价可设置匿名发布
- 用户资料可见性控制
- 符合《个人信息保护法》

### 反垃圾机制

- 评价频率限制（每日最多3条）
- 举报系统
- 敏感词过滤

---

## 📊 数据分析指标

### 用户行为追踪

```javascript
// 埋点示例
trackEvent({
  event: 'review_submit',
  city_id: 123,
  rating: 4.5,
  has_images: true
});

trackEvent({
  event: 'city_compare',
  city_ids: [1, 2, 3]
});
```

### 关键指标

- DAU/MAU（日活/月活）
- 评价转化率
- 分享传播率
- 功能使用率

---

## 🎯 总结

### 最小可行产品（MVP）建议

**立即实施**:
1. 城市评价系统（⭐⭐⭐⭐⭐）
2. 城市对比功能（⭐⭐⭐⭐⭐）
3. 数据纠错反馈（⭐⭐⭐）

**预计开发时间**: 2周
**预期效果**: 用户可参与、数据可优化、功能更实用

### 完整路线图

```
Week 1-2:  Phase 1 - 核心反馈功能
Week 3-5:  Phase 2 - 高级功能
Week 6-9:  Phase 3 - 社交互动
Week 10+:  Phase 4 - 社区生态
```

---

## 🚀 下一步行动

**现在可以开始做的**:

1. **扩展数据库Schema** - 添加reviews相关字段
2. **创建评价页面** - `/pages/review/write`
3. **实现评价API** - `POST /api/reviews`
4. **城市对比页面** - `/pages/compare/index`
5. **引入ECharts库** - 安装echarts-for-weixin

**我可以立即为您开始实施Phase 1的核心功能。要开始吗？**

选择：
- A: 开始实施城市评价系统
- B: 先创建城市对比功能
- C: 同时实施评价+对比（推荐）
- D: 我想调整优先级
