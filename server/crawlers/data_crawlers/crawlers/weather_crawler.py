#!/usr/bin/env python3
"""
天气/气候数据爬虫
数据来源：中国天气网、和风天气等
"""

import re
from bs4 import BeautifulSoup
from typing import Dict, Any, Optional
from urllib.parse import quote
from .base_crawler import BaseCrawler


class WeatherCrawler(BaseCrawler):
    """天气数据爬虫"""

    # 中国天气网城市代码映射（主要城市）
    CITY_CODES = {
        '北京': '101010100', '上海': '101020100', '广州': '101280101',
        '深圳': '101280601', '杭州': '101210101', '成都': '101270101',
        '重庆': '101040100', '武汉': '101200101', '西安': '101110101',
        '南京': '101190101', '天津': '101030100', '苏州': '101190401',
        '郑州': '101180101', '长沙': '101250101', '青岛': '101120201',
        '沈阳': '101070101', '大连': '101070201', '厦门': '101230201',
        '昆明': '101290101', '海口': '101310101', '三亚': '101310201',
        '贵阳': '101260101', '南宁': '101300101', '福州': '101230101',
        '合肥': '101220101', '济南': '101120101', '石家庄': '101090101',
        '太原': '101100101', '兰州': '101160101', '银川': '101170101',
        '西宁': '101150101', '拉萨': '101140101', '乌鲁木齐': '101130101',
        '呼和浩特': '101080101', '哈尔滨': '101050101', '长春': '101060101',
        '南昌': '101240101', '珠海': '101280701', '无锡': '101190201',
        '宁波': '101210401', '温州': '101210701', '佛山': '101280800',
        '东莞': '101281601', '泉州': '101230501', '烟台': '101120501',
        '威海': '101121301', '秦皇岛': '101091101', '桂林': '101300501',
        '丽江': '101291401', '大理': '101290201', '三亚': '101310201',
        '荣成': '101121304', '威海': '101121301',
    }

    def __init__(self, delay: float = 2.0):
        super().__init__(name="WeatherCrawler", delay=delay)
        # 各城市气候参考数据（用于无法爬取时的备用数据）
        self.climate_reference = self._load_climate_reference()

    def _load_climate_reference(self) -> Dict:
        """加载气候参考数据"""
        # 主要城市的年平均温度和降水量参考数据
        return {
            '北京': {'avg_temp': 12.9, 'rainfall': 571, 'climate': '温带季风气候'},
            '上海': {'avg_temp': 16.7, 'rainfall': 1166, 'climate': '亚热带季风气候'},
            '广州': {'avg_temp': 22.3, 'rainfall': 1736, 'climate': '亚热带季风气候'},
            '深圳': {'avg_temp': 23.0, 'rainfall': 1933, 'climate': '亚热带海洋性季风气候'},
            '杭州': {'avg_temp': 17.0, 'rainfall': 1454, 'climate': '亚热带季风气候'},
            '成都': {'avg_temp': 16.5, 'rainfall': 900, 'climate': '亚热带季风气候'},
            '重庆': {'avg_temp': 18.3, 'rainfall': 1082, 'climate': '亚热带季风气候'},
            '武汉': {'avg_temp': 17.0, 'rainfall': 1269, 'climate': '亚热带季风气候'},
            '西安': {'avg_temp': 14.1, 'rainfall': 553, 'climate': '温带季风气候'},
            '南京': {'avg_temp': 15.9, 'rainfall': 1090, 'climate': '亚热带季风气候'},
            '昆明': {'avg_temp': 15.5, 'rainfall': 1035, 'climate': '亚热带高原季风气候'},
            '海口': {'avg_temp': 24.4, 'rainfall': 1664, 'climate': '热带季风气候'},
            '三亚': {'avg_temp': 25.7, 'rainfall': 1263, 'climate': '热带海洋性季风气候'},
            '大连': {'avg_temp': 10.9, 'rainfall': 600, 'climate': '温带季风气候'},
            '青岛': {'avg_temp': 12.7, 'rainfall': 662, 'climate': '温带季风气候'},
            '厦门': {'avg_temp': 21.0, 'rainfall': 1143, 'climate': '亚热带海洋性季风气候'},
            '珠海': {'avg_temp': 22.4, 'rainfall': 1964, 'climate': '亚热带季风气候'},
            '威海': {'avg_temp': 12.1, 'rainfall': 730, 'climate': '温带季风气候'},
            '桂林': {'avg_temp': 19.1, 'rainfall': 1900, 'climate': '亚热带季风气候'},
            '丽江': {'avg_temp': 12.6, 'rainfall': 950, 'climate': '亚热带高原季风气候'},
            '大理': {'avg_temp': 15.1, 'rainfall': 1078, 'climate': '亚热带高原季风气候'},
            '荣成': {'avg_temp': 11.8, 'rainfall': 762, 'climate': '温带季风气候'},
        }

    def crawl_city(self, city_id: int, city_name: str,
                   province: str = None, **kwargs) -> Dict[str, Any]:
        """
        爬取城市气候数据

        Returns:
            {
                'avg_temp': 年平均温度(℃),
                'avg_high_temp': 年平均最高温度(℃),
                'avg_low_temp': 年平均最低温度(℃),
                'rainfall': 年降水量(mm),
                'climate_type': 气候类型,
                'best_months': 最佳旅游月份,
                'humidity': 平均湿度
            }
        """
        result = {}

        # 尝试从中国天气网获取数据
        weather_data = self._crawl_weather_cn(city_name)
        if weather_data:
            result.update(weather_data)

        # 如果爬取失败，使用参考数据
        if not result and city_name in self.climate_reference:
            self.logger.info(f"  使用参考数据: {city_name}")
            ref = self.climate_reference[city_name]
            result = {
                'avg_temp': ref['avg_temp'],
                'rainfall': ref['rainfall'],
                'climate_type': ref['climate'],
                'data_source': 'reference'
            }

        # 根据省份推断气候（如果仍无数据）
        if not result and province:
            result = self._infer_climate_by_province(province)

        # 添加最佳旅游月份
        if 'avg_temp' in result:
            result['best_months'] = self._calculate_best_months(
                result.get('avg_temp'),
                result.get('climate_type', '')
            )

        return result if result else None

    def _crawl_weather_cn(self, city_name: str) -> Optional[Dict]:
        """从中国天气网爬取数据"""
        city_code = self.CITY_CODES.get(city_name)

        if not city_code:
            # 尝试搜索城市代码
            city_code = self._search_city_code(city_name)

        if not city_code:
            return None

        # 获取历史天气数据页面
        url = f"http://www.weather.com.cn/weather1d/{city_code}.shtml"
        response = self.request(url)

        if not response:
            return None

        try:
            soup = BeautifulSoup(response.text, 'html.parser')
            result = {}

            # 尝试解析当前天气信息
            temp_elem = soup.select_one('.tem span')
            if temp_elem:
                temp_text = temp_elem.get_text(strip=True)
                match = re.search(r'(\d+)', temp_text)
                if match:
                    # 这是当前温度，用于参考
                    result['current_temp'] = int(match.group(1))

            return result if result else None

        except Exception as e:
            self.logger.warning(f"解析天气数据失败: {e}")
            return None

    def _search_city_code(self, city_name: str) -> Optional[str]:
        """搜索城市代码"""
        # 使用中国天气网的搜索接口
        search_url = f"http://toy1.weather.com.cn/search?cityname={quote(city_name)}"

        response = self.request(search_url)
        if not response:
            return None

        try:
            # 响应格式: var keyword=[{...}]
            text = response.text
            match = re.search(r'"ref":"(\d+)~', text)
            if match:
                return match.group(1)
        except Exception:
            pass

        return None

    def _infer_climate_by_province(self, province: str) -> Dict:
        """根据省份推断气候数据"""
        # 省份气候分区
        tropical = ['海南', '广东', '广西', '云南', '福建']
        subtropical = ['浙江', '江苏', '安徽', '湖北', '湖南', '江西',
                      '贵州', '四川', '重庆', '上海']
        temperate = ['北京', '天津', '河北', '山东', '河南', '山西',
                    '陕西', '辽宁', '吉林']
        cold = ['黑龙江', '内蒙古', '新疆', '西藏', '青海', '甘肃', '宁夏']

        # 清理省份名
        prov = province.replace('省', '').replace('市', '').replace('自治区', '')

        if any(p in prov for p in tropical):
            return {
                'avg_temp': 22.0,
                'rainfall': 1500,
                'climate_type': '亚热带/热带季风气候',
                'data_source': 'inferred'
            }
        elif any(p in prov for p in subtropical):
            return {
                'avg_temp': 16.5,
                'rainfall': 1100,
                'climate_type': '亚热带季风气候',
                'data_source': 'inferred'
            }
        elif any(p in prov for p in temperate):
            return {
                'avg_temp': 13.0,
                'rainfall': 600,
                'climate_type': '温带季风气候',
                'data_source': 'inferred'
            }
        elif any(p in prov for p in cold):
            return {
                'avg_temp': 6.0,
                'rainfall': 400,
                'climate_type': '温带大陆性气候',
                'data_source': 'inferred'
            }

        return {
            'avg_temp': 15.0,
            'rainfall': 800,
            'climate_type': '温带气候',
            'data_source': 'inferred'
        }

    def _calculate_best_months(self, avg_temp: float, climate_type: str) -> str:
        """计算最佳旅游月份"""
        if avg_temp >= 22:
            # 热带/亚热带，避开夏天
            return '10-4月'
        elif avg_temp >= 16:
            # 温暖地区
            return '3-5月, 9-11月'
        elif avg_temp >= 10:
            # 温带
            return '4-6月, 9-10月'
        else:
            # 寒冷地区
            return '6-9月'
