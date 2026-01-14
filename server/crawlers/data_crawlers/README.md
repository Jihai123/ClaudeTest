# 城市数据爬取流水线

一键化爬取城市各类数据，支持爬取-筛选-导入的完整流程。

## 目录结构

```
data_crawlers/
├── crawl_all.py          # 主爬取脚本（整合所有数据源）
├── filter_data.py        # 数据筛选和验证脚本
├── import_data.py        # 数据库导入脚本
├── run_data_pipeline.sh  # 一键执行脚本
├── requirements.txt      # Python依赖
├── crawlers/             # 各数据源爬虫模块
│   ├── __init__.py
│   ├── base_crawler.py   # 爬虫基类（HTTP请求、重试、日志）
│   ├── baike_crawler.py  # 百度百科爬虫（基础数据+城市介绍）
│   ├── weather_crawler.py# 天气/气候数据爬虫
│   ├── housing_crawler.py# 房价租金爬虫
│   └── quality_crawler.py# 生活质量数据爬虫（AQI/医院/高校）
├── raw_data/             # 原始爬取数据
├── filtered_data/        # 筛选后数据
└── logs/                 # 日志目录
```

## 数据优先级

| 级别 | 数据类型 | 数据来源 | 字段 |
|------|----------|----------|------|
| P0 | 租金/房价 | 贝壳找房、参考数据 | avg_price, avg_rent |
| P1 | 基础数据 | 百度百科 | population, gdp, area |
| P1 | 气候数据 | 中国天气网、参考数据 | avg_temp, rainfall, climate_type |
| P2 | 生活质量 | 参考数据 | aqi, hospital_count, university_count |
| P2 | 城市介绍 | 百度百科 | description, famous_places, features |

## 安装依赖

```bash
cd server/crawlers/data_crawlers
pip install -r requirements.txt
```

## 使用方法

### 一键执行全部流程

```bash
# 完整流水线（爬取 → 筛选 → 导入）
./run_data_pipeline.sh

# 试运行（查看会处理哪些城市）
./run_data_pipeline.sh --dry-run
```

### 分步执行

```bash
# 步骤1: 爬取数据
python crawl_all.py --type all          # 爬取全部数据
python crawl_all.py --type basic        # 只爬取基础数据（百度百科）
python crawl_all.py --type housing      # 只爬取房价租金
python crawl_all.py --type weather      # 只爬取气候数据
python crawl_all.py --type quality      # 只爬取生活质量数据
python crawl_all.py --type merge        # 只合并已有数据

# 步骤2: 筛选和验证
python filter_data.py                   # 标准模式
python filter_data.py --strict          # 严格模式

# 步骤3: 导入数据库
python import_data.py                   # 导入所有数据
python import_data.py --force           # 强制覆盖现有数据
```

### 常用选项

```bash
--dry-run           # 试运行，不实际执行
--city-id ID        # 只处理指定城市
--limit N           # 限制城市数量
--skip-completed    # 跳过已完成城市（断点续传）
--list-type TYPE    # 指定榜单类型 (china_general/china_layflat/world)
--force             # 强制覆盖现有数据
```

### 示例

```bash
# 只爬取躺平榜城市的房价数据
python crawl_all.py --type housing --list-type china_layflat

# 限制爬取10个城市，用于测试
python crawl_all.py --type all --limit 10

# 断点续传（跳过已完成的城市）
./run_data_pipeline.sh --skip-completed

# 只处理北京（假设ID=1）
python crawl_all.py --city-id 1 --type all
python filter_data.py
python import_data.py --city-id 1
```

## 数据流程

```
┌─────────────────────────────────────────────────────────────┐
│ 步骤1: 爬取数据 (crawl_all.py)                              │
│ ├─ 百度百科 → basic_data.json (人口/GDP/面积/简介)         │
│ ├─ 天气网   → weather_data.json (气温/降水/气候类型)       │
│ ├─ 贝壳找房 → housing_data.json (房价/租金)                │
│ └─ 参考数据 → quality_data.json (AQI/医院/高校)            │
│                              ↓                              │
│              合并为 merged_data.json                        │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 步骤2: 筛选验证 (filter_data.py)                            │
│ ├─ 数据范围检查 (人口、GDP、房价等合理范围)                 │
│ ├─ 数据完整度评估                                           │
│ └─ 生成验证报告                                             │
│                              ↓                              │
│              输出 filtered_data/city_data.json              │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 步骤3: 导入数据库 (import_data.py)                          │
│ ├─ 更新 cities 表 (population, gdp, area, avg_rent 等)     │
│ ├─ 更新 city_dimensions 表 (air_quality, medical 等)       │
│ └─ 更新 city_tags 表 (特色标签)                             │
└─────────────────────────────────────────────────────────────┘
```

## 数据验证规则

| 字段 | 有效范围 | 说明 |
|------|----------|------|
| population | 0.1 ~ 50000 | 人口（万人） |
| gdp | 1 ~ 500000 | GDP（亿元） |
| area | 1 ~ 100000 | 面积（km²） |
| avg_price | 1000 ~ 200000 | 房价（元/㎡） |
| avg_rent | 100 ~ 50000 | 月租金（元） |
| avg_temp | -20 ~ 35 | 年均温度（℃） |
| rainfall | 10 ~ 5000 | 年降水量（mm） |
| aqi | 10 ~ 300 | 空气质量指数 |

## 注意事项

1. **反爬限制**：爬虫默认设置了2-3秒延迟，避免IP被封
2. **参考数据**：部分数据源可能无法访问，会使用预置的参考数据
3. **断点续传**：使用 `--skip-completed` 可跳过已爬取的城市
4. **数据更新**：默认只更新空字段，使用 `--force` 强制覆盖

## 日志文件

- `logs/crawl_log.json` - 爬取日志（已完成/失败城市）
- `logs/filter_report.json` - 筛选报告（统计信息）
- `logs/import_log.json` - 导入日志（更新统计）
