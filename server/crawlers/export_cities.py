#!/usr/bin/env python3
"""
导出城市列表脚本
从数据库导出所有城市的ID和名称，用于批量爬取图片

用法:
    python export_cities.py                           # 使用默认数据库
    python export_cities.py --db /path/to/database.sqlite  # 指定数据库路径
    python export_cities.py --db remote               # 使用REMOTE_DB_PATH环境变量
"""

import sqlite3
import json
import os
import argparse
from pathlib import Path

# 加载.env文件
def load_env():
    env_file = Path(__file__).parent.parent.parent / '.env'
    if env_file.exists():
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ.setdefault(key.strip(), value.strip())

load_env()

# 配置
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
OUTPUT_FILE = SCRIPT_DIR / 'cities.json'

def get_db_path(db_arg=None):
    """获取数据库路径"""
    if db_arg:
        if db_arg == 'remote':
            # 使用远程数据库路径（从环境变量读取）
            remote_path = os.environ.get('REMOTE_DB_PATH')
            if remote_path:
                print(f"使用远程数据库: {remote_path}")
                return remote_path
            else:
                print("警告: REMOTE_DB_PATH 未设置，使用默认数据库")
        elif os.path.exists(db_arg):
            print(f"使用指定数据库: {db_arg}")
            return db_arg
        else:
            print(f"警告: 数据库文件不存在 {db_arg}")

    # 默认数据库路径
    _db_path = os.environ.get('DB_PATH', './database.sqlite')
    if _db_path.startswith('./'):
        db_path = str(PROJECT_ROOT / _db_path[2:])
    else:
        db_path = _db_path

    print(f"使用默认数据库: {db_path}")
    return db_path

def export_cities(db_path):
    """导出城市列表"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 查询所有城市
    cursor.execute('''
        SELECT
            c.id,
            c.name,
            c.name_en,
            c.province,
            c.country,
            c.list_type,
            (SELECT COUNT(*) FROM city_images ci WHERE ci.city_id = c.id AND ci.status = 'approved') as image_count
        FROM cities c
        ORDER BY c.list_type, c.id
    ''')

    cities = []
    for row in cursor.fetchall():
        cities.append({
            'id': row[0],
            'name': row[1],
            'name_en': row[2],
            'province': row[3],
            'country': row[4],
            'list_type': row[5],
            'image_count': row[6]
        })

    conn.close()

    # 统计信息
    total = len(cities)
    china_general = len([c for c in cities if c['list_type'] == 'china_general'])
    china_layflat = len([c for c in cities if c['list_type'] == 'china_layflat'])
    world = len([c for c in cities if c['list_type'] == 'world'])
    need_images = len([c for c in cities if c['image_count'] < 3])

    print(f"城市总数: {total}")
    print(f"  - 中国综合榜: {china_general}")
    print(f"  - 中国躺平榜: {china_layflat}")
    print(f"  - 世界榜: {world}")
    print(f"需要爬取图片的城市 (图片<3张): {need_images}")

    # 保存到JSON
    output = {
        'total': total,
        'stats': {
            'china_general': china_general,
            'china_layflat': china_layflat,
            'world': world,
            'need_images': need_images
        },
        'cities': cities
    }

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n城市列表已导出到: {OUTPUT_FILE}")
    return cities

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='导出城市列表')
    parser.add_argument('--db', help='数据库路径 (或 "remote" 使用远程数据库)')
    args = parser.parse_args()

    db_path = get_db_path(args.db)
    export_cities(db_path)
