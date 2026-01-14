#!/usr/bin/env python3
"""
城市数据批量爬取脚本
整合所有数据源，支持分类爬取

用法:
    python crawl_all.py --type all          # 爬取全部数据（不含评论）
    python crawl_all.py --type basic        # 只爬取基础数据（百度百科）
    python crawl_all.py --type housing      # 只爬取房价租金
    python crawl_all.py --type weather      # 只爬取气候数据
    python crawl_all.py --type quality      # 只爬取生活质量数据
    python crawl_all.py --type reviews      # 只爬取用户评论（抖音/小红书/知乎）
    python crawl_all.py --city-id 1         # 只处理指定城市
    python crawl_all.py --limit 10          # 限制城市数量
    python crawl_all.py --dry-run           # 试运行
"""

import argparse
import json
import os
import sys
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

# 添加项目路径
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent
sys.path.insert(0, str(SCRIPT_DIR))

from crawlers import BaikeCrawler, WeatherCrawler, HousingCrawler, QualityCrawler, ReviewCrawler

# 加载.env文件
def load_env():
    env_file = PROJECT_ROOT / '.env'
    if env_file.exists():
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ.setdefault(key.strip(), value.strip())

load_env()

# 配置
CITIES_FILE = SCRIPT_DIR.parent / 'cities.json'
RAW_DATA_DIR = SCRIPT_DIR / 'raw_data'
LOG_DIR = SCRIPT_DIR / 'logs'
LOG_FILE = LOG_DIR / 'crawl_log.json'

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('CrawlAll')


def load_cities(cities_file: Path = CITIES_FILE) -> List[Dict]:
    """加载城市列表"""
    if not cities_file.exists():
        logger.error(f"城市列表文件不存在: {cities_file}")
        logger.info("请先运行 python export_cities.py 导出城市列表")
        sys.exit(1)

    with open(cities_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    return data.get('cities', [])


def load_completed_ids(crawl_type: str) -> set:
    """加载已完成的城市ID"""
    if not LOG_FILE.exists():
        return set()

    with open(LOG_FILE, 'r', encoding='utf-8') as f:
        log_data = json.load(f)

    completed = log_data.get('completed', {}).get(crawl_type, [])
    return set(completed)


def save_log(crawl_type: str, results: List[Dict], completed_ids: set):
    """保存爬取日志"""
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    # 加载现有日志
    log_data = {}
    if LOG_FILE.exists():
        with open(LOG_FILE, 'r', encoding='utf-8') as f:
            log_data = json.load(f)

    # 更新完成列表
    if 'completed' not in log_data:
        log_data['completed'] = {}

    log_data['completed'][crawl_type] = list(completed_ids)
    log_data['last_run'] = {
        'type': crawl_type,
        'time': datetime.now().isoformat(),
        'count': len(results)
    }

    with open(LOG_FILE, 'w', encoding='utf-8') as f:
        json.dump(log_data, f, ensure_ascii=False, indent=2)


def crawl_basic_data(cities: List[Dict], skip_completed: bool = False,
                     completed_ids: set = None) -> List[Dict]:
    """爬取基础数据（百度百科：人口、GDP、面积、城市介绍）"""
    logger.info("=" * 50)
    logger.info("开始爬取基础数据（百度百科）")
    logger.info("=" * 50)

    crawler = BaikeCrawler(delay=2.0)
    results = crawler.crawl_cities(
        cities,
        skip_completed=skip_completed,
        completed_ids=completed_ids
    )

    # 保存原始数据
    output_file = RAW_DATA_DIR / 'basic_data.json'
    crawler.save_results(results, output_file)

    return results


def crawl_weather_data(cities: List[Dict], skip_completed: bool = False,
                       completed_ids: set = None) -> List[Dict]:
    """爬取气候数据"""
    logger.info("=" * 50)
    logger.info("开始爬取气候数据")
    logger.info("=" * 50)

    crawler = WeatherCrawler(delay=2.0)
    results = crawler.crawl_cities(
        cities,
        skip_completed=skip_completed,
        completed_ids=completed_ids
    )

    # 保存原始数据
    output_file = RAW_DATA_DIR / 'weather_data.json'
    crawler.save_results(results, output_file)

    return results


def crawl_housing_data(cities: List[Dict], skip_completed: bool = False,
                       completed_ids: set = None) -> List[Dict]:
    """爬取房价租金数据"""
    logger.info("=" * 50)
    logger.info("开始爬取房价租金数据")
    logger.info("=" * 50)

    crawler = HousingCrawler(delay=3.0)
    results = crawler.crawl_cities(
        cities,
        skip_completed=skip_completed,
        completed_ids=completed_ids
    )

    # 保存原始数据
    output_file = RAW_DATA_DIR / 'housing_data.json'
    crawler.save_results(results, output_file)

    return results


def crawl_quality_data(cities: List[Dict], skip_completed: bool = False,
                       completed_ids: set = None) -> List[Dict]:
    """爬取生活质量数据（AQI、医院、高校）"""
    logger.info("=" * 50)
    logger.info("开始爬取生活质量数据")
    logger.info("=" * 50)

    crawler = QualityCrawler(delay=2.0)
    results = crawler.crawl_cities(
        cities,
        skip_completed=skip_completed,
        completed_ids=completed_ids
    )

    # 保存原始数据
    output_file = RAW_DATA_DIR / 'quality_data.json'
    crawler.save_results(results, output_file)

    return results


def crawl_review_data(cities: List[Dict], skip_completed: bool = False,
                      completed_ids: set = None) -> List[Dict]:
    """爬取用户评论数据（抖音/小红书/知乎/贴吧）"""
    logger.info("=" * 50)
    logger.info("开始爬取用户评论数据")
    logger.info("=" * 50)
    logger.info("注意：社交平台反爬严格，部分数据可能获取失败")

    crawler = ReviewCrawler(delay=5.0)  # 较长延迟避免封IP
    results = crawler.crawl_cities(
        cities,
        skip_completed=skip_completed,
        completed_ids=completed_ids
    )

    # 保存原始数据
    output_file = RAW_DATA_DIR / 'review_data.json'
    crawler.save_results(results, output_file)

    return results


def merge_all_data(cities: List[Dict]) -> List[Dict]:
    """合并所有爬取的数据"""
    logger.info("=" * 50)
    logger.info("合并所有数据")
    logger.info("=" * 50)

    # 读取各类数据
    data_files = {
        'basic': RAW_DATA_DIR / 'basic_data.json',
        'weather': RAW_DATA_DIR / 'weather_data.json',
        'housing': RAW_DATA_DIR / 'housing_data.json',
        'quality': RAW_DATA_DIR / 'quality_data.json',
        'reviews': RAW_DATA_DIR / 'review_data.json',
    }

    all_data = {}
    for data_type, file_path in data_files.items():
        if file_path.exists():
            with open(file_path, 'r', encoding='utf-8') as f:
                data_list = json.load(f)
                for item in data_list:
                    city_id = item.get('city_id')
                    if city_id:
                        if city_id not in all_data:
                            all_data[city_id] = {
                                'city_id': city_id,
                                'city_name': item.get('city_name')
                            }
                        # 合并数据（跳过city_id和city_name字段）
                        for key, value in item.items():
                            if key not in ['city_id', 'city_name', 'error']:
                                all_data[city_id][key] = value
            logger.info(f"  已加载 {data_type}: {len(data_list)} 条")

    # 转换为列表
    merged = list(all_data.values())

    # 保存合并后的数据
    output_file = RAW_DATA_DIR / 'merged_data.json'
    RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    logger.info(f"合并完成，共 {len(merged)} 个城市数据")
    logger.info(f"保存到: {output_file}")

    return merged


def main():
    parser = argparse.ArgumentParser(description='城市数据批量爬取')
    parser.add_argument('--type', '-t', default='all',
                        choices=['all', 'basic', 'weather', 'housing', 'quality', 'reviews', 'merge'],
                        help='爬取类型（reviews需要更长时间）')
    parser.add_argument('--city-id', type=int, help='只处理指定城市ID')
    parser.add_argument('--limit', '-l', type=int, help='限制城市数量')
    parser.add_argument('--skip-completed', '-s', action='store_true',
                        help='跳过已完成的城市')
    parser.add_argument('--dry-run', action='store_true', help='试运行，不实际执行')
    parser.add_argument('--list-type', choices=['china_general', 'china_layflat', 'world'],
                        help='只处理指定榜单类型')

    args = parser.parse_args()

    # 创建目录
    RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    # 加载城市列表
    cities = load_cities()
    logger.info(f"加载城市列表: {len(cities)} 个城市")

    # 过滤城市
    if args.city_id:
        cities = [c for c in cities if c['id'] == args.city_id]
        logger.info(f"过滤指定城市: {len(cities)} 个")

    if args.list_type:
        cities = [c for c in cities if c.get('list_type') == args.list_type]
        logger.info(f"过滤榜单类型 {args.list_type}: {len(cities)} 个")

    if args.limit:
        cities = cities[:args.limit]
        logger.info(f"限制数量: {len(cities)} 个")

    if not cities:
        logger.error("没有要处理的城市")
        return

    if args.dry_run:
        logger.info("\n=== 试运行模式 ===")
        logger.info(f"将处理以下 {len(cities)} 个城市:")
        for city in cities[:20]:
            logger.info(f"  - [{city['id']}] {city['name']} ({city.get('province', '')})")
        if len(cities) > 20:
            logger.info(f"  ... 还有 {len(cities) - 20} 个城市")
        return

    # 执行爬取
    crawl_type = args.type
    results = []

    if crawl_type == 'all':
        # 依次执行所有爬虫
        completed_basic = load_completed_ids('basic') if args.skip_completed else set()
        results_basic = crawl_basic_data(cities, args.skip_completed, completed_basic)
        completed_basic.update(r['city_id'] for r in results_basic if 'error' not in r)
        save_log('basic', results_basic, completed_basic)

        completed_weather = load_completed_ids('weather') if args.skip_completed else set()
        results_weather = crawl_weather_data(cities, args.skip_completed, completed_weather)
        completed_weather.update(r['city_id'] for r in results_weather if 'error' not in r)
        save_log('weather', results_weather, completed_weather)

        completed_housing = load_completed_ids('housing') if args.skip_completed else set()
        results_housing = crawl_housing_data(cities, args.skip_completed, completed_housing)
        completed_housing.update(r['city_id'] for r in results_housing if 'error' not in r)
        save_log('housing', results_housing, completed_housing)

        completed_quality = load_completed_ids('quality') if args.skip_completed else set()
        results_quality = crawl_quality_data(cities, args.skip_completed, completed_quality)
        completed_quality.update(r['city_id'] for r in results_quality if 'error' not in r)
        save_log('quality', results_quality, completed_quality)

        # 合并所有数据
        merge_all_data(cities)

    elif crawl_type == 'basic':
        completed = load_completed_ids('basic') if args.skip_completed else set()
        results = crawl_basic_data(cities, args.skip_completed, completed)
        completed.update(r['city_id'] for r in results if 'error' not in r)
        save_log('basic', results, completed)

    elif crawl_type == 'weather':
        completed = load_completed_ids('weather') if args.skip_completed else set()
        results = crawl_weather_data(cities, args.skip_completed, completed)
        completed.update(r['city_id'] for r in results if 'error' not in r)
        save_log('weather', results, completed)

    elif crawl_type == 'housing':
        completed = load_completed_ids('housing') if args.skip_completed else set()
        results = crawl_housing_data(cities, args.skip_completed, completed)
        completed.update(r['city_id'] for r in results if 'error' not in r)
        save_log('housing', results, completed)

    elif crawl_type == 'quality':
        completed = load_completed_ids('quality') if args.skip_completed else set()
        results = crawl_quality_data(cities, args.skip_completed, completed)
        completed.update(r['city_id'] for r in results if 'error' not in r)
        save_log('quality', results, completed)

    elif crawl_type == 'reviews':
        completed = load_completed_ids('reviews') if args.skip_completed else set()
        results = crawl_review_data(cities, args.skip_completed, completed)
        completed.update(r['city_id'] for r in results if 'error' not in r)
        save_log('reviews', results, completed)

    elif crawl_type == 'merge':
        merge_all_data(cities)

    logger.info("\n" + "=" * 50)
    logger.info("爬取完成!")
    logger.info("=" * 50)


if __name__ == '__main__':
    main()
