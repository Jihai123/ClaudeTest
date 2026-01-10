#!/usr/bin/env python3
"""
香港城市图片端到端测试
完整流程：爬取 → 筛选 → 导入数据库 → 验证API
"""

import os
import sys
import json
import sqlite3
import subprocess
import argparse
from pathlib import Path
from datetime import datetime

# 配置
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DB_PATH = os.environ.get('DB_PATH', str(PROJECT_ROOT / 'database.sqlite'))

# 香港城市ID
HONGKONG_CITY_ID = 2
HONGKONG_NAME = "香港"

# 测试目录
TEST_RAW_DIR = SCRIPT_DIR / 'test_raw'
TEST_FILTERED_DIR = SCRIPT_DIR / 'test_filtered'

def step1_crawl_images(downloader_path, max_number=5):
    """步骤1: 爬取香港图片"""
    print("\n" + "="*50)
    print("步骤1: 爬取香港图片")
    print("="*50)

    TEST_RAW_DIR.mkdir(parents=True, exist_ok=True)
    city_dir = TEST_RAW_DIR / str(HONGKONG_CITY_ID)
    city_dir.mkdir(parents=True, exist_ok=True)

    keyword = f"{HONGKONG_NAME}风景"
    print(f"搜索关键词: {keyword}")
    print(f"输出目录: {city_dir}")

    cmd = [
        'python', downloader_path,
        keyword,
        '--engine', 'Google',
        '--driver', 'api',
        '--max-number', str(max_number),
        '--output', str(city_dir)
    ]

    print(f"执行命令: {' '.join(cmd)}")

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            print(f"警告: 爬取可能有问题: {result.stderr}")
    except Exception as e:
        print(f"错误: {e}")
        return False

    # 统计图片
    images = list(city_dir.glob('*.jpg')) + list(city_dir.glob('*.jpeg')) + \
             list(city_dir.glob('*.png')) + list(city_dir.glob('*.webp'))
    print(f"下载完成: {len(images)} 张图片")

    for img in images:
        print(f"  - {img.name} ({img.stat().st_size/1024:.1f}KB)")

    return len(images) > 0


def step2_filter_images():
    """步骤2: 筛选图片"""
    print("\n" + "="*50)
    print("步骤2: 筛选图片")
    print("="*50)

    try:
        from PIL import Image
    except ImportError:
        print("错误: 请安装 Pillow: pip install Pillow")
        return False

    city_raw_dir = TEST_RAW_DIR / str(HONGKONG_CITY_ID)
    city_filtered_dir = TEST_FILTERED_DIR / str(HONGKONG_CITY_ID)
    city_filtered_dir.mkdir(parents=True, exist_ok=True)

    images = list(city_raw_dir.glob('*.jpg')) + list(city_raw_dir.glob('*.jpeg')) + \
             list(city_raw_dir.glob('*.png')) + list(city_raw_dir.glob('*.webp'))

    passed = []
    for img_path in images:
        try:
            with Image.open(img_path) as img:
                w, h = img.size
                size_kb = img_path.stat().st_size / 1024

                # 筛选条件：宽>=800, 高>=500, 文件>=50KB
                if w >= 800 and h >= 500 and size_kb >= 50:
                    passed.append((img_path, w, h, size_kb))
                    print(f"  ✓ {img_path.name}: {w}x{h}, {size_kb:.1f}KB")
                else:
                    print(f"  ✗ {img_path.name}: {w}x{h}, {size_kb:.1f}KB (不符合条件)")
        except Exception as e:
            print(f"  ✗ {img_path.name}: 无法读取 - {e}")

    # 复制通过的图片
    import shutil
    for i, (img_path, w, h, size_kb) in enumerate(passed[:5], 1):  # 最多5张
        dst = city_filtered_dir / f"{HONGKONG_CITY_ID}_{i}{img_path.suffix}"
        shutil.copy2(img_path, dst)
        print(f"  复制: {dst.name}")

    print(f"\n筛选完成: {len(passed)} 张通过，复制 {min(len(passed), 5)} 张")
    return len(passed) > 0


def step3_import_to_db():
    """步骤3: 导入数据库（本地路径模式）"""
    print("\n" + "="*50)
    print("步骤3: 导入数据库")
    print("="*50)

    city_filtered_dir = TEST_FILTERED_DIR / str(HONGKONG_CITY_ID)
    images = list(city_filtered_dir.glob('*.*'))

    if not images:
        print("错误: 没有找到筛选后的图片")
        return False

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    imported = 0
    for img_path in images:
        # 使用本地路径（测试用）
        # 实际生产环境会上传到R2
        image_url = f"/uploads/city_images/{HONGKONG_CITY_ID}/{img_path.name}"
        alt_text = f"{HONGKONG_NAME}风景图"

        # 检查是否已存在
        cursor.execute(
            'SELECT id FROM city_images WHERE city_id = ? AND image_url = ?',
            [HONGKONG_CITY_ID, image_url]
        )
        if cursor.fetchone():
            print(f"  跳过(已存在): {img_path.name}")
            continue

        # 插入记录
        cursor.execute('''
            INSERT INTO city_images (
                city_id, image_url, thumbnail_url, alt_text, image_type,
                tags, upload_source, weight, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', [
            HONGKONG_CITY_ID,
            image_url,
            image_url,
            alt_text,
            'crawled',
            '[]',
            'crawler_test',
            20,
            'approved',
            datetime.now().isoformat()
        ])

        print(f"  导入: {img_path.name} -> {image_url}")
        imported += 1

    conn.commit()
    conn.close()

    print(f"\n导入完成: {imported} 张图片")
    return imported > 0


def step4_verify():
    """步骤4: 验证数据库和API"""
    print("\n" + "="*50)
    print("步骤4: 验证结果")
    print("="*50)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 查询香港的图片
    cursor.execute('''
        SELECT id, image_url, status, created_at
        FROM city_images
        WHERE city_id = ?
        ORDER BY created_at DESC
    ''', [HONGKONG_CITY_ID])

    images = cursor.fetchall()
    conn.close()

    print(f"\n香港(ID={HONGKONG_CITY_ID})的图片记录:")
    print("-" * 60)

    if not images:
        print("  (无图片记录)")
        return False

    for img in images:
        print(f"  ID: {img[0]}")
        print(f"  URL: {img[1]}")
        print(f"  状态: {img[2]}")
        print(f"  创建时间: {img[3]}")
        print()

    print(f"共 {len(images)} 张图片")
    print("\n" + "="*50)
    print("验证完成！")
    print("="*50)
    print(f"""
下一步：
1. 启动服务器: cd {PROJECT_ROOT} && npm start
2. 访问API验证: curl http://localhost:3000/api/cities/{HONGKONG_CITY_ID}
3. 在小程序中打开香港城市详情页查看图片

注意：当前使用的是本地路径，小程序可能无法直接显示。
生产环境请配置R2上传，运行:
  python import_to_db.py  (不带 --local-only)
""")
    return True


def main():
    parser = argparse.ArgumentParser(description='香港城市图片端到端测试')
    parser.add_argument('--downloader', '-d',
                        default='image_downloader.py',
                        help='image_downloader.py 的路径')
    parser.add_argument('--skip-crawl', action='store_true',
                        help='跳过爬取步骤（使用已有图片）')
    parser.add_argument('--max-number', '-n', type=int, default=5,
                        help='爬取图片数量')

    args = parser.parse_args()

    print("\n" + "#"*50)
    print("#  香港城市图片 - 端到端测试")
    print("#"*50)
    print(f"\n城市: {HONGKONG_NAME} (ID: {HONGKONG_CITY_ID})")
    print(f"数据库: {DB_PATH}")

    # 步骤1: 爬取
    if not args.skip_crawl:
        if not step1_crawl_images(args.downloader, args.max_number):
            print("\n步骤1失败，但继续尝试后续步骤...")
    else:
        print("\n跳过步骤1（爬取）")

    # 步骤2: 筛选
    if not step2_filter_images():
        print("\n步骤2失败: 没有符合条件的图片")
        print("请手动下载几张香港图片到:")
        print(f"  {TEST_RAW_DIR / str(HONGKONG_CITY_ID)}/")
        return

    # 步骤3: 导入数据库
    if not step3_import_to_db():
        print("\n步骤3失败")
        return

    # 步骤4: 验证
    step4_verify()


if __name__ == '__main__':
    main()
