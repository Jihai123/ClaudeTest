#!/usr/bin/env python3
"""
评论数据导入脚本
将爬取的用户评论导入SQLite数据库的reviews表

用法:
    python import_reviews.py               # 导入所有评论
    python import_reviews.py --city-id 1   # 只导入指定城市的评论
    python import_reviews.py --dry-run     # 试运行
"""

import argparse
import json
import os
import sqlite3
import logging
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

# 配置
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent
RAW_DATA_DIR = SCRIPT_DIR / 'raw_data'
LOG_DIR = SCRIPT_DIR / 'logs'

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
logger = logging.getLogger('ImportReviews')


class ReviewImporter:
    """评论导入器"""

    # 爬虫用户ID（系统用户）
    CRAWLER_USER_ID = 1  # 假设ID=1是系统用户，如果没有需要先创建

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self.conn = None
        self.stats = {
            'imported': 0,
            'skipped': 0,
            'errors': 0,
        }
        self.crawler_user_id = None

    def connect(self):
        """连接数据库"""
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        logger.info(f"已连接数据库: {self.db_path}")

        # 确保爬虫用户存在
        self._ensure_crawler_user()

    def close(self):
        """关闭数据库连接"""
        if self.conn:
            self.conn.close()

    def _ensure_crawler_user(self):
        """确保爬虫系统用户存在"""
        cursor = self.conn.cursor()

        # 检查是否存在爬虫用户
        cursor.execute("SELECT id FROM users WHERE username = 'crawler_bot'")
        row = cursor.fetchone()

        if row:
            self.crawler_user_id = row[0]
        else:
            # 创建爬虫用户
            cursor.execute('''
                INSERT INTO users (username, email, password, role, bio)
                VALUES ('crawler_bot', 'crawler@system.local', 'not_a_real_password', 'system', '自动爬取的网友评论')
            ''')
            self.conn.commit()
            self.crawler_user_id = cursor.lastrowid
            logger.info(f"已创建爬虫系统用户: ID={self.crawler_user_id}")

    def import_city_reviews(self, city_id: int, review_data: Dict) -> int:
        """
        导入单个城市的评论

        Args:
            city_id: 城市ID
            review_data: 爬取的评论数据

        Returns:
            导入的评论数量
        """
        reviews = review_data.get('reviews', [])
        if not reviews:
            return 0

        cursor = self.conn.cursor()
        imported = 0

        for review in reviews:
            content = review.get('content', '').strip()
            if not content or len(content) < 10:
                continue

            # 生成内容hash用于去重
            content_hash = hashlib.md5(content[:200].encode()).hexdigest()

            # 检查是否已存在相同评论
            cursor.execute('''
                SELECT id FROM reviews
                WHERE city_id = ? AND comment LIKE ?
                LIMIT 1
            ''', (city_id, f'{content[:50]}%'))

            if cursor.fetchone():
                self.stats['skipped'] += 1
                continue

            # 从评论内容推断评分（简单情感分析）
            rating = self._infer_rating(content)

            # 插入评论
            try:
                source = review.get('source', 'crawler')
                cursor.execute('''
                    INSERT INTO reviews (city_id, user_id, rating, comment, living_purpose, status, created_at)
                    VALUES (?, ?, ?, ?, ?, 'approved', CURRENT_TIMESTAMP)
                ''', (city_id, self.crawler_user_id, rating,
                      f"[{source}] {content[:500]}", 'crawler'))

                imported += 1
                self.stats['imported'] += 1

            except Exception as e:
                logger.error(f"插入评论失败: {e}")
                self.stats['errors'] += 1

        self.conn.commit()
        return imported

    def _infer_rating(self, content: str) -> float:
        """根据评论内容推断评分"""
        positive_keywords = ['喜欢', '推荐', '舒服', '惬意', '安逸', '幸福', '满意',
                            '宜居', '空气好', '风景美', '物价低', '性价比高', '值得']
        negative_keywords = ['后悔', '不推荐', '坑', '失望', '糟糕', '不适合',
                            '太贵', '太热', '太冷', '无聊', '不方便']

        positive_count = sum(1 for kw in positive_keywords if kw in content)
        negative_count = sum(1 for kw in negative_keywords if kw in content)

        # 基础分5分，根据情感调整
        base_score = 5.0

        if positive_count > negative_count:
            # 偏正面，加分
            bonus = min(2.0, positive_count * 0.5)
            return min(9.0, base_score + bonus + (positive_count - negative_count) * 0.3)
        elif negative_count > positive_count:
            # 偏负面，减分
            penalty = min(2.0, negative_count * 0.5)
            return max(2.0, base_score - penalty - (negative_count - positive_count) * 0.3)
        else:
            # 中立
            return 5.0

    def import_all(self, review_data_list: List[Dict]) -> Dict:
        """导入所有评论"""
        for data in review_data_list:
            city_id = data.get('city_id')
            city_name = data.get('city_name', 'unknown')

            if not city_id:
                continue

            reviews = data.get('reviews', [])
            if not reviews:
                logger.info(f"  跳过 {city_name}: 无评论数据")
                continue

            logger.info(f"  导入 {city_name}: {len(reviews)} 条评论")
            imported = self.import_city_reviews(city_id, data)
            logger.info(f"    成功导入: {imported} 条")

        return self.stats


def load_review_data() -> List[Dict]:
    """加载爬取的评论数据"""
    data_file = RAW_DATA_DIR / 'review_data.json'

    if not data_file.exists():
        logger.error(f"评论数据文件不存在: {data_file}")
        logger.info("请先运行 python crawl_all.py --type reviews 爬取评论")
        return []

    with open(data_file, 'r', encoding='utf-8') as f:
        return json.load(f)


def main():
    parser = argparse.ArgumentParser(description='导入用户评论到数据库')
    parser.add_argument('--city-id', type=int, help='只导入指定城市的评论')
    parser.add_argument('--dry-run', action='store_true', help='试运行')

    args = parser.parse_args()

    logger.info("=" * 50)
    logger.info("开始导入用户评论")
    logger.info("=" * 50)

    # 加载数据
    review_data = load_review_data()
    if not review_data:
        return

    # 过滤指定城市
    if args.city_id:
        review_data = [d for d in review_data if d.get('city_id') == args.city_id]

    logger.info(f"待导入: {len(review_data)} 个城市的评论")

    # 统计评论总数
    total_reviews = sum(len(d.get('reviews', [])) for d in review_data)
    logger.info(f"评论总数: {total_reviews} 条")

    if args.dry_run:
        logger.info("\n=== 试运行模式 ===")
        for data in review_data[:10]:
            reviews = data.get('reviews', [])
            logger.info(f"  [{data.get('city_id')}] {data.get('city_name')}: {len(reviews)} 条评论")
            if reviews:
                # 显示第一条评论预览
                preview = reviews[0].get('content', '')[:50]
                logger.info(f"      预览: {preview}...")
        return

    # 执行导入
    importer = ReviewImporter()
    importer.connect()

    try:
        stats = importer.import_all(review_data)
    finally:
        importer.close()

    # 打印结果
    logger.info("\n" + "=" * 50)
    logger.info("导入完成!")
    logger.info("=" * 50)
    logger.info(f"成功导入: {stats['imported']} 条")
    logger.info(f"跳过（重复）: {stats['skipped']} 条")
    logger.info(f"错误: {stats['errors']} 条")


if __name__ == '__main__':
    main()
