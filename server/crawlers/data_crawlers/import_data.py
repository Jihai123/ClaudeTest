#!/usr/bin/env python3
"""
数据库导入脚本
将筛选后的数据导入SQLite数据库

用法:
    python import_data.py               # 导入所有数据
    python import_data.py --city-id 1   # 只导入指定城市
    python import_data.py --dry-run     # 试运行
    python import_data.py --force       # 强制覆盖现有数据
"""

import argparse
import json
import os
import sqlite3
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

# 配置
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent
FILTERED_DATA_DIR = SCRIPT_DIR / 'filtered_data'
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
logger = logging.getLogger('ImportData')


class DatabaseImporter:
    """数据库导入器"""

    # 字段映射：爬取数据字段 -> 数据库字段
    CITIES_FIELD_MAP = {
        'population': 'population',
        'gdp': 'gdp',
        'area': 'area',
        'avg_rent': 'avg_rent',
        'avg_temp': 'avg_temp',
        'climate_type': 'climate',
        'description': 'evaluation',
    }

    # city_dimensions 字段映射
    DIMENSIONS_FIELD_MAP = {
        'aqi': 'air_quality_raw',  # 原始AQI值，需要转换为评分
        'hospital_count': 'hospital_count_raw',
        'university_count': 'university_count_raw',
    }

    def __init__(self, db_path: str = DB_PATH, force: bool = False):
        self.db_path = db_path
        self.force = force
        self.conn = None
        self.stats = {
            'updated': 0,
            'skipped': 0,
            'errors': 0,
            'fields_updated': {}
        }

    def connect(self):
        """连接数据库"""
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        logger.info(f"已连接数据库: {self.db_path}")

    def close(self):
        """关闭数据库连接"""
        if self.conn:
            self.conn.close()

    def import_city(self, data: Dict) -> bool:
        """导入单个城市数据"""
        city_id = data.get('city_id')
        city_name = data.get('city_name', 'unknown')

        if not city_id:
            logger.warning(f"跳过无效数据: 缺少city_id")
            self.stats['skipped'] += 1
            return False

        try:
            cursor = self.conn.cursor()

            # 检查城市是否存在
            cursor.execute('SELECT id FROM cities WHERE id = ?', (city_id,))
            if not cursor.fetchone():
                logger.warning(f"城市不存在: [{city_id}] {city_name}")
                self.stats['skipped'] += 1
                return False

            # 构建更新语句
            updates = []
            values = []

            for crawl_field, db_field in self.CITIES_FIELD_MAP.items():
                if crawl_field in data and data[crawl_field] is not None:
                    value = data[crawl_field]

                    # 检查是否需要更新（仅force模式覆盖，或字段为空）
                    cursor.execute(f'SELECT {db_field} FROM cities WHERE id = ?', (city_id,))
                    row = cursor.fetchone()
                    current_value = row[0] if row else None

                    # 默认只填充空值，不覆盖任何已有数据
                    # 注意：0 可能是有意义的值，不应被覆盖
                    is_empty = current_value is None or current_value == ''

                    if self.force or is_empty:
                        updates.append(f'{db_field} = ?')
                        values.append(value)

                        # 统计字段更新
                        if db_field not in self.stats['fields_updated']:
                            self.stats['fields_updated'][db_field] = 0
                        self.stats['fields_updated'][db_field] += 1

            # 添加更新时间
            if updates:
                updates.append('updated_at = CURRENT_TIMESTAMP')
                values.append(city_id)

                sql = f"UPDATE cities SET {', '.join(updates)} WHERE id = ?"
                cursor.execute(sql, values)

            # 更新 city_dimensions 表
            self._update_dimensions(cursor, city_id, data)

            # 更新 city_tags（如果有特色标签）
            self._update_tags(cursor, city_id, data)

            self.conn.commit()
            self.stats['updated'] += 1
            return True

        except Exception as e:
            logger.error(f"导入失败 [{city_id}] {city_name}: {e}")
            self.stats['errors'] += 1
            return False

    def _update_dimensions(self, cursor, city_id: int, data: Dict):
        """更新城市维度数据"""
        # 检查是否存在维度记录
        cursor.execute('SELECT id FROM city_dimensions WHERE city_id = ?', (city_id,))
        exists = cursor.fetchone()

        # 转换AQI为评分（10分制）
        aqi = data.get('aqi')
        if aqi is not None:
            # AQI越低越好：AQI <= 35 得10分，AQI >= 150 得2分
            if aqi <= 35:
                air_score = 10.0
            elif aqi <= 50:
                air_score = 9.0
            elif aqi <= 75:
                air_score = 7.5
            elif aqi <= 100:
                air_score = 6.0
            elif aqi <= 150:
                air_score = 4.0
            else:
                air_score = 2.0

            if exists:
                if self.force:
                    cursor.execute('''
                        UPDATE city_dimensions SET air_quality = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE city_id = ?
                    ''', (air_score, city_id))
                else:
                    cursor.execute('''
                        UPDATE city_dimensions SET air_quality = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE city_id = ? AND (air_quality IS NULL OR air_quality = 0)
                    ''', (air_score, city_id))
            else:
                cursor.execute('''
                    INSERT INTO city_dimensions (city_id, air_quality)
                    VALUES (?, ?)
                ''', (city_id, air_score))

        # 转换医院数量为评分
        hospital_count = data.get('hospital_count')
        if hospital_count is not None:
            if hospital_count >= 40:
                medical_score = 10.0
            elif hospital_count >= 25:
                medical_score = 8.5
            elif hospital_count >= 15:
                medical_score = 7.0
            elif hospital_count >= 8:
                medical_score = 5.5
            elif hospital_count >= 3:
                medical_score = 4.0
            else:
                medical_score = 2.5

            if exists:
                cursor.execute('''
                    UPDATE city_dimensions SET medical_facilities = ?
                    WHERE city_id = ? AND (medical_facilities IS NULL OR medical_facilities = 0)
                ''', (medical_score, city_id))

    def _update_tags(self, cursor, city_id: int, data: Dict):
        """更新城市标签"""
        features = data.get('features', [])
        if not features:
            return

        # 特色标签映射
        tag_map = {
            '沿海城市': ('coastal', '沿海城市', '🏖️'),
            '历史名城': ('historic', '历史名城', '🏛️'),
            '旅游城市': ('tourism', '旅游城市', '✈️'),
            '亚热带气候': ('subtropical', '亚热带气候', '🌴'),
            '温带气候': ('temperate', '温带气候', '🍂'),
            '热带气候': ('tropical', '热带气候', '☀️'),
            '高原气候': ('plateau', '高原气候', '🏔️'),
        }

        for feature in features:
            if feature in tag_map:
                tag_key, tag_name, tag_icon = tag_map[feature]

                # 检查标签是否已存在
                cursor.execute('''
                    SELECT id FROM city_tags WHERE city_id = ? AND tag_key = ?
                ''', (city_id, tag_key))

                if not cursor.fetchone():
                    cursor.execute('''
                        INSERT INTO city_tags (city_id, tag_key, tag_name, tag_icon)
                        VALUES (?, ?, ?, ?)
                    ''', (city_id, tag_key, tag_name, tag_icon))

    def import_all(self, data_list: List[Dict]) -> Dict:
        """导入所有数据"""
        total = len(data_list)

        for i, data in enumerate(data_list, 1):
            city_name = data.get('city_name', 'unknown')
            logger.info(f"[{i}/{total}] 导入: {city_name}")
            self.import_city(data)

        return self.stats


def load_filtered_data() -> List[Dict]:
    """加载筛选后的数据"""
    data_file = FILTERED_DATA_DIR / 'city_data.json'

    if not data_file.exists():
        logger.error(f"筛选数据文件不存在: {data_file}")
        logger.info("请先运行 python filter_data.py 筛选数据")
        return []

    with open(data_file, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_import_log(stats: Dict):
    """保存导入日志"""
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_file = LOG_DIR / 'import_log.json'

    log_data = {
        'timestamp': datetime.now().isoformat(),
        'stats': stats
    }

    with open(log_file, 'w', encoding='utf-8') as f:
        json.dump(log_data, f, ensure_ascii=False, indent=2)

    logger.info(f"导入日志已保存到: {log_file}")


def main():
    parser = argparse.ArgumentParser(description='数据库导入')
    parser.add_argument('--city-id', type=int, help='只导入指定城市')
    parser.add_argument('--dry-run', action='store_true', help='试运行')
    parser.add_argument('--force', '-f', action='store_true',
                        help='强制覆盖现有数据')

    args = parser.parse_args()

    logger.info("=" * 50)
    logger.info("开始数据库导入")
    logger.info("=" * 50)

    # 加载数据
    data_list = load_filtered_data()
    if not data_list:
        return

    # 过滤指定城市
    if args.city_id:
        data_list = [d for d in data_list if d.get('city_id') == args.city_id]

    logger.info(f"待导入数据: {len(data_list)} 条")

    if args.dry_run:
        logger.info("\n=== 试运行模式 ===")
        logger.info("将导入以下城市的数据:")
        for data in data_list[:20]:
            fields = [k for k in data.keys() if k not in ['city_id', 'city_name']]
            logger.info(f"  [{data['city_id']}] {data['city_name']}: {', '.join(fields)}")
        if len(data_list) > 20:
            logger.info(f"  ... 还有 {len(data_list) - 20} 个城市")
        return

    # 执行导入
    importer = DatabaseImporter(force=args.force)
    importer.connect()

    try:
        stats = importer.import_all(data_list)
    finally:
        importer.close()

    # 保存日志
    save_import_log(stats)

    # 打印结果
    logger.info("\n" + "=" * 50)
    logger.info("导入完成!")
    logger.info("=" * 50)
    logger.info(f"成功更新: {stats['updated']} 个城市")
    logger.info(f"跳过: {stats['skipped']} 个城市")
    logger.info(f"错误: {stats['errors']} 个城市")

    if stats['fields_updated']:
        logger.info("\n字段更新统计:")
        for field, count in stats['fields_updated'].items():
            logger.info(f"  {field}: {count}")


if __name__ == '__main__':
    main()
