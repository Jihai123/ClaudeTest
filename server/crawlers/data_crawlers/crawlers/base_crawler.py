#!/usr/bin/env python3
"""
爬虫基类
提供通用的HTTP请求、重试、日志等功能
"""

import requests
import time
import random
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from pathlib import Path
import json

class BaseCrawler(ABC):
    """爬虫基类"""

    # 常用User-Agent列表
    USER_AGENTS = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    ]

    def __init__(self, name: str, delay: float = 2.0, max_retries: int = 3):
        """
        初始化爬虫

        Args:
            name: 爬虫名称
            delay: 请求间隔（秒）
            max_retries: 最大重试次数
        """
        self.name = name
        self.delay = delay
        self.max_retries = max_retries
        self.session = requests.Session()
        self.logger = logging.getLogger(name)

        # 设置日志
        if not self.logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
            self.logger.setLevel(logging.INFO)

    def get_headers(self) -> Dict[str, str]:
        """获取随机请求头"""
        return {
            'User-Agent': random.choice(self.USER_AGENTS),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Cache-Control': 'max-age=0',
        }

    def request(self, url: str, method: str = 'GET',
                params: Optional[Dict] = None,
                data: Optional[Dict] = None,
                json_data: Optional[Dict] = None,
                headers: Optional[Dict] = None,
                timeout: int = 30) -> Optional[requests.Response]:
        """
        发送HTTP请求，带重试机制

        Args:
            url: 请求URL
            method: 请求方法
            params: URL参数
            data: 表单数据
            json_data: JSON数据
            headers: 自定义请求头
            timeout: 超时时间

        Returns:
            响应对象或None
        """
        req_headers = self.get_headers()
        if headers:
            req_headers.update(headers)

        for attempt in range(self.max_retries):
            try:
                response = self.session.request(
                    method=method,
                    url=url,
                    params=params,
                    data=data,
                    json=json_data,
                    headers=req_headers,
                    timeout=timeout
                )
                response.raise_for_status()
                return response

            except requests.exceptions.RequestException as e:
                self.logger.warning(
                    f"请求失败 (尝试 {attempt + 1}/{self.max_retries}): {url} - {e}"
                )
                if attempt < self.max_retries - 1:
                    wait_time = (attempt + 1) * 2 + random.random()
                    time.sleep(wait_time)

        self.logger.error(f"请求最终失败: {url}")
        return None

    def sleep(self, extra_delay: float = 0):
        """随机延迟，避免被封IP"""
        sleep_time = self.delay + random.uniform(0, 1) + extra_delay
        time.sleep(sleep_time)

    @abstractmethod
    def crawl_city(self, city_id: int, city_name: str,
                   province: str = None, **kwargs) -> Dict[str, Any]:
        """
        爬取单个城市数据

        Args:
            city_id: 城市ID
            city_name: 城市名称
            province: 省份
            **kwargs: 其他参数

        Returns:
            爬取到的数据字典
        """
        pass

    def crawl_cities(self, cities: List[Dict],
                     skip_completed: bool = False,
                     completed_ids: set = None) -> List[Dict]:
        """
        批量爬取城市数据

        Args:
            cities: 城市列表
            skip_completed: 是否跳过已完成城市
            completed_ids: 已完成城市ID集合

        Returns:
            爬取结果列表
        """
        results = []
        completed_ids = completed_ids or set()
        total = len(cities)

        for i, city in enumerate(cities, 1):
            city_id = city['id']
            city_name = city['name']

            if skip_completed and city_id in completed_ids:
                self.logger.info(f"[{i}/{total}] 跳过已完成: {city_name}")
                continue

            self.logger.info(f"[{i}/{total}] 正在爬取: {city_name}")

            try:
                data = self.crawl_city(
                    city_id=city_id,
                    city_name=city_name,
                    province=city.get('province'),
                    country=city.get('country', '中国'),
                    list_type=city.get('list_type')
                )

                if data:
                    data['city_id'] = city_id
                    data['city_name'] = city_name
                    results.append(data)
                    self.logger.info(f"  ✓ 成功获取数据")
                else:
                    self.logger.warning(f"  ✗ 未获取到数据")

            except Exception as e:
                self.logger.error(f"  ✗ 爬取出错: {e}")
                results.append({
                    'city_id': city_id,
                    'city_name': city_name,
                    'error': str(e)
                })

            # 延迟
            if i < total:
                self.sleep()

        return results

    def save_results(self, results: List[Dict], output_path: Path):
        """保存结果到JSON文件"""
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        self.logger.info(f"结果已保存到: {output_path}")
