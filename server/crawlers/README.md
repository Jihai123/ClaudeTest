# 图片爬取流水线

自动化爬取城市图片并导入数据库的完整流程。

## 目录结构

```
server/crawlers/
├── run_pipeline.sh      # 一键执行脚本
├── export_cities.py     # 步骤1: 导出城市列表
├── batch_crawl.py       # 步骤2: 批量爬取图片
├── filter_images.py     # 步骤3: 筛选图片
├── import_to_db.py      # 步骤4: 上传R2并导入数据库
├── requirements.txt     # Python依赖
└── README.md           # 本文档
```

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置环境变量

如果要上传到 Cloudflare R2，需要设置以下环境变量：

```bash
export R2_ACCOUNT_ID="your_account_id"
export R2_ACCESS_KEY_ID="your_access_key"
export R2_SECRET_ACCESS_KEY="your_secret_key"
export R2_BUCKET_NAME="your_bucket_name"
export R2_PUBLIC_DOMAIN="your.custom.domain.com"  # 可选
```

或者在项目根目录的 `.env` 文件中配置。

### 3. 一键执行

```bash
# 完整流程
./run_pipeline.sh

# 试运行（不实际执行）
./run_pipeline.sh --dry-run

# 只爬取前10个城市
./run_pipeline.sh --limit 10

# 跳过R2上传，使用本地路径
./run_pipeline.sh --skip-upload
```

## 分步执行

### 步骤1: 导出城市列表

```bash
python export_cities.py
```

从数据库导出所有城市，生成 `cities.json` 文件。

### 步骤2: 批量爬取图片

```bash
# 基本用法
python batch_crawl.py --downloader /path/to/image_downloader.py

# 使用百度搜索
python batch_crawl.py -e Baidu -d /path/to/image_downloader.py

# 只爬取图片不足的城市
python batch_crawl.py --only-missing -d /path/to/image_downloader.py

# 爬取指定榜单
python batch_crawl.py --list-type china_layflat -d /path/to/image_downloader.py
```

参数说明：
- `--downloader`, `-d`: image_downloader.py 路径
- `--engine`, `-e`: 搜索引擎 (Google/Baidu/Bing)
- `--max-number`, `-n`: 每城市图片数量
- `--only-missing`, `-m`: 只爬取图片<3的城市
- `--skip-completed`, `-s`: 跳过已完成的城市
- `--list-type`, `-t`: 指定榜单类型
- `--limit`, `-l`: 限制城市数量
- `--dry-run`: 试运行

### 步骤3: 筛选图片

```bash
python filter_images.py
```

筛选标准：
- 最小尺寸: 800x500 像素
- 文件大小: 50KB - 10MB
- 宽高比: 1.2 - 2.5 (横向图片)
- 每城市最多保留 5 张

参数说明：
- `--dry-run`: 试运行
- `--keep-rejected`: 保留被拒绝的图片
- `--min-width`: 自定义最小宽度
- `--max-per-city`: 每城市最大图片数

### 步骤4: 上传并导入数据库

```bash
# 上传到R2并导入数据库
python import_to_db.py

# 只导入数据库，使用本地路径
python import_to_db.py --local-only

# 试运行
python import_to_db.py --dry-run
```

## 输出文件

执行完成后会生成以下文件和目录：

```
server/crawlers/
├── cities.json          # 城市列表
├── crawl_log.json       # 爬取日志
├── filter_log.json      # 筛选日志
├── import_log.json      # 导入日志
├── raw_images/          # 原始图片目录
│   ├── 1/              # 城市ID为1的图片
│   ├── 2/
│   └── ...
├── filtered_images/     # 筛选后的图片
│   ├── 1/
│   ├── 2/
│   └── ...
└── rejected_images/     # 被拒绝的图片（可选）
```

## 注意事项

1. **频率控制**: 爬取时默认每城市间隔2秒，避免被封IP
2. **搜索引擎选择**: Google 图片质量较高，百度对中国城市支持更好
3. **图片版权**: 爬取的图片可能存在版权问题，建议仅用于测试
4. **R2配置**: 正式环境建议使用 Cloudflare R2 存储图片
5. **断点续传**: 支持跳过已完成的城市，可中断后继续

## 常见问题

**Q: 爬取失败怎么办？**
A: 检查 `crawl_log.json` 中的失败记录，可以使用 `--skip-completed` 重试。

**Q: 如何只爬取特定城市？**
A: 使用 `--city-id` 参数或修改 `cities.json` 文件。

**Q: R2上传失败怎么办？**
A: 检查环境变量配置，或使用 `--local-only` 跳过上传。
