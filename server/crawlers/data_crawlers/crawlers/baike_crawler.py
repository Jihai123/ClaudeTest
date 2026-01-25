#!/usr/bin/env python3
"""
百度百科爬虫
用于获取城市基础数据（人口、GDP、面积）和城市介绍
当爬取失败时使用参考数据作为备用
"""

import re
from bs4 import BeautifulSoup
from typing import Dict, Any, Optional
from urllib.parse import quote
from .base_crawler import BaseCrawler
from .reference_data import get_city_data


class BaikeCrawler(BaseCrawler):
    """百度百科爬虫"""

    BASE_URL = "https://baike.baidu.com"
    SEARCH_URL = "https://baike.baidu.com/item/{}"

    def __init__(self, delay: float = 2.0):
        super().__init__(name="BaikeCrawler", delay=delay)
        self._initialized = False

    def _init_session(self):
        """初始化会话，访问主页获取Cookie"""
        if self._initialized:
            return
        try:
            # 先访问主页获取Cookie
            self.request(self.BASE_URL, headers={'Referer': 'https://www.baidu.com/'})
            self._initialized = True
            self.sleep(1)
        except Exception:
            pass

    def crawl_city(self, city_id: int, city_name: str,
                   province: str = None, **kwargs) -> Dict[str, Any]:
        """
        从百度百科爬取城市基础数据

        Returns:
            {
                'population': 人口(万人),
                'gdp': GDP(亿元),
                'area': 面积(km²),
                'description': 城市简介,
                'famous_places': 著名景点列表,
                'climate_type': 气候类型,
                'features': 城市特色标签
            }
        """
        # 初始化会话
        self._init_session()

        # 构建搜索词
        search_term = city_name
        if province and city_name not in ['北京', '上海', '天津', '重庆']:
            search_term = f"{city_name}市"

        url = self.SEARCH_URL.format(quote(search_term))
        response = self.request(url, headers={'Referer': self.BASE_URL + '/'})

        if not response:
            # 尝试不加"市"
            self.sleep(1)
            url = self.SEARCH_URL.format(quote(city_name))
            response = self.request(url, headers={'Referer': self.BASE_URL + '/'})

        if not response:
            # 爬取失败，使用参考数据
            self.logger.warning(f"  爬取失败，使用参考数据")
            return self._get_reference_data(city_name)

        result = self._parse_baike_page(response.text, city_name)
        if not result or not any(result.values()):
            # 解析失败，使用参考数据
            self.logger.warning(f"  解析失败，使用参考数据")
            return self._get_reference_data(city_name)

        return result

    def _get_reference_data(self, city_name: str) -> Optional[Dict[str, Any]]:
        """获取参考数据"""
        ref_data = get_city_data(city_name)
        if ref_data:
            self.logger.info(f"  使用参考数据: {city_name}")
            return {
                'population': ref_data.get('population'),
                'gdp': ref_data.get('gdp'),
                'area': ref_data.get('area'),
                'description': ref_data.get('description'),
                'climate_type': ref_data.get('climate'),
                'famous_places': ref_data.get('famous_places', []),
                'features': [],
                'source': 'reference_data',
            }
        return None

    def _parse_baike_page(self, html: str, city_name: str) -> Dict[str, Any]:
        """解析百度百科页面"""
        soup = BeautifulSoup(html, 'html.parser')
        result = {}

        # 解析信息框（infobox）
        infobox = self._parse_infobox(soup)
        result.update(infobox)

        # 解析城市简介
        description = self._parse_description(soup)
        if description:
            result['description'] = description

        # 解析著名景点
        famous_places = self._parse_famous_places(soup, city_name)
        if famous_places:
            result['famous_places'] = famous_places

        # 解析城市特色
        features = self._extract_features(soup, city_name, infobox)
        if features:
            result['features'] = features

        return result if result else None

    def _parse_infobox(self, soup: BeautifulSoup) -> Dict[str, Any]:
        """解析信息框获取基础数据"""
        result = {}

        # 查找基本信息模块
        # 新版百度百科使用不同的结构
        info_items = soup.select('.basicInfo-item')
        if not info_items:
            # 尝试旧版结构
            info_items = soup.select('.basic-info .basicInfo-item')

        info_dict = {}

        # 解析所有信息项
        current_name = None
        for item in info_items:
            name_elem = item.select_one('.basicInfo-item-name')
            value_elem = item.select_one('.basicInfo-item-value')

            if name_elem and value_elem:
                name = name_elem.get_text(strip=True)
                value = value_elem.get_text(strip=True)
                info_dict[name] = value

        # 也尝试用dt/dd结构
        for dt in soup.select('dt.basicInfo-item'):
            dd = dt.find_next_sibling('dd')
            if dd:
                name = dt.get_text(strip=True)
                value = dd.get_text(strip=True)
                info_dict[name] = value

        # 提取人口
        population = self._extract_population(info_dict)
        if population:
            result['population'] = population

        # 提取GDP
        gdp = self._extract_gdp(info_dict)
        if gdp:
            result['gdp'] = gdp

        # 提取面积
        area = self._extract_area(info_dict)
        if area:
            result['area'] = area

        # 提取气候类型
        climate = self._extract_climate(info_dict)
        if climate:
            result['climate_type'] = climate

        # 提取行政区划代码等其他信息
        if '邮政编码' in info_dict:
            result['postal_code'] = info_dict['邮政编码']
        if '电话区号' in info_dict:
            result['area_code'] = info_dict['电话区号']

        return result

    def _extract_population(self, info_dict: Dict) -> Optional[float]:
        """提取人口数据（返回万人）"""
        pop_keys = ['常住人口', '户籍人口', '人口', '人    口', '总人口']

        for key in pop_keys:
            if key in info_dict:
                value = info_dict[key]
                return self._parse_population_value(value)

        return None

    def _parse_population_value(self, value: str) -> Optional[float]:
        """解析人口数值"""
        # 移除括号内的年份信息等
        value = re.sub(r'\([^)]*\)', '', value)
        value = re.sub(r'（[^）]*）', '', value)
        value = value.strip()

        # 匹配各种格式
        patterns = [
            (r'([\d.]+)\s*万人?', lambda m: float(m.group(1))),  # xxx万人
            (r'([\d.]+)\s*亿人?', lambda m: float(m.group(1)) * 10000),  # x亿人
            (r'([\d,]+)\s*人', lambda m: float(m.group(1).replace(',', '')) / 10000),  # xxx人
            (r'^([\d.]+)$', lambda m: float(m.group(1))),  # 纯数字（假设为万人）
        ]

        for pattern, converter in patterns:
            match = re.search(pattern, value)
            if match:
                try:
                    return converter(match)
                except (ValueError, TypeError):
                    continue

        return None

    def _extract_gdp(self, info_dict: Dict) -> Optional[float]:
        """提取GDP数据（返回亿元）"""
        gdp_keys = ['地区生产总值', 'GDP', '生产总值', '国内生产总值']

        for key in gdp_keys:
            if key in info_dict:
                value = info_dict[key]
                return self._parse_gdp_value(value)

        return None

    def _parse_gdp_value(self, value: str) -> Optional[float]:
        """解析GDP数值"""
        # 移除括号内的年份信息等
        value = re.sub(r'\([^)]*\)', '', value)
        value = re.sub(r'（[^）]*）', '', value)
        value = value.strip()

        patterns = [
            (r'([\d.]+)\s*万亿', lambda m: float(m.group(1)) * 10000),  # x万亿
            (r'([\d.]+)\s*亿', lambda m: float(m.group(1))),  # xxx亿
            (r'([\d.]+)\s*billion', lambda m: float(m.group(1)) * 10000 / 7),  # billion USD
        ]

        for pattern, converter in patterns:
            match = re.search(pattern, value, re.IGNORECASE)
            if match:
                try:
                    return converter(match)
                except (ValueError, TypeError):
                    continue

        return None

    def _extract_area(self, info_dict: Dict) -> Optional[float]:
        """提取面积数据（返回km²）"""
        area_keys = ['面积', '总面积', '面    积', '行政区域面积', '辖区面积']

        for key in area_keys:
            if key in info_dict:
                value = info_dict[key]
                return self._parse_area_value(value)

        return None

    def _parse_area_value(self, value: str) -> Optional[float]:
        """解析面积数值"""
        value = re.sub(r'\([^)]*\)', '', value)
        value = re.sub(r'（[^）]*）', '', value)
        value = value.strip()

        patterns = [
            # 先匹配"万平方公里"（优先级高）
            (r'([\d.]+)\s*万\s*(?:平方公里|平方千米|km²|㎢)', lambda m: float(m.group(1)) * 10000),
            # 再匹配普通的"平方公里"
            (r'([\d,.]+)\s*(?:平方公里|平方千米|km²|㎢)', lambda m: float(m.group(1).replace(',', ''))),
        ]

        for pattern, converter in patterns:
            match = re.search(pattern, value, re.IGNORECASE)
            if match:
                try:
                    return converter(match)
                except (ValueError, TypeError):
                    continue

        # 尝试直接提取数字
        match = re.search(r'([\d.]+)', value)
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                pass

        return None

    def _extract_climate(self, info_dict: Dict) -> Optional[str]:
        """提取气候类型"""
        climate_keys = ['气候条件', '气候类型', '气候', '气    候']

        for key in climate_keys:
            if key in info_dict:
                value = info_dict[key]
                # 清理并返回
                value = re.sub(r'\([^)]*\)', '', value)
                value = re.sub(r'（[^）]*）', '', value)
                return value.strip()

        return None

    def _parse_description(self, soup: BeautifulSoup) -> Optional[str]:
        """解析城市简介（第一段概述）"""
        # 尝试找概述部分
        summary_selectors = [
            '.lemma-summary .para',
            '.lemmaWgt-lemmaSummary .para',
            '.J-summary .para',
            '.lemma-summary',
        ]

        for selector in summary_selectors:
            summary = soup.select_one(selector)
            if summary:
                text = summary.get_text(strip=True)
                # 清理引用标记
                text = re.sub(r'\[\d+\]', '', text)
                text = re.sub(r'\s+', ' ', text)

                # 截取合适长度（100-200字）
                if len(text) > 200:
                    # 在句号处截断
                    cut_pos = text.find('。', 150)
                    if cut_pos > 0 and cut_pos < 250:
                        text = text[:cut_pos + 1]
                    else:
                        text = text[:200] + '...'

                return text if len(text) > 20 else None

        return None

    def _parse_famous_places(self, soup: BeautifulSoup, city_name: str) -> list:
        """解析著名景点"""
        famous_places = []

        # 从信息框获取
        info_items = soup.select('.basicInfo-item')
        for item in info_items:
            name_elem = item.select_one('.basicInfo-item-name')
            value_elem = item.select_one('.basicInfo-item-value')

            if name_elem and value_elem:
                name = name_elem.get_text(strip=True)
                if '景点' in name or '景区' in name or '旅游' in name:
                    value = value_elem.get_text(strip=True)
                    # 分割景点
                    places = re.split(r'[、,，;；]', value)
                    famous_places.extend([p.strip() for p in places if p.strip()])

        # 去重并限制数量
        famous_places = list(dict.fromkeys(famous_places))[:10]

        return famous_places

    def _extract_features(self, soup: BeautifulSoup, city_name: str,
                         infobox: Dict) -> list:
        """提取城市特色标签"""
        features = []

        # 根据气候类型添加标签
        climate = infobox.get('climate_type', '')
        if '亚热带' in climate:
            features.append('亚热带气候')
        elif '温带' in climate:
            features.append('温带气候')
        elif '热带' in climate:
            features.append('热带气候')
        elif '高原' in climate:
            features.append('高原气候')

        # 检查是否沿海
        desc = self._parse_description(soup) or ''
        if any(kw in desc for kw in ['沿海', '海滨', '港口', '海岸']):
            features.append('沿海城市')

        # 检查是否历史文化名城
        if any(kw in desc for kw in ['历史文化名城', '古都', '历史悠久']):
            features.append('历史名城')

        # 检查是否旅游城市
        if any(kw in desc for kw in ['旅游', '风景', '5A景区']):
            features.append('旅游城市')

        return features[:5]  # 限制标签数量
