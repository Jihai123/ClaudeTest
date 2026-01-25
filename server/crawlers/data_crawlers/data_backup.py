#!/usr/bin/env python3
"""
数据回退和备份管理工具
支持数据导入前备份、回退、数据验证

用法:
    python data_backup.py backup              # 创建备份
    python data_backup.py list                # 列出所有备份
    python data_backup.py restore <backup_id> # 恢复指定备份
    python data_backup.py diff <backup_id>    # 对比当前数据和备份
    python data_backup.py validate            # 验证当前数据合理性
"""

import argparse
import json
import os
import sqlite3
import shutil
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Tuple

# 配置
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent
BACKUP_DIR = SCRIPT_DIR / 'backups'

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
logger = logging.getLogger('DataBackup')


class DataBackupManager:
    """数据备份管理器"""

    # 需要备份的表
    BACKUP_TABLES = ['cities', 'city_dimensions', 'city_tags', 'city_images', 'reviews']

    # 数据合理性范围（用于验证）
    VALID_RANGES = {
        'population': (0.1, 5000),       # 人口（万人）: 0.1万 ~ 5000万
        'gdp': (1, 100000),              # GDP（亿元）: 1亿 ~ 10万亿
        'area': (1, 100000),             # 面积（km²）
        'avg_rent': (100, 50000),        # 月租金（元）
        'avg_temp': (-20, 35),           # 年均温度（℃）
        'overall_score': (0, 10),        # 评分
        'layflat_score': (0, 10),
        'world_score': (0, 10),
    }

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    def create_backup(self, description: str = "") -> str:
        """
        创建数据备份

        Returns:
            backup_id: 备份ID
        """
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_id = f"backup_{timestamp}"
        backup_path = BACKUP_DIR / backup_id

        backup_path.mkdir(parents=True, exist_ok=True)

        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row

        backup_data = {
            'backup_id': backup_id,
            'timestamp': datetime.now().isoformat(),
            'description': description,
            'db_path': self.db_path,
            'tables': {}
        }

        for table in self.BACKUP_TABLES:
            try:
                cursor = conn.execute(f'SELECT * FROM {table}')
                columns = [desc[0] for desc in cursor.description]
                rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

                backup_data['tables'][table] = {
                    'columns': columns,
                    'row_count': len(rows),
                    'data': rows
                }

                logger.info(f"  备份 {table}: {len(rows)} 行")

            except Exception as e:
                logger.warning(f"  备份 {table} 失败: {e}")

        conn.close()

        # 保存备份数据
        backup_file = backup_path / 'data.json'
        with open(backup_file, 'w', encoding='utf-8') as f:
            json.dump(backup_data, f, ensure_ascii=False, indent=2)

        # 同时复制整个数据库文件（更安全）
        db_backup = backup_path / 'database.sqlite'
        shutil.copy2(self.db_path, db_backup)

        logger.info(f"备份完成: {backup_id}")
        return backup_id

    def list_backups(self) -> List[Dict]:
        """列出所有备份"""
        backups = []

        for backup_dir in sorted(BACKUP_DIR.iterdir(), reverse=True):
            if backup_dir.is_dir() and backup_dir.name.startswith('backup_'):
                meta_file = backup_dir / 'data.json'
                if meta_file.exists():
                    with open(meta_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        backups.append({
                            'backup_id': data['backup_id'],
                            'timestamp': data['timestamp'],
                            'description': data.get('description', ''),
                            'tables': {k: v['row_count'] for k, v in data['tables'].items()}
                        })

        return backups

    def restore_backup(self, backup_id: str, tables: List[str] = None) -> bool:
        """
        恢复备份

        Args:
            backup_id: 备份ID
            tables: 要恢复的表（默认全部）

        Returns:
            是否成功
        """
        backup_path = BACKUP_DIR / backup_id

        if not backup_path.exists():
            logger.error(f"备份不存在: {backup_id}")
            return False

        # 优先使用数据库文件恢复（更可靠）
        db_backup = backup_path / 'database.sqlite'
        if db_backup.exists() and tables is None:
            # 完整恢复
            logger.info("使用数据库文件完整恢复...")

            # 先备份当前数据
            current_backup = self.create_backup("恢复前自动备份")
            logger.info(f"已创建当前数据备份: {current_backup}")

            shutil.copy2(db_backup, self.db_path)
            logger.info(f"数据库已恢复到: {backup_id}")
            return True

        # 使用JSON数据恢复（支持部分表恢复）
        data_file = backup_path / 'data.json'
        if not data_file.exists():
            logger.error(f"备份数据文件不存在")
            return False

        with open(data_file, 'r', encoding='utf-8') as f:
            backup_data = json.load(f)

        # 先备份当前数据
        current_backup = self.create_backup("恢复前自动备份")
        logger.info(f"已创建当前数据备份: {current_backup}")

        conn = sqlite3.connect(self.db_path)
        tables_to_restore = tables or self.BACKUP_TABLES

        for table in tables_to_restore:
            if table not in backup_data['tables']:
                logger.warning(f"  跳过 {table}: 备份中不存在")
                continue

            table_data = backup_data['tables'][table]
            rows = table_data['data']
            columns = table_data['columns']

            if not rows:
                logger.info(f"  跳过 {table}: 无数据")
                continue

            try:
                # 清空现有数据
                conn.execute(f'DELETE FROM {table}')

                # 插入备份数据
                placeholders = ', '.join(['?' for _ in columns])
                col_names = ', '.join(columns)
                sql = f'INSERT INTO {table} ({col_names}) VALUES ({placeholders})'

                for row in rows:
                    values = [row.get(col) for col in columns]
                    conn.execute(sql, values)

                conn.commit()
                logger.info(f"  恢复 {table}: {len(rows)} 行")

            except Exception as e:
                logger.error(f"  恢复 {table} 失败: {e}")
                conn.rollback()

        conn.close()
        logger.info("恢复完成")
        return True

    def diff_backup(self, backup_id: str) -> Dict:
        """对比当前数据和备份的差异"""
        backup_path = BACKUP_DIR / backup_id / 'data.json'

        if not backup_path.exists():
            logger.error(f"备份不存在: {backup_id}")
            return {}

        with open(backup_path, 'r', encoding='utf-8') as f:
            backup_data = json.load(f)

        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row

        diff = {}

        for table in self.BACKUP_TABLES:
            if table not in backup_data['tables']:
                continue

            backup_rows = backup_data['tables'][table]['data']
            backup_count = len(backup_rows)

            try:
                cursor = conn.execute(f'SELECT COUNT(*) FROM {table}')
                current_count = cursor.fetchone()[0]

                diff[table] = {
                    'backup_count': backup_count,
                    'current_count': current_count,
                    'diff': current_count - backup_count
                }
            except:
                pass

        conn.close()
        return diff

    def validate_data(self) -> Dict:
        """验证数据合理性"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row

        issues = {
            'errors': [],      # 严重问题
            'warnings': [],    # 警告
            'suggestions': [], # 建议
        }

        # 1. 检查cities表
        cursor = conn.execute('SELECT * FROM cities')
        cities = cursor.fetchall()

        for city in cities:
            city_id = city['id']
            city_name = city['name']

            # 检查人口（单位应该是万人，不应该超过5000万）
            pop = city['population']
            if pop and pop > 5000:
                issues['errors'].append(
                    f"[{city_name}] 人口数据异常: {pop}（应为万人，当前值过大，可能是原始人数）"
                )

            # 检查GDP
            gdp = city['gdp']
            if gdp and gdp > 100000:
                issues['warnings'].append(
                    f"[{city_name}] GDP数据可能异常: {gdp}亿元"
                )

            # 检查必填字段
            if not city['name_en']:
                issues['suggestions'].append(f"[{city_name}] 缺少英文名")

            if not city['latitude'] or not city['longitude']:
                issues['warnings'].append(f"[{city_name}] 缺少经纬度坐标")

            if not city['slogan']:
                issues['suggestions'].append(f"[{city_name}] 缺少一句话描述(slogan)")

            # 检查评分范围
            for score_field in ['overall_score', 'layflat_score', 'world_score']:
                score = city[score_field]
                if score and (score < 0 or score > 10):
                    issues['errors'].append(
                        f"[{city_name}] {score_field}={score} 超出范围[0,10]"
                    )

        # 2. 检查数据完整度
        cursor = conn.execute('''
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN evaluation IS NULL OR evaluation = '' THEN 1 ELSE 0 END) as no_desc,
                SUM(CASE WHEN avg_rent IS NULL OR avg_rent = 0 THEN 1 ELSE 0 END) as no_rent,
                SUM(CASE WHEN climate IS NULL OR climate = '' THEN 1 ELSE 0 END) as no_climate
            FROM cities
        ''')
        stats = cursor.fetchone()

        if stats['no_desc'] > 0:
            issues['warnings'].append(f"{stats['no_desc']}/{stats['total']} 城市缺少城市介绍(evaluation)")

        if stats['no_rent'] > 0:
            issues['warnings'].append(f"{stats['no_rent']}/{stats['total']} 城市缺少租金数据")

        if stats['no_climate'] > 0:
            issues['warnings'].append(f"{stats['no_climate']}/{stats['total']} 城市缺少气候数据")

        # 3. 检查图片
        cursor = conn.execute('SELECT COUNT(DISTINCT city_id) FROM city_images')
        cities_with_images = cursor.fetchone()[0]
        if cities_with_images < len(cities):
            issues['warnings'].append(
                f"只有 {cities_with_images}/{len(cities)} 城市有图片"
            )

        conn.close()
        return issues


def cmd_backup(args):
    """备份命令"""
    manager = DataBackupManager()
    backup_id = manager.create_backup(args.description or "手动备份")
    print(f"\n备份已创建: {backup_id}")
    print(f"位置: {BACKUP_DIR / backup_id}")


def cmd_list(args):
    """列出备份"""
    manager = DataBackupManager()
    backups = manager.list_backups()

    if not backups:
        print("没有找到备份")
        return

    print("\n可用备份:")
    print("-" * 80)
    for b in backups:
        tables_info = ', '.join(f"{k}:{v}" for k, v in b['tables'].items())
        print(f"  {b['backup_id']}")
        print(f"    时间: {b['timestamp']}")
        print(f"    描述: {b['description'] or '无'}")
        print(f"    数据: {tables_info}")
        print()


def cmd_restore(args):
    """恢复备份"""
    manager = DataBackupManager()

    if args.backup_id == 'latest':
        backups = manager.list_backups()
        if not backups:
            print("没有找到备份")
            return
        args.backup_id = backups[0]['backup_id']
        print(f"使用最新备份: {args.backup_id}")

    tables = args.tables.split(',') if args.tables else None

    if not args.force:
        confirm = input(f"确认恢复备份 {args.backup_id}? (y/N): ")
        if confirm.lower() != 'y':
            print("已取消")
            return

    success = manager.restore_backup(args.backup_id, tables)
    if success:
        print("\n恢复成功!")
    else:
        print("\n恢复失败!")


def cmd_diff(args):
    """对比差异"""
    manager = DataBackupManager()
    diff = manager.diff_backup(args.backup_id)

    if not diff:
        return

    print(f"\n与备份 {args.backup_id} 的差异:")
    print("-" * 50)
    for table, info in diff.items():
        diff_str = f"+{info['diff']}" if info['diff'] >= 0 else str(info['diff'])
        print(f"  {table}: {info['backup_count']} → {info['current_count']} ({diff_str})")


def cmd_validate(args):
    """验证数据"""
    manager = DataBackupManager()
    issues = manager.validate_data()

    print("\n数据验证报告")
    print("=" * 60)

    if issues['errors']:
        print(f"\n❌ 错误 ({len(issues['errors'])}个):")
        for e in issues['errors']:
            print(f"  - {e}")

    if issues['warnings']:
        print(f"\n⚠️  警告 ({len(issues['warnings'])}个):")
        for w in issues['warnings']:
            print(f"  - {w}")

    if issues['suggestions']:
        print(f"\n💡 建议 ({len(issues['suggestions'])}个):")
        for s in issues['suggestions'][:10]:
            print(f"  - {s}")
        if len(issues['suggestions']) > 10:
            print(f"  ... 还有 {len(issues['suggestions']) - 10} 条")

    if not any(issues.values()):
        print("\n✅ 数据验证通过，无明显问题")


def main():
    parser = argparse.ArgumentParser(description='数据备份和回退管理')
    subparsers = parser.add_subparsers(dest='command', help='命令')

    # backup 命令
    p_backup = subparsers.add_parser('backup', help='创建备份')
    p_backup.add_argument('-d', '--description', help='备份描述')

    # list 命令
    p_list = subparsers.add_parser('list', help='列出备份')

    # restore 命令
    p_restore = subparsers.add_parser('restore', help='恢复备份')
    p_restore.add_argument('backup_id', help='备份ID（或 latest）')
    p_restore.add_argument('-t', '--tables', help='只恢复指定表（逗号分隔）')
    p_restore.add_argument('-f', '--force', action='store_true', help='不询问确认')

    # diff 命令
    p_diff = subparsers.add_parser('diff', help='对比差异')
    p_diff.add_argument('backup_id', help='备份ID')

    # validate 命令
    p_validate = subparsers.add_parser('validate', help='验证数据')

    args = parser.parse_args()

    if args.command == 'backup':
        cmd_backup(args)
    elif args.command == 'list':
        cmd_list(args)
    elif args.command == 'restore':
        cmd_restore(args)
    elif args.command == 'diff':
        cmd_diff(args)
    elif args.command == 'validate':
        cmd_validate(args)
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
