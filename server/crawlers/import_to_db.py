#!/usr/bin/env python3
"""
R2上传和数据库导入脚本
将筛选后的图片上传到Cloudflare R2，并导入数据库
"""

import os
import json
import sqlite3
import argparse
import mimetypes
from pathlib import Path
from datetime import datetime
import hashlib
import uuid

try:
    import boto3
    from botocore.config import Config
except ImportError:
    print("请安装 boto3: pip install boto3")
    exit(1)

# 配置
FILTERED_DIR = Path(__file__).parent / 'filtered_images'
CITIES_FILE = Path(__file__).parent / 'cities.json'
IMPORT_LOG = Path(__file__).parent / 'import_log.json'
DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent.parent.parent / 'database.sqlite'))

# 从环境变量读取R2配置
R2_ACCOUNT_ID = os.environ.get('R2_ACCOUNT_ID')
R2_ACCESS_KEY_ID = os.environ.get('R2_ACCESS_KEY_ID')
R2_SECRET_ACCESS_KEY = os.environ.get('R2_SECRET_ACCESS_KEY')
R2_BUCKET_NAME = os.environ.get('R2_BUCKET_NAME')
R2_PUBLIC_DOMAIN = os.environ.get('R2_PUBLIC_DOMAIN')

class R2Uploader:
    def __init__(self):
        if not all([R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME]):
            raise ValueError("R2配置不完整，请设置环境变量: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME")

        self.s3 = boto3.client(
            's3',
            endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            config=Config(
                signature_version='s3v4',
                s3={'addressing_style': 'path'}
            )
        )
        self.bucket = R2_BUCKET_NAME

    def upload_file(self, file_path, key=None):
        """
        上传文件到R2

        Args:
            file_path: 本地文件路径
            key: R2对象键名（默认使用唯一文件名）

        Returns:
            str: 公开访问URL
        """
        path = Path(file_path)

        if key is None:
            # 生成唯一文件名: city_images/{city_id}/{timestamp}_{random}.{ext}
            ext = path.suffix
            timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
            random_str = uuid.uuid4().hex[:8]
            key = f"city_images/{timestamp}_{random_str}{ext}"

        # 获取MIME类型
        content_type = mimetypes.guess_type(str(path))[0] or 'image/jpeg'

        # 上传
        with open(path, 'rb') as f:
            self.s3.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=f,
                ContentType=content_type
            )

        # 构建公开URL
        if R2_PUBLIC_DOMAIN:
            domain = R2_PUBLIC_DOMAIN.replace('https://', '').replace('http://', '')
            return f"https://{domain}/{key}"
        else:
            return f"https://{self.bucket}.{R2_ACCOUNT_ID}.r2.cloudflarestorage.com/{key}"


class DatabaseImporter:
    def __init__(self, db_path):
        self.conn = sqlite3.connect(db_path)
        self.cursor = self.conn.cursor()

    def get_city_name(self, city_id):
        """获取城市名称"""
        self.cursor.execute('SELECT name FROM cities WHERE id = ?', [city_id])
        row = self.cursor.fetchone()
        return row[0] if row else None

    def check_existing(self, city_id, image_url):
        """检查图片是否已存在"""
        self.cursor.execute(
            'SELECT id FROM city_images WHERE city_id = ? AND image_url = ?',
            [city_id, image_url]
        )
        return self.cursor.fetchone() is not None

    def insert_image(self, city_id, image_url, alt_text='', image_type='crawled'):
        """插入图片记录"""
        self.cursor.execute('''
            INSERT INTO city_images (
                city_id, image_url, thumbnail_url, alt_text, image_type,
                tags, upload_source, weight, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', [
            city_id,
            image_url,
            image_url,  # thumbnail_url 暂时同 image_url
            alt_text,
            image_type,
            '[]',  # tags
            'crawler',  # upload_source
            20,  # weight (爬取的图片权重较低)
            'approved',  # status
            datetime.now().isoformat()
        ])
        self.conn.commit()
        return self.cursor.lastrowid

    def close(self):
        self.conn.close()


def load_cities_map():
    """加载城市ID到名称的映射"""
    if not CITIES_FILE.exists():
        return {}

    with open(CITIES_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    return {str(c['id']): c['name'] for c in data.get('cities', [])}


def import_images(args):
    """导入图片到R2和数据库"""
    if not FILTERED_DIR.exists():
        print(f"错误: 筛选图片目录不存在: {FILTERED_DIR}")
        print("请先运行 filter_images.py 筛选图片")
        return

    # 加载城市映射
    cities_map = load_cities_map()

    # 获取所有城市目录
    city_dirs = [d for d in FILTERED_DIR.iterdir() if d.is_dir()]

    if not city_dirs:
        print("没有找到筛选后的图片目录")
        return

    print(f"共有 {len(city_dirs)} 个城市待导入")
    print(f"数据库: {DB_PATH}")
    print("-" * 50)

    # 初始化上传器和数据库
    uploader = None
    if not args.skip_upload:
        try:
            uploader = R2Uploader()
            print("R2连接成功")
        except Exception as e:
            print(f"R2连接失败: {e}")
            if not args.local_only:
                print("请检查环境变量配置，或使用 --local-only 选项跳过R2上传")
                return

    db = DatabaseImporter(DB_PATH)

    # 统计
    stats = {
        'cities_processed': 0,
        'images_uploaded': 0,
        'images_imported': 0,
        'images_skipped': 0,
        'errors': []
    }

    results = []

    for i, city_dir in enumerate(city_dirs, 1):
        city_id = city_dir.name
        city_name = cities_map.get(city_id, db.get_city_name(city_id) or f'Unknown-{city_id}')

        print(f"\n[{i}/{len(city_dirs)}] 城市: {city_name} (ID: {city_id})")

        # 获取该城市的所有图片
        images = list(city_dir.glob('*.jpg')) + \
                 list(city_dir.glob('*.jpeg')) + \
                 list(city_dir.glob('*.png')) + \
                 list(city_dir.glob('*.webp'))

        city_result = {
            'city_id': city_id,
            'city_name': city_name,
            'total': len(images),
            'uploaded': 0,
            'imported': 0,
            'skipped': 0
        }

        for img_path in images:
            try:
                if args.dry_run:
                    print(f"    [DRY-RUN] 将上传: {img_path.name}")
                    city_result['uploaded'] += 1
                    continue

                # 上传到R2
                if uploader and not args.local_only:
                    key = f"city_images/{city_id}/{img_path.name}"
                    image_url = uploader.upload_file(img_path, key)
                    print(f"    上传: {img_path.name} -> {image_url}")
                else:
                    # 本地模式，使用本地路径
                    image_url = f"/uploads/city_images/{city_id}/{img_path.name}"
                    print(f"    本地: {img_path.name}")

                # 检查是否已存在
                if db.check_existing(city_id, image_url):
                    print(f"    跳过(已存在): {img_path.name}")
                    city_result['skipped'] += 1
                    stats['images_skipped'] += 1
                    continue

                # 插入数据库
                alt_text = f"{city_name}风景图"
                image_id = db.insert_image(city_id, image_url, alt_text, 'crawled')
                print(f"    导入数据库: ID={image_id}")

                city_result['uploaded'] += 1
                city_result['imported'] += 1
                stats['images_uploaded'] += 1
                stats['images_imported'] += 1

            except Exception as e:
                print(f"    错误: {img_path.name} - {e}")
                stats['errors'].append({
                    'city_id': city_id,
                    'file': str(img_path),
                    'error': str(e)
                })

        results.append(city_result)
        stats['cities_processed'] += 1

    db.close()

    # 保存日志
    log = {
        'timestamp': datetime.now().isoformat(),
        'stats': stats,
        'results': results
    }

    with open(IMPORT_LOG, 'w', encoding='utf-8') as f:
        json.dump(log, f, ensure_ascii=False, indent=2)

    # 输出统计
    print("\n" + "=" * 50)
    print("导入完成!")
    print(f"处理城市数: {stats['cities_processed']}")
    print(f"上传图片数: {stats['images_uploaded']}")
    print(f"导入数据库: {stats['images_imported']}")
    print(f"跳过(已存在): {stats['images_skipped']}")
    print(f"错误数: {len(stats['errors'])}")
    print(f"日志文件: {IMPORT_LOG}")


def main():
    parser = argparse.ArgumentParser(description='上传图片到R2并导入数据库')

    parser.add_argument('--dry-run',
                        action='store_true',
                        help='试运行，不实际上传')

    parser.add_argument('--skip-upload',
                        action='store_true',
                        help='跳过R2上传，只导入数据库')

    parser.add_argument('--local-only',
                        action='store_true',
                        help='本地模式，使用本地路径而不是R2')

    parser.add_argument('--city-id',
                        type=str,
                        help='只处理指定城市ID')

    args = parser.parse_args()
    import_images(args)


if __name__ == '__main__':
    main()
