#!/usr/bin/env python3
"""
数据筛选和验证脚本
检查爬取的数据质量，筛选有效数据

用法:
    python filter_data.py               # 筛选所有数据
    python filter_data.py --strict      # 严格模式
    python filter_data.py --dry-run     # 试运行
"""

import argparse
import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Tuple

# 配置
SCRIPT_DIR = Path(__file__).parent
RAW_DATA_DIR = SCRIPT_DIR / 'raw_data'
FILTERED_DATA_DIR = SCRIPT_DIR / 'filtered_data'
LOG_DIR = SCRIPT_DIR / 'logs'

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('FilterData')


class DataValidator:
    """数据验证器"""

    # 数据有效性范围
    VALID_RANGES = {
        # 基础数据
        'population': (0.1, 50000),      # 人口（万人）: 0.1万 ~ 5亿
        'gdp': (1, 500000),              # GDP（亿元）: 1亿 ~ 50万亿
        'area': (1, 100000),             # 面积（km²）: 1 ~ 10万

        # 房价租金
        'avg_price': (1000, 200000),     # 房价（元/㎡）: 1000 ~ 20万
        'avg_rent': (100, 50000),        # 月租金（元）: 100 ~ 5万

        # 气候数据
        'avg_temp': (-20, 35),           # 年均温度（℃）: -20 ~ 35
        'rainfall': (10, 5000),          # 年降水量（mm）: 10 ~ 5000

        # 生活质量
        'aqi': (10, 300),                # AQI: 10 ~ 300
        'hospital_count': (0, 200),      # 三甲医院: 0 ~ 200
        'university_count': (0, 150),    # 高校数: 0 ~ 150
    }

    def __init__(self, strict: bool = False):
        self.strict = strict
        self.errors = []
        self.warnings = []

    def validate_city(self, data: Dict) -> Tuple[bool, Dict]:
        """
        验证单个城市数据

        Returns:
            (是否有效, 清洗后的数据)
        """
        city_id = data.get('city_id')
        city_name = data.get('city_name', 'unknown')

        if not city_id:
            self.errors.append(f"缺少city_id: {data}")
            return False, {}

        cleaned = {
            'city_id': city_id,
            'city_name': city_name
        }
        valid = True
        has_any_data = False

        # 验证各字段
        for field, (min_val, max_val) in self.VALID_RANGES.items():
            if field in data:
                value = data[field]
                if value is None:
                    continue

                try:
                    value = float(value)
                    if min_val <= value <= max_val:
                        cleaned[field] = value
                        has_any_data = True
                    else:
                        self.warnings.append(
                            f"[{city_name}] {field}={value} 超出范围 [{min_val}, {max_val}]"
                        )
                        if self.strict:
                            valid = False
                        else:
                            # 非严格模式下，尝试修正极端值
                            if value < min_val:
                                cleaned[field] = min_val
                            elif value > max_val:
                                cleaned[field] = max_val
                            has_any_data = True

                except (ValueError, TypeError) as e:
                    self.warnings.append(
                        f"[{city_name}] {field}={value} 无效: {e}"
                    )

        # 复制其他非数值字段
        text_fields = ['description', 'climate_type', 'famous_places', 'features',
                       'aqi_level', 'best_months', 'data_source', 'postal_code',
                       'area_code']
        for field in text_fields:
            if field in data and data[field]:
                cleaned[field] = data[field]
                has_any_data = True

        # 检查是否有有效数据
        if not has_any_data:
            self.warnings.append(f"[{city_name}] 没有有效数据")
            if self.strict:
                valid = False

        return valid, cleaned

    def validate_all(self, data_list: List[Dict]) -> List[Dict]:
        """验证所有数据"""
        valid_data = []

        for data in data_list:
            is_valid, cleaned = self.validate_city(data)
            if is_valid and cleaned:
                valid_data.append(cleaned)

        return valid_data


def load_merged_data() -> List[Dict]:
    """加载合并后的原始数据"""
    merged_file = RAW_DATA_DIR / 'merged_data.json'

    if not merged_file.exists():
        logger.error(f"合并数据文件不存在: {merged_file}")
        logger.info("请先运行 python crawl_all.py 爬取数据")
        return []

    with open(merged_file, 'r', encoding='utf-8') as f:
        return json.load(f)


def calculate_completeness(data: Dict) -> float:
    """计算数据完整度"""
    key_fields = ['population', 'gdp', 'area', 'avg_price', 'avg_rent',
                  'avg_temp', 'aqi', 'description']
    present = sum(1 for f in key_fields if f in data and data[f])
    return present / len(key_fields)


def generate_report(original: List[Dict], filtered: List[Dict],
                    validator: DataValidator) -> Dict:
    """生成筛选报告"""
    report = {
        'timestamp': datetime.now().isoformat(),
        'stats': {
            'original_count': len(original),
            'filtered_count': len(filtered),
            'pass_rate': f"{len(filtered) / len(original) * 100:.1f}%" if original else "0%"
        },
        'field_coverage': {},
        'completeness': {
            'excellent': 0,  # >80%
            'good': 0,       # 50-80%
            'partial': 0,    # 20-50%
            'poor': 0        # <20%
        },
        'warnings_count': len(validator.warnings),
        'errors_count': len(validator.errors),
        'sample_warnings': validator.warnings[:10] if validator.warnings else [],
        'sample_errors': validator.errors[:10] if validator.errors else []
    }

    # 计算字段覆盖率
    fields = ['population', 'gdp', 'area', 'avg_price', 'avg_rent',
              'avg_temp', 'rainfall', 'aqi', 'hospital_count',
              'university_count', 'description', 'climate_type']

    for field in fields:
        count = sum(1 for d in filtered if field in d and d[field])
        report['field_coverage'][field] = f"{count}/{len(filtered)}"

    # 计算完整度分布
    for data in filtered:
        completeness = calculate_completeness(data)
        if completeness >= 0.8:
            report['completeness']['excellent'] += 1
        elif completeness >= 0.5:
            report['completeness']['good'] += 1
        elif completeness >= 0.2:
            report['completeness']['partial'] += 1
        else:
            report['completeness']['poor'] += 1

    return report


def main():
    parser = argparse.ArgumentParser(description='数据筛选和验证')
    parser.add_argument('--strict', action='store_true', help='严格模式')
    parser.add_argument('--dry-run', action='store_true', help='试运行')

    args = parser.parse_args()

    logger.info("=" * 50)
    logger.info("开始数据筛选和验证")
    logger.info("=" * 50)

    # 加载数据
    original_data = load_merged_data()
    if not original_data:
        return

    logger.info(f"加载原始数据: {len(original_data)} 条")

    # 验证数据
    validator = DataValidator(strict=args.strict)
    filtered_data = validator.validate_all(original_data)

    logger.info(f"验证通过: {len(filtered_data)} 条")
    logger.info(f"警告数: {len(validator.warnings)}")
    logger.info(f"错误数: {len(validator.errors)}")

    # 按完整度排序
    filtered_data.sort(key=lambda x: calculate_completeness(x), reverse=True)

    # 生成报告
    report = generate_report(original_data, filtered_data, validator)

    if args.dry_run:
        logger.info("\n=== 试运行模式 ===")
        logger.info(f"原始数据: {report['stats']['original_count']} 条")
        logger.info(f"筛选通过: {report['stats']['filtered_count']} 条")
        logger.info(f"通过率: {report['stats']['pass_rate']}")
        logger.info("\n字段覆盖率:")
        for field, coverage in report['field_coverage'].items():
            logger.info(f"  - {field}: {coverage}")
        logger.info("\n数据完整度分布:")
        for level, count in report['completeness'].items():
            logger.info(f"  - {level}: {count}")

        if validator.warnings:
            logger.info("\n示例警告:")
            for w in validator.warnings[:5]:
                logger.info(f"  - {w}")
        return

    # 保存筛选后的数据
    FILTERED_DATA_DIR.mkdir(parents=True, exist_ok=True)

    output_file = FILTERED_DATA_DIR / 'city_data.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(filtered_data, f, ensure_ascii=False, indent=2)
    logger.info(f"筛选数据已保存到: {output_file}")

    # 保存报告
    report_file = LOG_DIR / 'filter_report.json'
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with open(report_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    logger.info(f"报告已保存到: {report_file}")

    # 打印摘要
    logger.info("\n" + "=" * 50)
    logger.info("筛选完成!")
    logger.info("=" * 50)
    logger.info(f"原始数据: {report['stats']['original_count']} 条")
    logger.info(f"筛选通过: {report['stats']['filtered_count']} 条")
    logger.info(f"通过率: {report['stats']['pass_rate']}")
    logger.info(f"\n数据完整度分布:")
    logger.info(f"  优秀(>80%): {report['completeness']['excellent']}")
    logger.info(f"  良好(50-80%): {report['completeness']['good']}")
    logger.info(f"  部分(20-50%): {report['completeness']['partial']}")
    logger.info(f"  较少(<20%): {report['completeness']['poor']}")


if __name__ == '__main__':
    main()
