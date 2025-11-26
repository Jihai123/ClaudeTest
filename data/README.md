# 城市数据导入/导出说明

这个目录用于存放城市数据的导入和导出文件。

## CSV文件格式

CSV文件应包含以下列（支持中英文表头）：

| 列名 | 英文 | 说明 | 示例 |
|------|------|------|------|
| 城市名称 | name | 必填 | 北京 |
| 省份 | province | 选填 | 北京市 |
| 人口 | population | 选填 | 21893095 |
| GDP | gdp | 选填（亿元） | 41610.90 |
| 面积 | area | 选填（平方公里） | 16410.54 |
| 生活成本 | living_cost | 选填（1-10分） | 3.5 |
| 空气质量 | air_quality | 选填（1-10分） | 6.5 |
| 医疗设施 | medical_facilities | 选填（1-10分） | 9.8 |
| 就业机会 | employment | 选填（1-10分） | 9.5 |
| 安全指数 | safety | 选填（1-10分） | 9.0 |
| 适合养老 | elderly_care | 选填（1-10分） | 8.5 |

## 评分说明

各维度评分范围：1-10分
- 1-3分：较差
- 4-6分：一般
- 7-8分：良好
- 9-10分：优秀

**注意**：生活成本维度分数越低表示成本越高（3分表示很贵，9分表示便宜）

## JSON文件格式

```json
[
  {
    "name": "北京",
    "province": "北京市",
    "population": 21893095,
    "gdp": 41610.90,
    "area": 16410.54,
    "dimensions": {
      "living_cost": 3.5,
      "air_quality": 6.5,
      "medical_facilities": 9.8,
      "employment": 9.5,
      "safety": 9.0,
      "elderly_care": 8.5
    }
  }
]
```

## 使用方法

### 1. 填充初始城市数据

```bash
npm run seed-cities
```

这会填充35个中国主要城市的数据到数据库。

### 2. 从CSV导入

```bash
npm run import-csv data/your_cities.csv
```

### 3. 从JSON导入

```bash
npm run import-json data/your_cities.json
```

### 4. 导出到CSV

```bash
npm run export-csv data/cities_export.csv
```

### 5. 导出到JSON

```bash
npm run export-json data/cities_export.json
```

## 示例文件

- `cities_template.csv` - CSV格式模板文件
- 您可以复制模板文件并修改数据后导入

## 注意事项

1. 导入时，如果城市已存在（按名称匹配），会更新现有数据
2. 导入时，如果城市不存在，会创建新城市
3. 所有导入的城市状态默认为"已审核"（approved）
4. 综合评分会根据各维度自动计算
5. CSV文件应使用UTF-8编码，避免中文乱码

## 数据来源建议

合法获取城市数据的途径：
- 国家统计局官方数据
- 各省市政府公开数据
- 学术研究机构发布的报告
- 公开的城市年鉴

请确保遵守数据来源的使用条款和相关法律法规。
