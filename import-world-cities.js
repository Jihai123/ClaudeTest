const fs = require('fs');
const path = require('path');
const db = require('./server/models/database');

/**
 * 世界宜居城市排行榜数据导入脚本
 *
 * 数据字段映射：
 * - Rank -> 排名（用于排序）
 * - City -> cities.name (城市名称)
 * - Country -> cities.country (国家)
 * - Overall -> cities.world_score (世界榜总评分)
 * - Stability -> city_dimensions.safety (稳定性/安全指数)
 * - Healthcare -> city_dimensions.medical_facilities (医疗设施)
 * - Culture -> city_dimensions.culture (文化)
 * - Education -> 存储到education字段
 * - Infrastructure -> 存储到infrastructure字段
 */

class WorldCityImporter {
  constructor() {
    this.db = db;
    this.successCount = 0;
    this.errorCount = 0;
    this.updateCount = 0;
  }

  /**
   * 解析CSV行（处理引号内的逗号）
   */
  parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    if (current) {
      result.push(current.trim());
    }

    return result;
  }

  /**
   * 从CSV文件导入数据
   */
  async importFromCSV(filePath) {
    try {
      console.log('\n========================================');
      console.log('世界宜居城市排行榜数据导入');
      console.log('========================================\n');
      console.log(`正在读取文件: ${filePath}`);

      // 读取CSV文件
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const lines = fileContent.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        throw new Error('CSV文件为空或格式错误');
      }

      // 解析表头
      const headers = this.parseCSVLine(lines[0]);
      console.log('CSV表头:', headers);
      console.log(`找到 ${lines.length - 1} 条城市数据\n`);

      // 逐行导入数据
      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i]);
        if (values.length === 0) continue;

        await this.importCity(headers, values, i);
      }

      console.log('\n========================================');
      console.log('导入完成！');
      console.log('========================================');
      console.log(`✓ 成功导入: ${this.successCount} 个城市`);
      console.log(`✓ 更新数据: ${this.updateCount} 个城市`);
      console.log(`✗ 导入失败: ${this.errorCount} 个城市`);
      console.log('========================================\n');

      return {
        success: this.successCount,
        updated: this.updateCount,
        error: this.errorCount
      };
    } catch (error) {
      console.error('\n✗ 导入失败:', error.message);
      throw error;
    }
  }

  /**
   * 导入单个城市数据
   */
  async importCity(headers, values, lineNumber) {
    try {
      // 解析数据
      const cityData = {};
      headers.forEach((header, index) => {
        cityData[header.toLowerCase()] = values[index] || '';
      });

      const cityName = cityData.city;
      const country = cityData.country;
      const overall = parseFloat(cityData.overall) || 0;
      const stability = parseFloat(cityData.stability) || 0;
      const healthcare = parseFloat(cityData.healthcare) || 0;
      const culture = parseFloat(cityData.culture) || 0;
      const education = parseFloat(cityData.education) || 0;
      const infrastructure = parseFloat(cityData.infrastructure) || 0;

      if (!cityName) {
        console.warn(`⚠ 第${lineNumber}行：城市名称为空，跳过`);
        this.errorCount++;
        return;
      }

      // 检查城市是否已存在（同名同国家）
      const existingCity = await this.db.get(
        'SELECT id FROM cities WHERE name = ? AND country = ?',
        [cityName, country]
      );

      let cityId;

      if (existingCity) {
        // 更新现有城市
        await this.db.run(
          `UPDATE cities
           SET world_score = ?,
               country = ?,
               list_type = 'world',
               status = 'approved',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [overall, country, existingCity.id]
        );
        cityId = existingCity.id;
        this.updateCount++;
        console.log(`↻ 更新城市: ${cityName}, ${country} (评分: ${overall})`);
      } else {
        // 插入新城市
        const result = await this.db.run(
          `INSERT INTO cities (
            name, country, world_score, overall_score, list_type, status
          ) VALUES (?, ?, ?, ?, 'world', 'approved')`,
          [cityName, country, overall, overall]
        );
        cityId = result.id;
        this.successCount++;
        console.log(`✓ 新增城市: ${cityName}, ${country} (评分: ${overall})`);
      }

      // 导入维度数据
      await this.importDimensions(cityId, {
        safety: stability / 10,              // 转换为0-10分制
        medical_facilities: healthcare / 10,
        culture: culture / 10,
        education_score: education / 10,     // 教育评分
        infrastructure_score: infrastructure / 10  // 基础设施评分
      });

    } catch (error) {
      console.error(`✗ 第${lineNumber}行导入失败: ${error.message}`);
      this.errorCount++;
    }
  }

  /**
   * 导入城市维度数据
   */
  async importDimensions(cityId, dimensions) {
    const existingDimensions = await this.db.get(
      'SELECT id FROM city_dimensions WHERE city_id = ?',
      [cityId]
    );

    // 准备维度数据（所有评分已转换为0-10分制）
    const dimensionValues = {
      safety: dimensions.safety || 0,
      medical_facilities: dimensions.medical_facilities || 0,
      culture: dimensions.culture || 0
    };

    // 将教育和基础设施评分存储到education和transportation字段（暂时方案）
    const educationStr = dimensions.education_score ?
      `评分: ${dimensions.education_score.toFixed(1)}/10` : '';
    const infrastructureStr = dimensions.infrastructure_score ?
      `评分: ${dimensions.infrastructure_score.toFixed(1)}/10` : '';

    if (existingDimensions) {
      // 更新维度数据
      await this.db.run(
        `UPDATE city_dimensions
         SET safety = ?,
             medical_facilities = ?,
             culture = ?,
             education = ?,
             transportation = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE city_id = ?`,
        [
          dimensionValues.safety,
          dimensionValues.medical_facilities,
          dimensionValues.culture,
          educationStr,
          infrastructureStr,
          cityId
        ]
      );
    } else {
      // 插入维度数据
      await this.db.run(
        `INSERT INTO city_dimensions (
          city_id, safety, medical_facilities, culture, education, transportation
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          cityId,
          dimensionValues.safety,
          dimensionValues.medical_facilities,
          dimensionValues.culture,
          educationStr,
          infrastructureStr
        ]
      );
    }
  }
}

// 主函数
async function main() {
  const importer = new WorldCityImporter();
  const csvPath = path.join(__dirname, 'data/world-cities-ranking.csv');

  try {
    await importer.importFromCSV(csvPath);
    process.exit(0);
  } catch (error) {
    console.error('导入失败:', error);
    process.exit(1);
  }
}

// 执行导入
if (require.main === module) {
  main();
}

module.exports = WorldCityImporter;
