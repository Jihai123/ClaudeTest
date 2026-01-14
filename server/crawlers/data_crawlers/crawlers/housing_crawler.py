#!/usr/bin/env python3
"""
房价租金数据爬虫
数据来源：贝壳找房、安居客、房天下等
"""

import re
import json
from bs4 import BeautifulSoup
from typing import Dict, Any, Optional
from urllib.parse import quote
from .base_crawler import BaseCrawler


class HousingCrawler(BaseCrawler):
    """房价租金爬虫"""

    # 贝壳城市代码映射
    BEIKE_CITY_CODES = {
        '北京': 'bj', '上海': 'sh', '广州': 'gz', '深圳': 'sz',
        '杭州': 'hz', '成都': 'cd', '重庆': 'cq', '武汉': 'wh',
        '西安': 'xa', '南京': 'nj', '天津': 'tj', '苏州': 'su',
        '郑州': 'zz', '长沙': 'cs', '青岛': 'qd', '沈阳': 'sy',
        '大连': 'dl', '厦门': 'xm', '昆明': 'km', '海口': 'hk',
        '贵阳': 'gy', '南宁': 'nn', '福州': 'fz', '合肥': 'hf',
        '济南': 'jn', '石家庄': 'sjz', '太原': 'ty', '兰州': 'lz',
        '南昌': 'nc', '珠海': 'zh', '无锡': 'wx', '宁波': 'nb',
        '温州': 'wz', '佛山': 'fs', '东莞': 'dg', '泉州': 'qz',
        '烟台': 'yt', '威海': 'weihai', '桂林': 'gl', '三亚': 'sanya',
    }

    # 参考房价数据（2024年数据，用于爬取失败时的备用）
    REFERENCE_DATA = {
        '北京': {'avg_price': 65000, 'avg_rent': 6500},
        '上海': {'avg_price': 62000, 'avg_rent': 6000},
        '深圳': {'avg_price': 68000, 'avg_rent': 5500},
        '广州': {'avg_price': 38000, 'avg_rent': 4000},
        '杭州': {'avg_price': 35000, 'avg_rent': 3500},
        '南京': {'avg_price': 32000, 'avg_rent': 3000},
        '成都': {'avg_price': 18000, 'avg_rent': 2000},
        '重庆': {'avg_price': 12000, 'avg_rent': 1500},
        '武汉': {'avg_price': 18000, 'avg_rent': 2000},
        '西安': {'avg_price': 15000, 'avg_rent': 1800},
        '厦门': {'avg_price': 45000, 'avg_rent': 3500},
        '青岛': {'avg_price': 18000, 'avg_rent': 2000},
        '大连': {'avg_price': 14000, 'avg_rent': 1800},
        '昆明': {'avg_price': 13000, 'avg_rent': 1500},
        '海口': {'avg_price': 16000, 'avg_rent': 1800},
        '三亚': {'avg_price': 32000, 'avg_rent': 2500},
        '珠海': {'avg_price': 25000, 'avg_rent': 2500},
        '威海': {'avg_price': 9000, 'avg_rent': 1000},
        '荣成': {'avg_price': 6000, 'avg_rent': 500},
        '大理': {'avg_price': 10000, 'avg_rent': 1200},
        '丽江': {'avg_price': 12000, 'avg_rent': 1500},
        '桂林': {'avg_price': 8000, 'avg_rent': 1000},
    }

    def __init__(self, delay: float = 3.0):
        # 房价网站反爬较严格，增加延迟
        super().__init__(name="HousingCrawler", delay=delay, max_retries=2)

    def crawl_city(self, city_id: int, city_name: str,
                   province: str = None, **kwargs) -> Dict[str, Any]:
        """
        爬取城市房价租金数据

        Returns:
            {
                'avg_price': 平均房价(元/㎡),
                'avg_rent': 平均月租金(元/月),
                'price_trend': 房价趋势('up'/'down'/'stable'),
                'rent_trend': 租金趋势,
                'data_source': 数据来源
            }
        """
        result = {}

        # 尝试从贝壳获取数据
        beike_data = self._crawl_beike(city_name)
        if beike_data:
            result.update(beike_data)
            result['data_source'] = 'beike'

        # 如果贝壳失败，尝试房天下
        if not result:
            fang_data = self._crawl_fang(city_name)
            if fang_data:
                result.update(fang_data)
                result['data_source'] = 'fang'

        # 如果都失败，使用参考数据
        if not result and city_name in self.REFERENCE_DATA:
            self.logger.info(f"  使用参考数据: {city_name}")
            ref = self.REFERENCE_DATA[city_name]
            result = {
                'avg_price': ref['avg_price'],
                'avg_rent': ref['avg_rent'],
                'data_source': 'reference'
            }

        # 根据城市级别推断（如果仍无数据）
        if not result:
            result = self._infer_by_city_tier(city_name, kwargs.get('list_type'))

        return result if result else None

    def _crawl_beike(self, city_name: str) -> Optional[Dict]:
        """从贝壳找房爬取数据"""
        city_code = self.BEIKE_CITY_CODES.get(city_name)

        if not city_code:
            return None

        result = {}

        # 获取二手房均价
        try:
            ershoufang_url = f"https://{city_code}.ke.com/ershoufang/"
            response = self.request(ershoufang_url)

            if response:
                soup = BeautifulSoup(response.text, 'html.parser')
                # 查找均价信息
                price_elem = soup.select_one('.total-price strong')
                if price_elem:
                    price_text = price_elem.get_text(strip=True)
                    # 通常显示的是总价，需要另外获取单价
                    pass

                # 尝试从其他位置获取均价
                avg_price = self._extract_avg_price_from_page(soup)
                if avg_price:
                    result['avg_price'] = avg_price

        except Exception as e:
            self.logger.warning(f"贝壳二手房爬取失败: {e}")

        self.sleep(1)  # 额外延迟

        # 获取租房均价
        try:
            zufang_url = f"https://{city_code}.ke.com/zufang/"
            response = self.request(zufang_url)

            if response:
                soup = BeautifulSoup(response.text, 'html.parser')
                avg_rent = self._extract_avg_rent_from_page(soup)
                if avg_rent:
                    result['avg_rent'] = avg_rent

        except Exception as e:
            self.logger.warning(f"贝壳租房爬取失败: {e}")

        return result if result else None

    def _extract_avg_price_from_page(self, soup: BeautifulSoup) -> Optional[int]:
        """从页面提取平均房价"""
        # 贝壳页面结构可能变化，尝试多种选择器
        selectors = [
            '.average-price span',
            '.total span',
            '.price-info .average',
        ]

        for selector in selectors:
            elem = soup.select_one(selector)
            if elem:
                text = elem.get_text(strip=True)
                match = re.search(r'(\d+)', text)
                if match:
                    return int(match.group(1))

        # 尝试从房源列表估算
        prices = []
        for item in soup.select('.info .price-pre')[:10]:
            text = item.get_text(strip=True)
            match = re.search(r'(\d+)', text)
            if match:
                prices.append(int(match.group(1)))

        if prices:
            return int(sum(prices) / len(prices))

        return None

    def _extract_avg_rent_from_page(self, soup: BeautifulSoup) -> Optional[int]:
        """从页面提取平均租金"""
        rents = []

        # 从租房列表获取价格
        for item in soup.select('.content__list--item--main')[:10]:
            price_elem = item.select_one('.content__list--item-price em')
            if price_elem:
                text = price_elem.get_text(strip=True)
                match = re.search(r'(\d+)', text)
                if match:
                    rents.append(int(match.group(1)))

        if rents:
            return int(sum(rents) / len(rents))

        return None

    def _crawl_fang(self, city_name: str) -> Optional[Dict]:
        """从房天下爬取数据（备用）"""
        # 房天下的城市编码需要另外映射
        # 这里简化处理，直接返回None
        # 实际使用可以扩展
        return None

    def _infer_by_city_tier(self, city_name: str, list_type: str = None) -> Dict:
        """根据城市级别推断房价租金"""
        # 一线城市
        tier1 = ['北京', '上海', '广州', '深圳']
        # 新一线
        new_tier1 = ['成都', '杭州', '重庆', '武汉', '西安', '苏州', '南京',
                     '天津', '郑州', '长沙', '东莞', '佛山', '宁波', '青岛']
        # 二线
        tier2 = ['无锡', '合肥', '昆明', '沈阳', '济南', '大连', '厦门',
                 '福州', '哈尔滨', '南宁', '贵阳', '石家庄', '太原', '南昌']

        if city_name in tier1:
            return {
                'avg_price': 55000,
                'avg_rent': 5000,
                'data_source': 'inferred_tier1'
            }
        elif city_name in new_tier1:
            return {
                'avg_price': 20000,
                'avg_rent': 2500,
                'data_source': 'inferred_new_tier1'
            }
        elif city_name in tier2:
            return {
                'avg_price': 15000,
                'avg_rent': 1800,
                'data_source': 'inferred_tier2'
            }
        elif list_type == 'china_layflat':
            # 躺平小城市
            return {
                'avg_price': 8000,
                'avg_rent': 800,
                'data_source': 'inferred_small'
            }
        else:
            # 普通三四线城市
            return {
                'avg_price': 10000,
                'avg_rent': 1200,
                'data_source': 'inferred_default'
            }
