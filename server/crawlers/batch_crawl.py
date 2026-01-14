#!/usr/bin/env python3
"""
批量图片爬取脚本
使用 image_downloader.py 批量爬取所有城市的图片

配置文件: crawl_config.json
"""

import json
import os
import subprocess
import time
import argparse
from pathlib import Path
from datetime import datetime

# 配置文件路径
CITIES_FILE = Path(__file__).parent / 'cities.json'
OUTPUT_DIR = Path(__file__).parent / 'raw_images'
LOG_FILE = Path(__file__).parent / 'crawl_log.json'
CONFIG_FILE = Path(__file__).parent / 'crawl_config.json'

# 默认配置（如果配置文件不存在时使用）
DEFAULT_CONFIG = {
    'engine': 'Bing',
    'max_number': 5,
    'delay': 2,
    'conda_env': 'img',
    'search_templates': [
        '{city}地标建筑 著名景点',
        '{city}街头小巷 市井生活',
        '{city}自然风景 美景',
        '{city}老街古巷 历史',
        '{city}夜景 城市灯光',
        '{city}早市菜市场 生活',
        '{city}公园广场 休闲',
        '{city}特色美食街',
    ]
}

def load_config():
    """加载配置文件"""
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
                # 移除注释字段
                config.pop('注释', None)
                # 合并默认配置
                merged = {**DEFAULT_CONFIG, **config}
                print(f"已加载配置文件: {CONFIG_FILE}", flush=True)
                return merged
        except Exception as e:
            print(f"加载配置文件失败: {e}，使用默认配置", flush=True)
    return DEFAULT_CONFIG

# 加载配置
CONFIG = load_config()
DEFAULT_ENGINE = CONFIG['engine']
DEFAULT_DRIVER = 'chrome_headless'  # 使用无头浏览器获取原图，api模式只能获取缩略图
DEFAULT_MAX_NUMBER = CONFIG['max_number']
DEFAULT_DELAY = CONFIG['delay']
DEFAULT_CONDA_ENV = CONFIG['conda_env']
SEARCH_TEMPLATES = CONFIG['search_templates']

def load_cities():
    """加载城市列表"""
    if not CITIES_FILE.exists():
        print(f"错误: 城市列表文件不存在: {CITIES_FILE}", flush=True)
        print("请先运行: python export_cities.py", flush=True)
        return []

    with open(CITIES_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    return data.get('cities', [])

def load_crawl_log():
    """加载爬取日志"""
    if LOG_FILE.exists():
        with open(LOG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'completed': [], 'failed': [], 'last_run': None}

def save_crawl_log(log):
    """保存爬取日志"""
    log['last_run'] = datetime.now().isoformat()
    with open(LOG_FILE, 'w', encoding='utf-8') as f:
        json.dump(log, f, ensure_ascii=False, indent=2)

def crawl_city_images(city, args):
    """
    爬取单个城市的图片

    Args:
        city: 城市信息字典
        args: 命令行参数

    Returns:
        (bool, int): (是否成功, 图片数量)
    """
    city_id = city['id']
    city_name = city['name']
    city_output_dir = OUTPUT_DIR / str(city_id)

    # 创建输出目录
    city_output_dir.mkdir(parents=True, exist_ok=True)

    # 构建搜索关键词
    # 如果指定了模板索引，使用指定的模板；否则轮流使用不同模板
    if hasattr(args, 'template_index') and args.template_index is not None:
        template_index = args.template_index % len(SEARCH_TEMPLATES)
    else:
        template_index = city_id % len(SEARCH_TEMPLATES)
    keyword = SEARCH_TEMPLATES[template_index].format(city=city_name)

    print(f"\n[{city_id}] 正在爬取: {city_name}", flush=True)
    print(f"    关键词: {keyword}", flush=True)
    print(f"    输出目录: {city_output_dir}", flush=True)

    # 使用shell命令，激活conda环境后执行
    shell_cmd = f'''
source $(conda info --base)/etc/profile.d/conda.sh
conda activate {args.conda_env}
python "{args.downloader}" "{keyword}" --engine {args.engine} --driver {args.driver} --max-number {args.max_number} --output "{city_output_dir}"
'''

    try:
        # 执行爬取
        result = subprocess.run(
            shell_cmd,
            shell=True,
            executable='/bin/bash',
            capture_output=True,
            text=True,
            timeout=120  # 2分钟超时
        )

        # 统计下载的图片数量（不管返回码，都检查实际下载了多少）
        images = list(city_output_dir.glob('*.jpg')) + \
                 list(city_output_dir.glob('*.jpeg')) + \
                 list(city_output_dir.glob('*.png')) + \
                 list(city_output_dir.glob('*.webp'))

        if len(images) > 0:
            print(f"    成功下载 {len(images)} 张图片", flush=True)
            return True, len(images)
        else:
            print(f"    爬取失败: {result.stderr[:200] if result.stderr else '无图片'}", flush=True)
            return False, 0

    except subprocess.TimeoutExpired:
        print(f"    超时!", flush=True)
        return False, 0
    except Exception as e:
        print(f"    错误: {e}", flush=True)
        return False, 0

def show_templates():
    """显示所有关键词模板"""
    print("\n当前关键词模板:", flush=True)
    print("-" * 50, flush=True)
    for i, template in enumerate(SEARCH_TEMPLATES):
        print(f"  [{i}] {template}", flush=True)
    print("-" * 50, flush=True)
    print(f"共 {len(SEARCH_TEMPLATES)} 个模板", flush=True)
    print(f"\n使用 --template-index N 可指定使用特定模板", flush=True)
    print(f"配置文件: {CONFIG_FILE}", flush=True)

def clear_crawl_log():
    """清除爬取日志"""
    if LOG_FILE.exists():
        os.remove(LOG_FILE)
        print(f"已清除爬取日志: {LOG_FILE}", flush=True)
    else:
        print("爬取日志不存在", flush=True)

def batch_crawl(args):
    """批量爬取所有城市图片"""

    # 显示模板
    if args.show_templates:
        show_templates()
        return

    # 清除日志
    if args.clear_log:
        clear_crawl_log()
        return

    cities = load_cities()
    if not cities:
        return

    # 强制模式：清除完成记录
    if args.force:
        print("强制模式：清除已完成记录，重新爬取所有城市", flush=True)
        clear_crawl_log()

    log = load_crawl_log()
    completed_ids = set(log['completed'])

    # 筛选需要爬取的城市
    if args.only_missing:
        # 只爬取图片不足的城市
        cities = [c for c in cities if c['image_count'] < 3]
        print(f"筛选出 {len(cities)} 个图片不足的城市", flush=True)

    if args.skip_completed:
        # 跳过已完成的
        cities = [c for c in cities if c['id'] not in completed_ids]
        print(f"跳过已完成的城市后，剩余 {len(cities)} 个", flush=True)

    if args.list_type:
        # 按榜单类型筛选
        cities = [c for c in cities if c['list_type'] == args.list_type]
        print(f"筛选 {args.list_type} 榜单，共 {len(cities)} 个城市", flush=True)

    if args.city_id:
        # 只爬取指定城市ID
        cities = [c for c in cities if c['id'] == args.city_id]
        if not cities:
            print(f"错误: 未找到城市ID {args.city_id}", flush=True)
            return
        print(f"只爬取城市ID: {args.city_id} ({cities[0]['name']})", flush=True)

    if args.limit:
        cities = cities[:args.limit]
        print(f"限制为前 {args.limit} 个城市", flush=True)

    print(f"\n即将爬取 {len(cities)} 个城市的图片", flush=True)
    print(f"使用引擎: {args.engine}", flush=True)
    print(f"每城市图片数: {args.max_number}", flush=True)
    print(f"输出目录: {OUTPUT_DIR}", flush=True)
    if args.template_index is not None:
        print(f"使用模板: [{args.template_index}] {SEARCH_TEMPLATES[args.template_index % len(SEARCH_TEMPLATES)]}", flush=True)
    else:
        print(f"关键词模板: 轮流使用 {len(SEARCH_TEMPLATES)} 个模板", flush=True)
    print("-" * 50, flush=True)

    if args.dry_run:
        print("\n[试运行模式] 以下城市将被爬取:", flush=True)
        for city in cities:
            print(f"  - [{city['id']}] {city['name']} ({city['province'] or city['country']})", flush=True)
        return

    # 开始爬取
    success_count = 0
    fail_count = 0
    total_images = 0

    for i, city in enumerate(cities, 1):
        print(f"\n进度: {i}/{len(cities)}", flush=True)

        success, image_count = crawl_city_images(city, args)

        if success:
            success_count += 1
            total_images += image_count
            log['completed'].append(city['id'])
        else:
            fail_count += 1
            log['failed'].append({
                'id': city['id'],
                'name': city['name'],
                'time': datetime.now().isoformat()
            })

        # 保存日志
        save_crawl_log(log)

        # 延迟，避免请求过快
        if i < len(cities):
            time.sleep(args.delay)

    # 输出统计
    print("\n" + "=" * 50, flush=True)
    print("爬取完成!", flush=True)
    print(f"成功: {success_count} 个城市", flush=True)
    print(f"失败: {fail_count} 个城市", flush=True)
    print(f"共下载: {total_images} 张图片", flush=True)
    print(f"日志文件: {LOG_FILE}", flush=True)

def main():
    parser = argparse.ArgumentParser(description='批量爬取城市图片')

    parser.add_argument('--downloader', '-d',
                        default='image_downloader.py',
                        help='image_downloader.py 的路径')

    parser.add_argument('--engine', '-e',
                        default=DEFAULT_ENGINE,
                        choices=['Google', 'Baidu', 'Bing'],
                        help='搜索引擎')

    parser.add_argument('--driver',
                        default=DEFAULT_DRIVER,
                        help='下载驱动')

    parser.add_argument('--max-number', '-n',
                        type=int,
                        default=DEFAULT_MAX_NUMBER,
                        help='每个城市爬取的图片数量')

    parser.add_argument('--delay',
                        type=float,
                        default=DEFAULT_DELAY,
                        help='每个城市之间的延迟(秒)')

    parser.add_argument('--only-missing', '-m',
                        action='store_true',
                        help='只爬取图片不足的城市(图片<3张)')

    parser.add_argument('--skip-completed', '-s',
                        action='store_true',
                        help='跳过已完成的城市')

    parser.add_argument('--list-type', '-t',
                        choices=['china_general', 'china_layflat', 'world'],
                        help='只爬取指定榜单的城市')

    parser.add_argument('--limit', '-l',
                        type=int,
                        help='限制爬取的城市数量')

    parser.add_argument('--dry-run',
                        action='store_true',
                        help='试运行，不实际爬取')

    parser.add_argument('--conda-env',
                        default=DEFAULT_CONDA_ENV,
                        help=f'Conda环境名称 (默认: {DEFAULT_CONDA_ENV})')

    parser.add_argument('--force', '-f',
                        action='store_true',
                        help='强制重新爬取所有城市（清除完成记录）')

    parser.add_argument('--clear-log',
                        action='store_true',
                        help='仅清除爬取日志，不执行爬取')

    parser.add_argument('--template-index', '-i',
                        type=int,
                        help='指定使用的关键词模板索引（0-N），用于针对性爬取')

    parser.add_argument('--show-templates',
                        action='store_true',
                        help='显示所有关键词模板')

    parser.add_argument('--city-id',
                        type=int,
                        help='只爬取指定城市ID')

    args = parser.parse_args()
    batch_crawl(args)

if __name__ == '__main__':
    main()
