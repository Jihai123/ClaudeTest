const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../models/database');

/**
 * 数据爬取工具
 * 注意：这是一个示例实现，实际使用时需要根据目标网站的结构进行调整
 * 请遵守网站的robots.txt规则和相关法律法规
 */

class Crawler {
  constructor() {
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  }

  /**
   * 通用爬取方法
   * @param {string} url - 目标URL
   * @returns {Promise<object>} - 爬取结果
   */
  async fetch(url) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        },
        timeout: 10000
      });

      return { success: true, html: response.data };
    } catch (error) {
      console.error('爬取失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 解析城市排行榜数据（示例实现）
   * 实际使用时需要根据目标网站的HTML结构进行调整
   */
  async parseCityRankings(html) {
    const $ = cheerio.load(html);
    const cities = [];

    // 这里是示例选择器，需要根据实际网站结构调整
    $('.city-item').each((index, element) => {
      try {
        const name = $(element).find('.city-name').text().trim();
        const province = $(element).find('.province').text().trim();
        const score = parseFloat($(element).find('.score').text().trim());

        // 提取维度数据
        const dimensions = {
          living_cost: parseFloat($(element).find('.living-cost').text().trim()) || 0,
          air_quality: parseFloat($(element).find('.air-quality').text().trim()) || 0,
          medical_facilities: parseFloat($(element).find('.medical').text().trim()) || 0,
          employment: parseFloat($(element).find('.employment').text().trim()) || 0,
          safety: parseFloat($(element).find('.safety').text().trim()) || 0,
          elderly_care: parseFloat($(element).find('.elderly').text().trim()) || 0
        };

        if (name) {
          cities.push({
            name,
            province,
            overall_score: score,
            dimensions
          });
        }
      } catch (error) {
        console.error('解析城市数据失败:', error);
      }
    });

    return cities;
  }

  /**
   * 爬取并更新城市数据
   * @param {string} url - 目标URL
   * @returns {Promise<object>} - 更新结果
   */
  async crawlAndUpdate(url) {
    const logId = await this.logCrawlStart(url);

    try {
      console.log('开始爬取数据:', url);

      // 获取网页内容
      const fetchResult = await this.fetch(url);
      if (!fetchResult.success) {
        await this.logCrawlError(logId, fetchResult.error);
        return { success: false, error: fetchResult.error };
      }

      // 解析数据
      const cities = await this.parseCityRankings(fetchResult.html);
      console.log(`解析到 ${cities.length} 个城市`);

      if (cities.length === 0) {
        await this.logCrawlError(logId, '未找到城市数据');
        return { success: false, error: '未找到城市数据' };
      }

      // 更新数据库
      let updatedCount = 0;
      for (const cityData of cities) {
        try {
          await this.updateCityData(cityData);
          updatedCount++;
        } catch (error) {
          console.error(`更新城市 ${cityData.name} 失败:`, error);
        }
      }

      await this.logCrawlSuccess(logId, updatedCount);

      return {
        success: true,
        total: cities.length,
        updated: updatedCount
      };
    } catch (error) {
      console.error('爬取过程出错:', error);
      await this.logCrawlError(logId, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 更新城市数据
   */
  async updateCityData(cityData) {
    // 检查城市是否存在
    const existingCity = await db.get(
      'SELECT * FROM cities WHERE name = ?',
      [cityData.name]
    );

    if (existingCity) {
      // 更新现有城市
      await db.run(
        `UPDATE cities
         SET province = ?, overall_score = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [cityData.province || existingCity.province,
         cityData.overall_score || existingCity.overall_score,
         existingCity.id]
      );

      // 更新维度数据
      if (cityData.dimensions) {
        const existing = await db.get(
          'SELECT * FROM city_dimensions WHERE city_id = ?',
          [existingCity.id]
        );

        if (existing) {
          await db.run(
            `UPDATE city_dimensions
             SET living_cost = ?, air_quality = ?, medical_facilities = ?,
                 employment = ?, safety = ?, elderly_care = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE city_id = ?`,
            [
              cityData.dimensions.living_cost || existing.living_cost,
              cityData.dimensions.air_quality || existing.air_quality,
              cityData.dimensions.medical_facilities || existing.medical_facilities,
              cityData.dimensions.employment || existing.employment,
              cityData.dimensions.safety || existing.safety,
              cityData.dimensions.elderly_care || existing.elderly_care,
              existingCity.id
            ]
          );
        }
      }
    } else {
      // 创建新城市
      const result = await db.run(
        `INSERT INTO cities (name, province, overall_score, status)
         VALUES (?, ?, ?, 'approved')`,
        [cityData.name, cityData.province, cityData.overall_score || 0]
      );

      // 插入维度数据
      if (cityData.dimensions) {
        await db.run(
          `INSERT INTO city_dimensions (city_id, living_cost, air_quality,
           medical_facilities, employment, safety, elderly_care)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            result.id,
            cityData.dimensions.living_cost || 0,
            cityData.dimensions.air_quality || 0,
            cityData.dimensions.medical_facilities || 0,
            cityData.dimensions.employment || 0,
            cityData.dimensions.safety || 0,
            cityData.dimensions.elderly_care || 0
          ]
        );
      }
    }
  }

  /**
   * 记录爬取开始
   */
  async logCrawlStart(url) {
    const result = await db.run(
      "INSERT INTO crawl_logs (source_url, status) VALUES (?, 'running')",
      [url]
    );
    return result.id;
  }

  /**
   * 记录爬取成功
   */
  async logCrawlSuccess(logId, updatedCount) {
    await db.run(
      `UPDATE crawl_logs
       SET status = 'success', cities_updated = ?
       WHERE id = ?`,
      [updatedCount, logId]
    );
  }

  /**
   * 记录爬取错误
   */
  async logCrawlError(logId, errorMessage) {
    await db.run(
      `UPDATE crawl_logs
       SET status = 'error', error_message = ?
       WHERE id = ?`,
      [errorMessage, logId]
    );
  }

  /**
   * 获取爬取历史
   */
  async getCrawlHistory(limit = 10) {
    return await db.query(
      `SELECT * FROM crawl_logs
       ORDER BY created_at DESC
       LIMIT ?`,
      [limit]
    );
  }
}

module.exports = new Crawler();
