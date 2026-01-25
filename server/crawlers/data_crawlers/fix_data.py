#!/usr/bin/env python3
"""
数据修复脚本
修复已知的数据问题，如单位错误、缺失字段等

用法:
    python fix_data.py --check           # 检查问题
    python fix_data.py --fix-population  # 修复人口单位
    python fix_data.py --fill-coords     # 填充经纬度
    python fix_data.py --fill-english    # 填充英文名
    python fix_data.py --all             # 执行全部修复
"""

import argparse
import os
import sqlite3
import logging
from pathlib import Path
from typing import Dict, List

# 配置
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent

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

# 数据库路径
_db_path = os.environ.get('DB_PATH', './database.sqlite')
if _db_path.startswith('./'):
    DB_PATH = str(PROJECT_ROOT / _db_path[2:])
else:
    DB_PATH = _db_path

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('FixData')

# 城市参考数据（用于填充缺失字段）
CITY_REFERENCE_DATA = {
    '成都': {
        'name_en': 'Chengdu',
        'latitude': 30.5728,
        'longitude': 104.0668,
        'slogan': '成都，一座来了就不想走的城市',
    },
    '杭州': {
        'name_en': 'Hangzhou',
        'latitude': 30.2741,
        'longitude': 120.1551,
        'slogan': '人间天堂，品质杭州',
    },
    '青岛': {
        'name_en': 'Qingdao',
        'latitude': 36.0671,
        'longitude': 120.3826,
        'slogan': '红瓦绿树、碧海蓝天',
    },
    '厦门': {
        'name_en': 'Xiamen',
        'latitude': 24.4795,
        'longitude': 118.0894,
        'slogan': '海上花园，温馨厦门',
    },
    '大连': {
        'name_en': 'Dalian',
        'latitude': 38.9140,
        'longitude': 121.6147,
        'slogan': '浪漫之都，时尚大连',
    },
    '昆明': {
        'name_en': 'Kunming',
        'latitude': 25.0389,
        'longitude': 102.7183,
        'slogan': '春城昆明，四季如春',
    },
    '苏州': {
        'name_en': 'Suzhou',
        'latitude': 31.2990,
        'longitude': 120.5853,
        'slogan': '人间天堂，东方威尼斯',
    },
    '珠海': {
        'name_en': 'Zhuhai',
        'latitude': 22.2710,
        'longitude': 113.5767,
        'slogan': '浪漫之城，百岛之市',
    },
    '威海': {
        'name_en': 'Weihai',
        'latitude': 37.5091,
        'longitude': 122.1209,
        'slogan': '走遍四海，还是威海',
    },
    '南京': {
        'name_en': 'Nanjing',
        'latitude': 32.0603,
        'longitude': 118.7969,
        'slogan': '六朝古都，博爱之都',
    },
    # 其他热门城市
    '北京': {
        'name_en': 'Beijing',
        'latitude': 39.9042,
        'longitude': 116.4074,
        'slogan': '首善之区，千年古都',
    },
    '上海': {
        'name_en': 'Shanghai',
        'latitude': 31.2304,
        'longitude': 121.4737,
        'slogan': '魔都上海，东方明珠',
    },
    '深圳': {
        'name_en': 'Shenzhen',
        'latitude': 22.5431,
        'longitude': 114.0579,
        'slogan': '来了就是深圳人',
    },
    '广州': {
        'name_en': 'Guangzhou',
        'latitude': 23.1291,
        'longitude': 113.2644,
        'slogan': '食在广州，千年商都',
    },
    '西安': {
        'name_en': 'Xi\'an',
        'latitude': 34.3416,
        'longitude': 108.9398,
        'slogan': '千年古都，丝路起点',
    },
    '重庆': {
        'name_en': 'Chongqing',
        'latitude': 29.5630,
        'longitude': 106.5516,
        'slogan': '山城重庆，魔幻8D城市',
    },
    '武汉': {
        'name_en': 'Wuhan',
        'latitude': 30.5928,
        'longitude': 114.3055,
        'slogan': '江城武汉，九省通衢',
    },
    '长沙': {
        'name_en': 'Changsha',
        'latitude': 28.2282,
        'longitude': 112.9388,
        'slogan': '山水洲城，快乐长沙',
    },
    '三亚': {
        'name_en': 'Sanya',
        'latitude': 18.2528,
        'longitude': 109.5119,
        'slogan': '热带天堂，度假胜地',
    },
    '海口': {
        'name_en': 'Haikou',
        'latitude': 20.0440,
        'longitude': 110.1999,
        'slogan': '椰城海口，阳光海岸',
    },
    '丽江': {
        'name_en': 'Lijiang',
        'latitude': 26.8721,
        'longitude': 100.2299,
        'slogan': '世界文化遗产，高原姑苏',
    },
    '大理': {
        'name_en': 'Dali',
        'latitude': 25.6065,
        'longitude': 100.2679,
        'slogan': '风花雪月，诗意大理',
    },
    '西双版纳': {
        'name_en': 'Xishuangbanna',
        'latitude': 22.0017,
        'longitude': 100.7991,
        'slogan': '热带雨林，傣乡风情',
    },
    '桂林': {
        'name_en': 'Guilin',
        'latitude': 25.2742,
        'longitude': 110.2900,
        'slogan': '桂林山水甲天下',
    },
}


def check_issues(db_path: str = DB_PATH) -> Dict:
    """检查数据问题"""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    issues = {
        'population_unit': [],
        'missing_coords': [],
        'missing_english': [],
        'missing_slogan': [],
    }

    cursor = conn.execute('SELECT id, name, population, latitude, longitude, name_en, slogan FROM cities')
    cities = cursor.fetchall()

    for city in cities:
        name = city['name']

        # 检查人口单位
        pop = city['population']
        if pop and pop > 5000:  # 如果超过5000，可能是原始人数而非万人
            issues['population_unit'].append({
                'id': city['id'],
                'name': name,
                'current': pop,
                'should_be': round(pop / 10000, 2)
            })

        # 检查经纬度
        if not city['latitude'] or not city['longitude']:
            issues['missing_coords'].append({
                'id': city['id'],
                'name': name,
                'has_reference': name in CITY_REFERENCE_DATA
            })

        # 检查英文名
        if not city['name_en']:
            issues['missing_english'].append({
                'id': city['id'],
                'name': name,
                'has_reference': name in CITY_REFERENCE_DATA
            })

        # 检查slogan
        if not city['slogan']:
            issues['missing_slogan'].append({
                'id': city['id'],
                'name': name,
                'has_reference': name in CITY_REFERENCE_DATA
            })

    conn.close()
    return issues


def fix_population_unit(db_path: str = DB_PATH, dry_run: bool = False) -> int:
    """修复人口单位（从原始人数转换为万人）"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 查找需要修复的城市
    cursor.execute('SELECT id, name, population FROM cities WHERE population > 5000')
    cities = cursor.fetchall()

    fixed = 0
    for city_id, name, pop in cities:
        new_pop = round(pop / 10000, 2)  # 转换为万人

        if dry_run:
            logger.info(f"  [DRY-RUN] {name}: {pop} → {new_pop} 万人")
        else:
            cursor.execute('UPDATE cities SET population = ? WHERE id = ?', (new_pop, city_id))
            logger.info(f"  修复 {name}: {pop} → {new_pop} 万人")

        fixed += 1

    if not dry_run:
        conn.commit()

    conn.close()
    return fixed


def fill_coordinates(db_path: str = DB_PATH, dry_run: bool = False) -> int:
    """填充缺失的经纬度"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute('SELECT id, name FROM cities WHERE latitude IS NULL OR longitude IS NULL')
    cities = cursor.fetchall()

    filled = 0
    for city_id, name in cities:
        if name in CITY_REFERENCE_DATA:
            ref = CITY_REFERENCE_DATA[name]
            lat = ref.get('latitude')
            lng = ref.get('longitude')

            if lat and lng:
                if dry_run:
                    logger.info(f"  [DRY-RUN] {name}: 添加坐标 ({lat}, {lng})")
                else:
                    cursor.execute('UPDATE cities SET latitude = ?, longitude = ? WHERE id = ?',
                                 (lat, lng, city_id))
                    logger.info(f"  填充 {name}: ({lat}, {lng})")
                filled += 1
        else:
            logger.warning(f"  跳过 {name}: 无参考数据")

    if not dry_run:
        conn.commit()

    conn.close()
    return filled


def fill_english_names(db_path: str = DB_PATH, dry_run: bool = False) -> int:
    """填充缺失的英文名"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("SELECT id, name FROM cities WHERE name_en IS NULL OR name_en = ''")
    cities = cursor.fetchall()

    filled = 0
    for city_id, name in cities:
        if name in CITY_REFERENCE_DATA:
            name_en = CITY_REFERENCE_DATA[name].get('name_en')

            if name_en:
                if dry_run:
                    logger.info(f"  [DRY-RUN] {name}: 添加英文名 '{name_en}'")
                else:
                    cursor.execute('UPDATE cities SET name_en = ? WHERE id = ?', (name_en, city_id))
                    logger.info(f"  填充 {name}: {name_en}")
                filled += 1
        else:
            logger.warning(f"  跳过 {name}: 无参考数据")

    if not dry_run:
        conn.commit()

    conn.close()
    return filled


def fill_slogans(db_path: str = DB_PATH, dry_run: bool = False) -> int:
    """填充缺失的slogan"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("SELECT id, name FROM cities WHERE slogan IS NULL OR slogan = ''")
    cities = cursor.fetchall()

    filled = 0
    for city_id, name in cities:
        if name in CITY_REFERENCE_DATA:
            slogan = CITY_REFERENCE_DATA[name].get('slogan')

            if slogan:
                if dry_run:
                    logger.info(f"  [DRY-RUN] {name}: 添加slogan '{slogan}'")
                else:
                    cursor.execute('UPDATE cities SET slogan = ? WHERE id = ?', (slogan, city_id))
                    logger.info(f"  填充 {name}: {slogan}")
                filled += 1
        else:
            logger.warning(f"  跳过 {name}: 无参考数据")

    if not dry_run:
        conn.commit()

    conn.close()
    return filled


def main():
    parser = argparse.ArgumentParser(description='数据修复工具')
    parser.add_argument('--check', action='store_true', help='检查问题')
    parser.add_argument('--fix-population', action='store_true', help='修复人口单位')
    parser.add_argument('--fill-coords', action='store_true', help='填充经纬度')
    parser.add_argument('--fill-english', action='store_true', help='填充英文名')
    parser.add_argument('--fill-slogans', action='store_true', help='填充slogan')
    parser.add_argument('--all', action='store_true', help='执行全部修复')
    parser.add_argument('--dry-run', action='store_true', help='试运行')

    args = parser.parse_args()

    if args.check or not any([args.fix_population, args.fill_coords, args.fill_english,
                               args.fill_slogans, args.all]):
        logger.info("检查数据问题...")
        issues = check_issues()

        print("\n数据问题汇总")
        print("=" * 60)

        if issues['population_unit']:
            print(f"\n人口单位问题 ({len(issues['population_unit'])}个):")
            for item in issues['population_unit'][:5]:
                print(f"  - {item['name']}: {item['current']} → 应为 {item['should_be']} 万人")
            if len(issues['population_unit']) > 5:
                print(f"  ... 还有 {len(issues['population_unit']) - 5} 个")

        if issues['missing_coords']:
            print(f"\n缺少经纬度 ({len(issues['missing_coords'])}个):")
            for item in issues['missing_coords'][:5]:
                status = "✓ 有参考数据" if item['has_reference'] else "✗ 无参考数据"
                print(f"  - {item['name']} ({status})")

        if issues['missing_english']:
            print(f"\n缺少英文名 ({len(issues['missing_english'])}个)")

        if issues['missing_slogan']:
            print(f"\n缺少slogan ({len(issues['missing_slogan'])}个)")

        print("\n" + "=" * 60)
        print("使用 --all 执行全部修复，或使用 --dry-run 预览修复内容")
        return

    if args.all or args.fix_population:
        logger.info("\n修复人口单位...")
        fixed = fix_population_unit(dry_run=args.dry_run)
        logger.info(f"完成: 修复了 {fixed} 条记录")

    if args.all or args.fill_coords:
        logger.info("\n填充经纬度...")
        filled = fill_coordinates(dry_run=args.dry_run)
        logger.info(f"完成: 填充了 {filled} 条记录")

    if args.all or args.fill_english:
        logger.info("\n填充英文名...")
        filled = fill_english_names(dry_run=args.dry_run)
        logger.info(f"完成: 填充了 {filled} 条记录")

    if args.all or args.fill_slogans:
        logger.info("\n填充slogan...")
        filled = fill_slogans(dry_run=args.dry_run)
        logger.info(f"完成: 填充了 {filled} 条记录")

    logger.info("\n全部修复完成!")


if __name__ == '__main__':
    main()
