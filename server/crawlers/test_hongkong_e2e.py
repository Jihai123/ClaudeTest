#!/usr/bin/env python3
"""
香港城市图片端到端测试
完整流程：爬取 → 筛选 → 上传R2 → 导入数据库 → 验证API
"""

import os
import sys
import json
import sqlite3
import subprocess
import argparse
import uuid
from pathlib import Path
from datetime import datetime

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
DB_PATH = os.environ.get('DB_PATH', str(PROJECT_ROOT / 'database.sqlite'))

# R2配置
R2_ACCOUNT_ID = os.environ.get('R2_ACCOUNT_ID')
R2_ACCESS_KEY_ID = os.environ.get('R2_ACCESS_KEY_ID')
R2_SECRET_ACCESS_KEY = os.environ.get('R2_SECRET_ACCESS_KEY')
R2_BUCKET_NAME = os.environ.get('R2_BUCKET_NAME')
R2_PUBLIC_DOMAIN = os.environ.get('R2_PUBLIC_DOMAIN', '')

# 香港城市ID
HONGKONG_CITY_ID = 2
HONGKONG_NAME = "香港"

# 测试目录
TEST_RAW_DIR = SCRIPT_DIR / 'test_raw'
TEST_FILTERED_DIR = SCRIPT_DIR / 'test_filtered'

def step1_crawl_images(downloader_path, max_number=5, engine='Bing', conda_env='img'):
    """步骤1: 爬取香港图片"""
    print("\n" + "="*50)
    print("步骤1: 爬取香港图片")
    print("="*50)

    TEST_RAW_DIR.mkdir(parents=True, exist_ok=True)
    city_dir = TEST_RAW_DIR / str(HONGKONG_CITY_ID)
    city_dir.mkdir(parents=True, exist_ok=True)

    # 接地气的搜索关键词：街头、小巷、生活气息
    keyword = f"{HONGKONG_NAME}街头小巷"
    print(f"搜索关键词: {keyword}")
    print(f"输出目录: {city_dir}")
    print(f"搜索引擎: {engine}")
    print(f"Conda环境: {conda_env}")

    # 使用shell命令，先激活conda环境
    shell_cmd = f'''
source $(conda info --base)/etc/profile.d/conda.sh
conda activate {conda_env}
python "{downloader_path}" "{keyword}" --engine {engine} --driver api --max-number {max_number} --output "{city_dir}"
'''

    print(f"执行命令:\n  conda activate {conda_env}")
    print(f"  python {downloader_path} \"{keyword}\" --engine {engine} --driver api --max-number {max_number} --output {city_dir}")

    try:
        result = subprocess.run(
            shell_cmd,
            shell=True,
            executable='/bin/bash',
            capture_output=True,
            text=True,
            timeout=120
        )
        if result.returncode != 0:
            print(f"警告: 爬取可能有问题: {result.stderr}")
        if result.stdout:
            print(f"输出: {result.stdout}")
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


def upload_to_r2(file_path):
    """上传文件到R2，返回公开URL"""
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        print("错误: 请安装 boto3: pip install boto3")
        return None

    if not all([R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME]):
        print("错误: R2配置不完整")
        return None

    s3 = boto3.client(
        's3',
        endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=Config(signature_version='s3v4', s3={'addressing_style': 'path'})
    )

    # 生成唯一文件名
    ext = Path(file_path).suffix
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    random_str = uuid.uuid4().hex[:8]
    key = f"city_images/{HONGKONG_CITY_ID}/{timestamp}_{random_str}{ext}"

    # 获取MIME类型
    import mimetypes
    content_type = mimetypes.guess_type(str(file_path))[0] or 'image/jpeg'

    # 上传
    with open(file_path, 'rb') as f:
        s3.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=key,
            Body=f,
            ContentType=content_type
        )

    # 构建公开URL
    if R2_PUBLIC_DOMAIN:
        domain = R2_PUBLIC_DOMAIN.replace('https://', '').replace('http://', '')
        return f"https://{domain}/{key}"
    else:
        return f"https://{R2_BUCKET_NAME}.{R2_ACCOUNT_ID}.r2.cloudflarestorage.com/{key}"


def step3_import_to_db():
    """步骤3: 上传R2并导入数据库"""
    print("\n" + "="*50)
    print("步骤3: 上传R2并导入数据库")
    print("="*50)

    # 检查R2配置
    print(f"R2配置检查:")
    print(f"  Account ID: {'✓' if R2_ACCOUNT_ID else '✗'}")
    print(f"  Access Key: {'✓' if R2_ACCESS_KEY_ID else '✗'}")
    print(f"  Secret Key: {'✓' if R2_SECRET_ACCESS_KEY else '✗'}")
    print(f"  Bucket: {R2_BUCKET_NAME or '✗'}")
    print(f"  Public Domain: {R2_PUBLIC_DOMAIN or '(使用默认)'}")

    if not all([R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME]):
        print("\n错误: R2配置不完整，请检查.env文件")
        return False

    city_filtered_dir = TEST_FILTERED_DIR / str(HONGKONG_CITY_ID)
    images = list(city_filtered_dir.glob('*.*'))

    if not images:
        print("错误: 没有找到筛选后的图片")
        return False

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    imported = 0
    for img_path in images:
        print(f"\n处理: {img_path.name}")

        # 上传到R2
        print(f"  上传到R2...")
        image_url = upload_to_r2(img_path)
        if not image_url:
            print(f"  上传失败，跳过")
            continue

        print(f"  URL: {image_url}")

        alt_text = f"{HONGKONG_NAME}街景"

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
            'crawler',
            20,
            'approved',
            datetime.now().isoformat()
        ])

        print(f"  导入数据库: ✓")
        imported += 1

    conn.commit()
    conn.close()

    print(f"\n导入完成: {imported} 张图片已上传到R2并写入数据库")
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
✅ 图片已上传到R2并导入数据库

验证方法：
1. 访问API: curl https://你的域名/api/cities/{HONGKONG_CITY_ID}
2. 打开小程序 → 搜索"香港" → 查看城市详情页的图片
3. 打开网站 → 香港城市详情页

如果图片显示正常，说明整个流程已打通！
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
    parser.add_argument('--engine', '-e', default='Bing',
                        choices=['Google', 'Bing', 'Baidu'],
                        help='搜索引擎 (默认: Bing)')
    parser.add_argument('--conda-env', default='img',
                        help='Conda环境名称 (默认: img)')

    args = parser.parse_args()

    print("\n" + "#"*50)
    print("#  香港城市图片 - 端到端测试")
    print("#"*50)
    print(f"\n城市: {HONGKONG_NAME} (ID: {HONGKONG_CITY_ID})")
    print(f"数据库: {DB_PATH}")

    # 步骤1: 爬取
    if not args.skip_crawl:
        if not step1_crawl_images(args.downloader, args.max_number, args.engine, args.conda_env):
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
