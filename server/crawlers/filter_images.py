#!/usr/bin/env python3
"""
图片筛选脚本
筛选出符合网站要求的高质量图片
"""

import os
import json
import shutil
import hashlib
import argparse
import uuid
from pathlib import Path
from datetime import datetime
from PIL import Image
from collections import defaultdict

# 配置
RAW_IMAGES_DIR = Path(__file__).parent / 'raw_images'
FILTERED_DIR = Path(__file__).parent / 'filtered_images'
REJECTED_DIR = Path(__file__).parent / 'rejected_images'
FILTER_LOG = Path(__file__).parent / 'filter_log.json'

# 筛选标准
MIN_WIDTH = 800           # 最小宽度
MIN_HEIGHT = 500          # 最小高度
MIN_FILE_SIZE = 50 * 1024  # 最小文件大小 50KB
MAX_FILE_SIZE = 10 * 1024 * 1024  # 最大文件大小 10MB
PREFERRED_RATIO_MIN = 1.2  # 最小宽高比（横向）
PREFERRED_RATIO_MAX = 2.5  # 最大宽高比
MAX_IMAGES_PER_CITY = 5    # 每个城市最多保留的图片数

# 支持的图片格式
SUPPORTED_FORMATS = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}

class ImageFilter:
    def __init__(self, args):
        self.args = args
        self.stats = defaultdict(int)
        self.results = {}
        self.seen_hashes = set()

    def calculate_hash(self, image_path):
        """计算图片哈希，用于去重"""
        with open(image_path, 'rb') as f:
            return hashlib.md5(f.read()).hexdigest()

    def check_image(self, image_path):
        """
        检查单张图片是否符合要求

        Returns:
            (bool, str): (是否通过, 拒绝原因)
        """
        path = Path(image_path)

        # 1. 检查文件扩展名
        if path.suffix.lower() not in SUPPORTED_FORMATS:
            return False, f'不支持的格式: {path.suffix}'

        # 2. 检查文件大小
        file_size = path.stat().st_size
        if file_size < MIN_FILE_SIZE:
            return False, f'文件太小: {file_size/1024:.1f}KB < {MIN_FILE_SIZE/1024}KB'
        if file_size > MAX_FILE_SIZE:
            return False, f'文件太大: {file_size/1024/1024:.1f}MB > {MAX_FILE_SIZE/1024/1024}MB'

        # 3. 检查图片尺寸
        try:
            with Image.open(image_path) as img:
                width, height = img.size

                if width < MIN_WIDTH:
                    return False, f'宽度太小: {width}px < {MIN_WIDTH}px'
                if height < MIN_HEIGHT:
                    return False, f'高度太小: {height}px < {MIN_HEIGHT}px'

                # 4. 检查宽高比
                ratio = width / height
                if ratio < PREFERRED_RATIO_MIN:
                    return False, f'宽高比太小(竖图): {ratio:.2f} < {PREFERRED_RATIO_MIN}'
                if ratio > PREFERRED_RATIO_MAX:
                    return False, f'宽高比太大(长图): {ratio:.2f} > {PREFERRED_RATIO_MAX}'

        except Exception as e:
            return False, f'无法读取图片: {e}'

        # 5. 检查重复
        img_hash = self.calculate_hash(image_path)
        if img_hash in self.seen_hashes:
            return False, '重复图片'
        self.seen_hashes.add(img_hash)

        return True, None

    def filter_city_images(self, city_dir):
        """筛选单个城市的图片"""
        city_id = city_dir.name
        images = []

        # 收集所有图片
        for ext in SUPPORTED_FORMATS:
            images.extend(city_dir.glob(f'*{ext}'))
            images.extend(city_dir.glob(f'*{ext.upper()}'))

        if not images:
            return {'city_id': city_id, 'total': 0, 'passed': 0, 'failed': 0, 'details': []}

        passed = []
        failed = []

        for img_path in images:
            is_valid, reason = self.check_image(img_path)

            if is_valid:
                # 获取图片尺寸和文件大小用于排序
                with Image.open(img_path) as img:
                    width, height = img.size
                file_size = img_path.stat().st_size

                passed.append({
                    'path': img_path,
                    'width': width,
                    'height': height,
                    'size': file_size,
                    'score': width * height + file_size / 1000  # 简单评分
                })
                self.stats['passed'] += 1
            else:
                failed.append({
                    'path': str(img_path),
                    'reason': reason
                })
                self.stats['failed'] += 1

        # 按评分排序，选取最佳图片
        passed.sort(key=lambda x: x['score'], reverse=True)
        selected = passed[:MAX_IMAGES_PER_CITY]

        return {
            'city_id': city_id,
            'total': len(images),
            'passed': len(passed),
            'selected': len(selected),
            'failed': len(failed),
            'selected_images': selected,
            'failed_images': failed
        }

    def generate_unique_filename(self, city_id, ext):
        """
        生成唯一文件名，避免覆盖已有文件

        格式: {city_id}_{timestamp}_{random}.{ext}
        例如: 1211_20240114120000_a1b2c3d4.jpg
        """
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        random_str = uuid.uuid4().hex[:8]
        return f'{city_id}_{timestamp}_{random_str}{ext}'

    def copy_filtered_images(self, city_result):
        """复制筛选后的图片到目标目录"""
        city_id = city_result['city_id']
        output_dir = FILTERED_DIR / city_id

        if city_result['selected_images']:
            output_dir.mkdir(parents=True, exist_ok=True)

            for i, img_info in enumerate(city_result['selected_images'], 1):
                src_path = img_info['path']
                ext = src_path.suffix

                # 根据参数决定使用唯一文件名还是固定文件名
                if self.args.unique_names:
                    # 使用唯一文件名，避免覆盖已有图片
                    filename = self.generate_unique_filename(city_id, ext)
                else:
                    # 使用固定文件名（原有逻辑）
                    filename = f'{city_id}_{i}{ext}'

                dst_path = output_dir / filename
                shutil.copy2(src_path, dst_path)
                img_info['filtered_path'] = str(dst_path)
                img_info['filtered_filename'] = filename

    def copy_rejected_images(self, city_result):
        """复制被拒绝的图片到拒绝目录（用于审核）"""
        if not self.args.keep_rejected:
            return

        city_id = city_result['city_id']
        rejected_dir = REJECTED_DIR / city_id

        if city_result['failed_images']:
            rejected_dir.mkdir(parents=True, exist_ok=True)

            for img_info in city_result['failed_images']:
                src_path = Path(img_info['path'])
                if src_path.exists():
                    dst_path = rejected_dir / src_path.name
                    shutil.copy2(src_path, dst_path)

    def run(self):
        """执行筛选"""
        if not RAW_IMAGES_DIR.exists():
            print(f"错误: 原始图片目录不存在: {RAW_IMAGES_DIR}")
            print("请先运行 batch_crawl.py 爬取图片")
            return

        # 创建输出目录
        FILTERED_DIR.mkdir(parents=True, exist_ok=True)

        # 获取所有城市目录
        city_dirs = [d for d in RAW_IMAGES_DIR.iterdir() if d.is_dir()]

        if not city_dirs:
            print("没有找到城市图片目录")
            return

        print(f"共有 {len(city_dirs)} 个城市目录待处理")
        print(f"筛选标准:")
        print(f"  - 最小尺寸: {MIN_WIDTH}x{MIN_HEIGHT}px")
        print(f"  - 文件大小: {MIN_FILE_SIZE/1024}KB - {MAX_FILE_SIZE/1024/1024}MB")
        print(f"  - 宽高比: {PREFERRED_RATIO_MIN} - {PREFERRED_RATIO_MAX}")
        print(f"  - 每城市最多: {MAX_IMAGES_PER_CITY} 张")
        if self.args.unique_names:
            print(f"  - 文件命名: 唯一文件名 (city_timestamp_random.ext)")
        else:
            print(f"  - 文件命名: 固定文件名 (city_1.ext)")
        print("-" * 50)

        results = []

        for i, city_dir in enumerate(city_dirs, 1):
            print(f"\n[{i}/{len(city_dirs)}] 处理城市: {city_dir.name}")

            result = self.filter_city_images(city_dir)
            results.append(result)

            print(f"    总数: {result['total']}, 通过: {result['passed']}, 选取: {result['selected']}, 失败: {result['failed']}")

            # 复制图片
            if not self.args.dry_run:
                self.copy_filtered_images(result)
                self.copy_rejected_images(result)

        # 保存日志
        log = {
            'stats': dict(self.stats),
            'cities_processed': len(results),
            'total_selected': sum(r['selected'] for r in results),
            'results': results
        }

        with open(FILTER_LOG, 'w', encoding='utf-8') as f:
            # 简化输出，不保存Path对象
            json.dump(log, f, ensure_ascii=False, indent=2, default=str)

        # 输出统计
        print("\n" + "=" * 50)
        print("筛选完成!")
        print(f"处理城市数: {len(results)}")
        print(f"通过图片数: {self.stats['passed']}")
        print(f"失败图片数: {self.stats['failed']}")
        print(f"最终选取数: {sum(r['selected'] for r in results)}")
        print(f"输出目录: {FILTERED_DIR}")
        print(f"日志文件: {FILTER_LOG}")

def main():
    parser = argparse.ArgumentParser(description='筛选城市图片')

    parser.add_argument('--dry-run',
                        action='store_true',
                        help='试运行，不复制文件')

    parser.add_argument('--keep-rejected',
                        action='store_true',
                        help='保留被拒绝的图片到单独目录')

    parser.add_argument('--min-width',
                        type=int,
                        default=MIN_WIDTH,
                        help=f'最小宽度 (默认: {MIN_WIDTH})')

    parser.add_argument('--max-per-city',
                        type=int,
                        default=MAX_IMAGES_PER_CITY,
                        help=f'每城市最多图片数 (默认: {MAX_IMAGES_PER_CITY})')

    parser.add_argument('--unique-names',
                        action='store_true',
                        help='使用唯一文件名（时间戳+随机字符串），避免覆盖已有图片')

    args = parser.parse_args()

    filter_runner = ImageFilter(args)
    filter_runner.run()

if __name__ == '__main__':
    main()
