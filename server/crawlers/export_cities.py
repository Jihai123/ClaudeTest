#!/usr/bin/env python3
"""
导出城市列表脚本
从数据库导出所有城市的ID和名称，用于批量爬取图片
"""

import sqlite3
import json
import os
from pathlib import Path

# 数据库路径
DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent.parent.parent / 'database.sqlite'))
OUTPUT_FILE = Path(__file__).parent / 'cities.json'

def export_cities():
    """导出城市列表"""
    conn = sqlite3.connect(DB_PATH)
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
    export_cities()
