#!/usr/bin/env python3
"""
生活质量数据爬虫
数据来源：
- AQI: 生态环境部、天气网
- 医院: 卫健委、百度地图
- 高校: 教育部、百度百科
"""

import re
import json
from bs4 import BeautifulSoup
from typing import Dict, Any, Optional, List
from urllib.parse import quote
from .base_crawler import BaseCrawler


class QualityCrawler(BaseCrawler):
    """生活质量数据爬虫"""

    # 主要城市AQI参考数据（年均值，2023年数据）
    AQI_REFERENCE = {
        # 空气质量较好的城市
        '海口': 25, '三亚': 28, '丽江': 30, '大理': 32,
        '昆明': 35, '厦门': 38, '珠海': 40, '深圳': 42,
        '拉萨': 30, '西宁': 45, '贵阳': 40, '福州': 38,
        # 中等城市
        '广州': 50, '杭州': 52, '南京': 55, '青岛': 48,
        '大连': 45, '宁波': 50, '苏州': 55, '无锡': 58,
        '成都': 70, '重庆': 65, '武汉': 60, '长沙': 58,
        '南昌': 55, '合肥': 60, '济南': 70, '郑州': 85,
        # 空气质量较差的城市
        '北京': 75, '天津': 80, '石家庄': 100, '太原': 90,
        '西安': 85, '沈阳': 70, '哈尔滨': 75, '兰州': 80,
        '银川': 75, '乌鲁木齐': 90,
        # 小城市
        '威海': 40, '荣成': 38, '桂林': 42, '北海': 35,
        '舟山': 35, '惠州': 45, '中山': 48,
    }

    # 主要城市三甲医院数量参考
    HOSPITAL_REFERENCE = {
        '北京': 89, '上海': 65, '广州': 55, '深圳': 25,
        '杭州': 30, '南京': 35, '成都': 45, '重庆': 40,
        '武汉': 38, '西安': 32, '天津': 35, '苏州': 18,
        '郑州': 28, '长沙': 25, '青岛': 20, '沈阳': 28,
        '大连': 15, '厦门': 12, '昆明': 22, '海口': 8,
        '三亚': 3, '贵阳': 18, '南宁': 15, '福州': 18,
        '合肥': 20, '济南': 25, '石家庄': 22, '太原': 18,
        '兰州': 15, '南昌': 15, '珠海': 5, '无锡': 12,
        '宁波': 12, '温州': 10, '佛山': 10, '东莞': 8,
        '威海': 3, '荣成': 1, '桂林': 5, '大理': 2, '丽江': 1,
    }

    # 主要城市高校数量参考
    UNIVERSITY_REFERENCE = {
        '北京': 92, '上海': 64, '广州': 83, '武汉': 83,
        '西安': 63, '南京': 51, '成都': 56, '天津': 57,
        '重庆': 65, '杭州': 47, '郑州': 65, '长沙': 57,
        '沈阳': 45, '哈尔滨': 51, '济南': 43, '南昌': 53,
        '合肥': 50, '昆明': 52, '太原': 49, '石家庄': 48,
        '福州': 35, '南宁': 45, '贵阳': 42, '兰州': 33,
        '海口': 19, '青岛': 25, '大连': 30, '厦门': 16,
        '苏州': 25, '无锡': 12, '宁波': 15, '温州': 10,
        '珠海': 10, '深圳': 15, '东莞': 8, '佛山': 10,
        '三亚': 5, '威海': 3, '桂林': 15,
    }

    def __init__(self, delay: float = 2.0):
        super().__init__(name="QualityCrawler", delay=delay)

    def crawl_city(self, city_id: int, city_name: str,
                   province: str = None, **kwargs) -> Dict[str, Any]:
        """
        爬取城市生活质量数据

        Returns:
            {
                'aqi': 年均AQI,
                'aqi_level': AQI等级描述,
                'hospital_count': 三甲医院数量,
                'university_count': 高校数量,
                'safety_index': 安全指数(如有),
                'data_source': 数据来源
            }
        """
        result = {}

        # 获取AQI数据
        aqi_data = self._get_aqi_data(city_name, province)
        if aqi_data:
            result.update(aqi_data)

        # 获取医院数据
        hospital_data = self._get_hospital_data(city_name, province)
        if hospital_data:
            result.update(hospital_data)

        # 获取高校数据
        university_data = self._get_university_data(city_name, province)
        if university_data:
            result.update(university_data)

        # 计算综合生活质量评分
        if result:
            result['quality_score'] = self._calculate_quality_score(result)

        return result if result else None

    def _get_aqi_data(self, city_name: str, province: str = None) -> Dict:
        """获取空气质量数据"""
        result = {}

        # 尝试从API获取实时数据
        api_data = self._crawl_aqi_api(city_name)
        if api_data:
            result.update(api_data)
            result['aqi_source'] = 'api'
        # 使用参考数据
        elif city_name in self.AQI_REFERENCE:
            aqi = self.AQI_REFERENCE[city_name]
            result['aqi'] = aqi
            result['aqi_level'] = self._get_aqi_level(aqi)
            result['aqi_source'] = 'reference'
        # 根据省份推断
        elif province:
            aqi = self._infer_aqi_by_province(province)
            result['aqi'] = aqi
            result['aqi_level'] = self._get_aqi_level(aqi)
            result['aqi_source'] = 'inferred'

        return result

    def _crawl_aqi_api(self, city_name: str) -> Optional[Dict]:
        """从公开API获取AQI数据"""
        # 使用天气网的空气质量数据
        try:
            url = f"http://www.pm25.com/{quote(city_name)}.html"
            response = self.request(url, timeout=10)

            if response and response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                aqi_elem = soup.select_one('.aqi_value')
                if aqi_elem:
                    aqi_text = aqi_elem.get_text(strip=True)
                    match = re.search(r'(\d+)', aqi_text)
                    if match:
                        aqi = int(match.group(1))
                        return {
                            'aqi': aqi,
                            'aqi_level': self._get_aqi_level(aqi)
                        }
        except Exception as e:
            self.logger.debug(f"AQI API获取失败: {e}")

        return None

    def _get_aqi_level(self, aqi: int) -> str:
        """根据AQI值返回等级描述"""
        if aqi <= 50:
            return '优'
        elif aqi <= 100:
            return '良'
        elif aqi <= 150:
            return '轻度污染'
        elif aqi <= 200:
            return '中度污染'
        elif aqi <= 300:
            return '重度污染'
        else:
            return '严重污染'

    def _infer_aqi_by_province(self, province: str) -> int:
        """根据省份推断AQI"""
        # 空气质量较好的省份
        good_provinces = ['海南', '云南', '贵州', '福建', '广东', '广西', '西藏']
        # 空气质量中等的省份
        medium_provinces = ['浙江', '江苏', '四川', '重庆', '湖南', '湖北', '江西', '安徽']
        # 空气质量较差的省份
        poor_provinces = ['河北', '河南', '山西', '陕西', '山东', '北京', '天津']

        prov = province.replace('省', '').replace('市', '').replace('自治区', '')

        if any(p in prov for p in good_provinces):
            return 40
        elif any(p in prov for p in medium_provinces):
            return 60
        elif any(p in prov for p in poor_provinces):
            return 85
        else:
            return 65

    def _get_hospital_data(self, city_name: str, province: str = None) -> Dict:
        """获取医院数据"""
        result = {}

        # 使用参考数据
        if city_name in self.HOSPITAL_REFERENCE:
            result['hospital_count'] = self.HOSPITAL_REFERENCE[city_name]
            result['hospital_source'] = 'reference'
        # 根据城市级别推断
        else:
            count = self._infer_hospital_count(city_name, province)
            result['hospital_count'] = count
            result['hospital_source'] = 'inferred'

        return result

    def _infer_hospital_count(self, city_name: str, province: str = None) -> int:
        """推断三甲医院数量"""
        # 一线城市
        tier1 = ['北京', '上海', '广州', '深圳']
        # 新一线城市
        new_tier1 = ['成都', '杭州', '重庆', '武汉', '西安', '苏州', '南京',
                     '天津', '郑州', '长沙', '东莞', '佛山', '宁波', '青岛']
        # 二线城市
        tier2 = ['无锡', '合肥', '昆明', '沈阳', '济南', '大连', '厦门',
                 '福州', '哈尔滨', '南宁', '贵阳', '石家庄', '太原', '南昌']

        if city_name in tier1:
            return 50
        elif city_name in new_tier1:
            return 25
        elif city_name in tier2:
            return 15
        else:
            return 5  # 三四线城市

    def _get_university_data(self, city_name: str, province: str = None) -> Dict:
        """获取高校数据"""
        result = {}

        # 使用参考数据
        if city_name in self.UNIVERSITY_REFERENCE:
            result['university_count'] = self.UNIVERSITY_REFERENCE[city_name]
            result['university_source'] = 'reference'
        # 根据城市级别推断
        else:
            count = self._infer_university_count(city_name, province)
            result['university_count'] = count
            result['university_source'] = 'inferred'

        return result

    def _infer_university_count(self, city_name: str, province: str = None) -> int:
        """推断高校数量"""
        tier1 = ['北京', '上海', '广州', '深圳']
        new_tier1 = ['成都', '杭州', '重庆', '武汉', '西安', '苏州', '南京',
                     '天津', '郑州', '长沙']
        tier2 = ['无锡', '合肥', '昆明', '沈阳', '济南', '大连', '厦门',
                 '福州', '哈尔滨', '南宁', '贵阳', '石家庄', '太原', '南昌']

        if city_name in tier1:
            return 60
        elif city_name in new_tier1:
            return 40
        elif city_name in tier2:
            return 25
        else:
            return 5

    def _calculate_quality_score(self, data: Dict) -> float:
        """计算综合生活质量评分（10分制）"""
        score = 5.0  # 基础分

        # AQI评分（满分3分）
        aqi = data.get('aqi', 60)
        if aqi <= 35:
            score += 3.0
        elif aqi <= 50:
            score += 2.5
        elif aqi <= 75:
            score += 2.0
        elif aqi <= 100:
            score += 1.0
        else:
            score += 0

        # 医院评分（满分1分）
        hospitals = data.get('hospital_count', 5)
        if hospitals >= 30:
            score += 1.0
        elif hospitals >= 15:
            score += 0.7
        elif hospitals >= 5:
            score += 0.4
        else:
            score += 0.2

        # 高校评分（满分1分）
        universities = data.get('university_count', 5)
        if universities >= 50:
            score += 1.0
        elif universities >= 25:
            score += 0.7
        elif universities >= 10:
            score += 0.4
        else:
            score += 0.2

        return round(min(10.0, score), 1)
