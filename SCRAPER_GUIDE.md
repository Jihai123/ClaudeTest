# 数据爬取和导入指南

本项目提供了灵活的城市数据爬取和导入功能，让您可以轻松地丰富网站内容。

## 📦 已包含的功能

### 1. 初始数据集（推荐使用）

项目已经包含了**36个中国主要城市**的完整数据，覆盖：
- 一线城市：北京、上海、广州、深圳
- 新一线城市：成都、杭州、重庆、西安、苏州、武汉、南京等
- 二线及重要城市：天津、郑州、长沙、青岛、厦门、昆明等

**快速填充数据：**
```bash
npm run seed-cities
```

执行后，数据库将包含所有城市的完整信息，包括：
- 基本数据：人口、GDP、面积
- 维度评分：生活成本、空气质量、医疗设施、就业机会、安全指数、适合养老
- 自动计算的综合评分

### 2. CSV/JSON 数据导入

如果您有自己的城市数据源，可以通过CSV或JSON文件导入。

#### CSV 文件格式

创建一个CSV文件（参考 `data/cities_template.csv`）：

```csv
name,province,population,gdp,area,living_cost,air_quality,medical_facilities,employment,safety,elderly_care
深圳,广东省,17560061,32387.68,1997.47,3.8,7.8,8.8,9.5,8.8,7.5
南京,江苏省,9423400,16907.85,6587.02,6.8,7.0,8.8,8.2,8.8,8.5
```

**导入CSV：**
```bash
npm run import-csv data/your_cities.csv
```

#### JSON 文件格式

创建一个JSON文件：

```json
[
  {
    "name": "深圳",
    "province": "广东省",
    "population": 17560061,
    "gdp": 32387.68,
    "area": 1997.47,
    "dimensions": {
      "living_cost": 3.8,
      "air_quality": 7.8,
      "medical_facilities": 8.8,
      "employment": 9.5,
      "safety": 8.8,
      "elderly_care": 7.5
    }
  }
]
```

**导入JSON：**
```bash
npm run import-json data/your_cities.json
```

### 3. 数据导出

您可以随时导出数据库中的城市数据：

**导出为CSV：**
```bash
npm run export-csv data/cities_backup.csv
```

**导出为JSON：**
```bash
npm run export-json data/cities_backup.json
```

## 🕷️ 网络爬虫功能

项目包含一个示例爬虫框架（`server/utils/crawler.js`），可用于从第三方网站获取数据。

### 使用现有爬虫

现有爬虫提供了基础结构，您需要根据目标网站调整解析逻辑：

```javascript
const crawler = require('./server/utils/crawler');

// 爬取并更新数据
crawler.crawlAndUpdate('https://example.com/city-rankings')
  .then(result => {
    console.log(`成功更新 ${result.updated} 个城市`);
  });
```

### 自定义爬虫

如果需要从特定网站爬取，需要修改 `server/utils/crawler.js` 中的解析逻辑：

```javascript
async parseCityRankings(html) {
  const $ = cheerio.load(html);
  const cities = [];

  // 根据目标网站的HTML结构调整选择器
  $('.city-item').each((index, element) => {
    const name = $(element).find('.city-name').text().trim();
    const province = $(element).find('.province').text().trim();

    cities.push({
      name,
      province,
      dimensions: {
        living_cost: parseFloat($(element).find('.cost').text()) || 0,
        air_quality: parseFloat($(element).find('.air').text()) || 0,
        // ... 其他维度
      }
    });
  });

  return cities;
}
```

### 爬虫使用注意事项

⚠️ **重要提醒：**

1. **遵守法律法规**
   - 确保爬取行为符合相关法律法规
   - 不要爬取受版权保护或明确禁止爬取的内容

2. **尊重 robots.txt**
   - 检查目标网站的 robots.txt 文件
   - 遵守网站的爬取规则

3. **合理的请求频率**
   - 设置合理的请求间隔，避免给服务器造成压力
   - 建议添加延迟：
   ```javascript
   await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒延迟
   ```

4. **数据来源标注**
   - 在使用第三方数据时，请标注数据来源
   - 遵守数据提供方的使用条款

## 📊 推荐的数据来源

### 公开数据源

以下是一些合法的城市数据来源：

1. **国家统计局**
   - 官方网站：http://www.stats.gov.cn/
   - 提供人口、GDP、面积等官方数据

2. **各省市统计局**
   - 提供详细的地方统计数据

3. **城市年鉴**
   - 各城市发布的年度统计年鉴
   - 通常可在政府网站下载

4. **学术研究机构**
   - 中国社会科学院
   - 各大学研究机构发布的城市研究报告

5. **公开API**
   - 和鲸社区等开放数据平台
   - 一些政府部门提供的开放数据API

### 手动收集建议

对于评分类数据（生活成本、空气质量等），建议：

1. **参考多个来源取平均值**
2. **使用标准化评分系统（1-10分）**
3. **定期更新数据保持时效性**
4. **记录数据来源和更新时间**

## 🔧 常用命令总结

```bash
# 初始化数据库
npm run init-db

# 填充初始城市数据（推荐）
npm run seed-cities

# 从CSV导入
npm run import-csv data/cities.csv

# 从JSON导入
npm run import-json data/cities.json

# 导出为CSV
npm run export-csv data/export.csv

# 导出为JSON
npm run export-json data/export.json

# 启动服务器
npm start

# 开发模式（自动重启）
npm run dev
```

## 📝 数据字段说明

### 基本字段

| 字段 | 类型 | 说明 | 必填 |
|------|------|------|------|
| name | String | 城市名称 | 是 |
| province | String | 所属省份 | 否 |
| population | Integer | 人口数量 | 否 |
| gdp | Decimal | GDP（亿元） | 否 |
| area | Decimal | 面积（平方公里） | 否 |

### 维度评分（1-10分）

| 维度 | 说明 | 评分标准 |
|------|------|----------|
| living_cost | 生活成本 | 分数越低表示成本越高（3分=很贵，9分=便宜） |
| air_quality | 空气质量 | AQI指数转换，分数越高越好 |
| medical_facilities | 医疗设施 | 医院数量、质量综合评分 |
| employment | 就业机会 | 就业率、薪资水平、行业分布 |
| safety | 安全指数 | 治安状况、犯罪率 |
| elderly_care | 适合养老 | 养老设施、生活便利度、环境 |

### 综合评分计算

综合评分由各维度加权计算：

```
综合评分 =
  生活成本 × 20% +
  空气质量 × 15% +
  医疗设施 × 15% +
  就业机会 × 20% +
  安全指数 × 15% +
  适合养老 × 15%
```

## 🚀 快速开始示例

### 1. 从零开始建站

```bash
# 1. 安装依赖
npm install

# 2. 初始化数据库
npm run init-db

# 3. 填充城市数据
npm run seed-cities

# 4. 启动服务器
npm start

# 5. 访问网站
# http://localhost:3000/livablecities/
```

### 2. 添加更多城市

```bash
# 准备CSV文件（参考 data/cities_template.csv）
# 然后导入
npm run import-csv data/my_cities.csv
```

### 3. 数据备份

```bash
# 定期导出数据作为备份
npm run export-json data/backup_$(date +%Y%m%d).json
```

## 🔍 验证数据

导入数据后，可以通过以下方式验证：

1. **API 查询**
```bash
curl http://localhost:3000/livablecities/api/cities?limit=5
```

2. **网页查看**
访问 http://localhost:3000/livablecities/ 查看城市排行榜

3. **数据库查询**
```bash
node test-db.js
```

## ❓ 常见问题

### Q: 如何更新已存在的城市数据？
A: 直接导入相同城市名称的数据，系统会自动更新。

### Q: 导入的城市需要审核吗？
A: 通过导入工具添加的城市默认状态为"已审核"，用户通过网站提交的需要审核。

### Q: 如何删除错误的城市数据？
A: 使用管理员账户登录后台，在城市管理页面删除。

### Q: 评分数据从哪里获取？
A: 建议参考官方统计数据和权威机构报告，或使用合理的估算值。

### Q: 可以爬取哪些网站？
A: 只能爬取明确允许爬取且符合法律的网站，建议使用公开数据源或手动收集。

## 📞 技术支持

如有问题，请查看：
- README.md - 项目总体说明
- data/README.md - 数据导入详细说明
- 项目 Issues - 提交问题和建议

---

**最后更新**: 2025-11-26
