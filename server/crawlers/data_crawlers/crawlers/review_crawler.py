#!/usr/bin/env python3
"""
用户体验评论爬虫
从抖音、小红书等平台爬取真实居住/旅居体验

注意：这些平台反爬较严格，建议：
1. 使用代理IP
2. 增加延迟
3. 模拟真实用户行为
4. 或考虑使用官方API（需要申请）
"""

import re
import json
import random
import hashlib
from datetime import datetime
from bs4 import BeautifulSoup
from typing import Dict, Any, Optional, List
from urllib.parse import quote, urlencode
from .base_crawler import BaseCrawler


class ReviewCrawler(BaseCrawler):
    """用户体验评论爬虫"""

    # 搜索关键词模板
    SEARCH_TEMPLATES = {
        'living': [
            '{city}定居体验',
            '{city}生活真实感受',
            '在{city}生活怎么样',
            '{city}适合定居吗',
            '{city}生活成本',
        ],
        'layflat': [
            '{city}躺平生活',
            '{city}旅居体验',
            '{city}数字游民',
            '逃离北上广去{city}',
            '{city}慢生活',
        ],
        'retire': [
            '{city}养老体验',
            '{city}适合养老吗',
            '退休后去{city}',
            '{city}老年生活',
        ],
    }

    # 评论质量关键词（用于筛选高质量评论）
    QUALITY_KEYWORDS = {
        'positive': ['喜欢', '推荐', '舒服', '惬意', '安逸', '幸福', '满意',
                    '宜居', '空气好', '生活节奏慢', '物价低', '房租便宜'],
        'negative': ['后悔', '不推荐', '坑', '失望', '糟糕', '不适合',
                    '医疗差', '交通不便', '无聊', '太热', '太冷'],
        'useful': ['房租', '物价', '工资', '气候', '医院', '交通', '网络',
                  '快递', '外卖', '教育', '就业', '社保'],
    }

    def __init__(self, delay: float = 5.0):
        # 社交平台反爬严格，增加延迟
        super().__init__(name="ReviewCrawler", delay=delay, max_retries=2)
        self.reviews_cache = {}

    def crawl_city(self, city_id: int, city_name: str,
                   province: str = None, **kwargs) -> Dict[str, Any]:
        """
        爬取城市用户评论

        Returns:
            {
                'reviews': 评论列表,
                'review_count': 评论数量,
                'sentiment_score': 情感评分(1-10),
                'positive_rate': 好评率,
                'keywords': 高频关键词,
                'summary': 评论总结
            }
        """
        list_type = kwargs.get('list_type', 'china_general')

        # 根据城市类型选择搜索模板
        if list_type == 'china_layflat':
            templates = self.SEARCH_TEMPLATES['layflat']
        else:
            templates = self.SEARCH_TEMPLATES['living']

        all_reviews = []

        # 尝试从多个平台获取
        # 1. 小红书（模拟搜索）
        xhs_reviews = self._crawl_xiaohongshu(city_name, templates)
        if xhs_reviews:
            all_reviews.extend(xhs_reviews)

        self.sleep(2)

        # 2. 抖音（模拟搜索）
        douyin_reviews = self._crawl_douyin(city_name, templates)
        if douyin_reviews:
            all_reviews.extend(douyin_reviews)

        self.sleep(2)

        # 3. 知乎（相对容易爬取）
        zhihu_reviews = self._crawl_zhihu(city_name, templates)
        if zhihu_reviews:
            all_reviews.extend(zhihu_reviews)

        # 4. 百度贴吧
        tieba_reviews = self._crawl_tieba(city_name)
        if tieba_reviews:
            all_reviews.extend(tieba_reviews)

        if not all_reviews:
            self.logger.warning(f"  未获取到评论数据")
            return None

        # 筛选和分析评论
        filtered_reviews = self._filter_reviews(all_reviews)
        analysis = self._analyze_reviews(filtered_reviews)

        return {
            'reviews': filtered_reviews[:20],  # 保留前20条高质量评论
            'review_count': len(filtered_reviews),
            'sentiment_score': analysis['sentiment_score'],
            'positive_rate': analysis['positive_rate'],
            'keywords': analysis['keywords'],
            'summary': analysis['summary'],
            'sources': analysis['sources'],
        }

    def _crawl_xiaohongshu(self, city_name: str, templates: List[str]) -> List[Dict]:
        """
        爬取小红书笔记

        注意：小红书反爬非常严格，这里提供基础实现
        实际使用建议：
        1. 使用Selenium/Playwright模拟浏览器
        2. 使用官方API（需要商务合作）
        3. 使用第三方数据服务
        """
        reviews = []

        # 小红书需要登录和复杂的签名机制
        # 这里只做基础的页面请求尝试
        for template in templates[:2]:
            keyword = template.format(city=city_name)

            try:
                # 小红书的web搜索页面
                search_url = f"https://www.xiaohongshu.com/search_result?keyword={quote(keyword)}"

                headers = self.get_headers()
                headers.update({
                    'Referer': 'https://www.xiaohongshu.com/',
                    'Accept': 'text/html,application/xhtml+xml',
                })

                response = self.request(search_url, headers=headers, timeout=15)

                if response and response.status_code == 200:
                    # 小红书使用SSR，部分内容在HTML中
                    soup = BeautifulSoup(response.text, 'html.parser')

                    # 尝试提取笔记内容
                    notes = soup.select('.note-item, .search-result-item')
                    for note in notes[:5]:
                        title = note.select_one('.title, .note-title')
                        content = note.select_one('.desc, .note-desc')

                        if title or content:
                            reviews.append({
                                'content': (title.get_text(strip=True) if title else '') +
                                          ' ' + (content.get_text(strip=True) if content else ''),
                                'source': 'xiaohongshu',
                                'keyword': keyword,
                                'crawl_time': datetime.now().isoformat(),
                            })

            except Exception as e:
                self.logger.debug(f"小红书爬取失败: {e}")

            self.sleep(1)

        return reviews

    def _crawl_douyin(self, city_name: str, templates: List[str]) -> List[Dict]:
        """
        爬取抖音视频评论

        注意：抖音反爬非常严格，需要：
        1. 模拟App请求签名
        2. 使用Selenium/Appium
        3. 或使用官方开放平台API
        """
        reviews = []

        # 抖音web版搜索
        for template in templates[:2]:
            keyword = template.format(city=city_name)

            try:
                # 抖音搜索API（需要签名，这里简化处理）
                search_url = f"https://www.douyin.com/search/{quote(keyword)}"

                headers = self.get_headers()
                headers.update({
                    'Referer': 'https://www.douyin.com/',
                })

                response = self.request(search_url, headers=headers, timeout=15)

                if response and response.status_code == 200:
                    # 抖音是SPA，需要解析JS渲染后的内容
                    # 这里尝试从HTML中提取基础信息
                    soup = BeautifulSoup(response.text, 'html.parser')

                    # 查找视频描述
                    descs = soup.select('.video-desc, .search-video-title')
                    for desc in descs[:5]:
                        text = desc.get_text(strip=True)
                        if len(text) > 10:
                            reviews.append({
                                'content': text,
                                'source': 'douyin',
                                'keyword': keyword,
                                'crawl_time': datetime.now().isoformat(),
                            })

            except Exception as e:
                self.logger.debug(f"抖音爬取失败: {e}")

            self.sleep(1)

        return reviews

    def _crawl_zhihu(self, city_name: str, templates: List[str]) -> List[Dict]:
        """爬取知乎回答（相对容易）"""
        reviews = []

        for template in templates[:2]:
            keyword = template.format(city=city_name)

            try:
                # 知乎搜索API
                search_url = f"https://www.zhihu.com/search?type=content&q={quote(keyword)}"

                response = self.request(search_url, timeout=15)

                if response and response.status_code == 200:
                    soup = BeautifulSoup(response.text, 'html.parser')

                    # 知乎搜索结果
                    results = soup.select('.SearchResult-Card, .ContentItem')
                    for result in results[:5]:
                        content = result.select_one('.RichContent-inner, .content')
                        if content:
                            text = content.get_text(strip=True)[:500]  # 截取前500字
                            if len(text) > 50:
                                reviews.append({
                                    'content': text,
                                    'source': 'zhihu',
                                    'keyword': keyword,
                                    'crawl_time': datetime.now().isoformat(),
                                })

            except Exception as e:
                self.logger.debug(f"知乎爬取失败: {e}")

            self.sleep(1)

        return reviews

    def _crawl_tieba(self, city_name: str) -> List[Dict]:
        """爬取百度贴吧"""
        reviews = []

        try:
            # 城市贴吧
            tieba_url = f"https://tieba.baidu.com/f?kw={quote(city_name)}"

            response = self.request(tieba_url, timeout=15)

            if response and response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')

                # 帖子列表
                posts = soup.select('.threadlist_title a, .j_th_tit')
                for post in posts[:10]:
                    title = post.get_text(strip=True)
                    # 筛选与生活相关的帖子
                    if any(kw in title for kw in ['生活', '定居', '工作', '房租', '物价', '体验']):
                        reviews.append({
                            'content': title,
                            'source': 'tieba',
                            'keyword': f'{city_name}贴吧',
                            'crawl_time': datetime.now().isoformat(),
                        })

        except Exception as e:
            self.logger.debug(f"贴吧爬取失败: {e}")

        return reviews

    def _filter_reviews(self, reviews: List[Dict]) -> List[Dict]:
        """筛选高质量评论"""
        filtered = []
        seen_hashes = set()

        for review in reviews:
            content = review.get('content', '')

            # 跳过太短的评论
            if len(content) < 20:
                continue

            # 去重（基于内容hash）
            content_hash = hashlib.md5(content[:100].encode()).hexdigest()
            if content_hash in seen_hashes:
                continue
            seen_hashes.add(content_hash)

            # 计算质量分数
            quality_score = self._calculate_review_quality(content)
            review['quality_score'] = quality_score

            if quality_score >= 3:  # 质量阈值
                filtered.append(review)

        # 按质量分数排序
        filtered.sort(key=lambda x: x.get('quality_score', 0), reverse=True)

        return filtered

    def _calculate_review_quality(self, content: str) -> int:
        """计算评论质量分数"""
        score = 0

        # 长度分数
        if len(content) >= 100:
            score += 2
        elif len(content) >= 50:
            score += 1

        # 包含有用信息
        for kw in self.QUALITY_KEYWORDS['useful']:
            if kw in content:
                score += 1
                break

        # 包含情感表达
        for kw in self.QUALITY_KEYWORDS['positive'] + self.QUALITY_KEYWORDS['negative']:
            if kw in content:
                score += 1
                break

        # 有具体数字（如价格、温度等）
        if re.search(r'\d+[元块度℃]', content):
            score += 1

        return score

    def _analyze_reviews(self, reviews: List[Dict]) -> Dict:
        """分析评论，生成摘要"""
        if not reviews:
            return {
                'sentiment_score': 5.0,
                'positive_rate': 0.5,
                'keywords': [],
                'summary': '',
                'sources': {},
            }

        positive_count = 0
        negative_count = 0
        keyword_counts = {}
        sources = {}

        for review in reviews:
            content = review.get('content', '')
            source = review.get('source', 'unknown')

            # 统计来源
            sources[source] = sources.get(source, 0) + 1

            # 情感分析（简单关键词匹配）
            has_positive = any(kw in content for kw in self.QUALITY_KEYWORDS['positive'])
            has_negative = any(kw in content for kw in self.QUALITY_KEYWORDS['negative'])

            if has_positive and not has_negative:
                positive_count += 1
            elif has_negative and not has_positive:
                negative_count += 1

            # 提取关键词
            for kw in self.QUALITY_KEYWORDS['useful']:
                if kw in content:
                    keyword_counts[kw] = keyword_counts.get(kw, 0) + 1

        total = len(reviews)
        positive_rate = positive_count / total if total > 0 else 0.5

        # 情感评分 (1-10)
        sentiment_score = 5.0 + (positive_rate - 0.5) * 8  # 范围 1-9
        sentiment_score = max(1.0, min(9.0, sentiment_score))

        # 高频关键词
        top_keywords = sorted(keyword_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        keywords = [kw for kw, count in top_keywords]

        # 生成摘要
        summary = self._generate_summary(reviews, positive_rate, keywords)

        return {
            'sentiment_score': round(sentiment_score, 1),
            'positive_rate': round(positive_rate, 2),
            'keywords': keywords,
            'summary': summary,
            'sources': sources,
        }

    def _generate_summary(self, reviews: List[Dict], positive_rate: float,
                         keywords: List[str]) -> str:
        """生成评论摘要"""
        if positive_rate >= 0.7:
            sentiment = "网友评价较为积极"
        elif positive_rate >= 0.4:
            sentiment = "网友评价褒贬不一"
        else:
            sentiment = "网友评价偏负面"

        keyword_str = '、'.join(keywords) if keywords else '生活体验'

        return f"{sentiment}，主要讨论{keyword_str}等方面。共收集{len(reviews)}条相关评论。"
