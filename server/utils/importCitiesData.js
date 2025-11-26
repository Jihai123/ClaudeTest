const fs = require('fs');
const path = require('path');
const db = require('../models/database');

/**
 * 城市数据导入工具
 * 支持从JSON和CSV文件导入城市数据
 */

class CityDataImporter {
  /**
   * 从JSON文件导入城市数据
   * @param {string} filePath - JSON文件路径
   */
  async importFromJSON(filePath) {
    try {
      console.log(`正在从JSON文件导入: ${filePath}`);

      // 读取JSON文件
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const citiesData = JSON.parse(fileContent);

      if (!Array.isArray(citiesData)) {
        throw new Error('JSON文件格式错误：应该是一个数组');
      }

      console.log(`找到 ${citiesData.length} 个城市数据`);

      // 导入数据
      const result = await this.importCities(citiesData);

      console.log('\nJSON导入完成！');
      console.log(`成功: ${result.success} 个城市`);
      console.log(`跳过: ${result.skipped} 个城市`);
      console.log(`失败: ${result.error} 个城市`);

      return result;
    } catch (error) {
      console.error('导入JSON文件失败:', error.message);
      throw error;
    }
  }

  /**
   * 从CSV文件导入城市数据
   * @param {string} filePath - CSV文件路径
   */
  async importFromCSV(filePath) {
    try {
      console.log(`正在从CSV文件导入: ${filePath}`);

      // 读取CSV文件
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const lines = fileContent.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        throw new Error('CSV文件为空或格式错误');
      }

      // 解析表头
      const headers = lines[0].split(',').map(h => h.trim());
      console.log('CSV表头:', headers);

      // 解析数据行
      const citiesData = [];
      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i]);
        if (values.length === 0) continue;

        const cityData = this.csvRowToObject(headers, values);
        if (cityData) {
          citiesData.push(cityData);
        }
      }

      console.log(`找到 ${citiesData.length} 个城市数据`);

      // 导入数据
      const result = await this.importCities(citiesData);

      console.log('\nCSV导入完成！');
      console.log(`成功: ${result.success} 个城市`);
      console.log(`跳过: ${result.skipped} 个城市`);
      console.log(`失败: ${result.error} 个城市`);

      return result;
    } catch (error) {
      console.error('导入CSV文件失败:', error.message);
      throw error;
    }
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
   * 将CSV行转换为对象
   */
  csvRowToObject(headers, values) {
    try {
      const obj = {
        name: '',
        province: '',
        population: 0,
        gdp: 0,
        area: 0,
        dimensions: {}
      };

      headers.forEach((header, index) => {
        const value = values[index] || '';

        switch (header.toLowerCase()) {
          case 'name':
          case '城市名称':
            obj.name = value;
            break;
          case 'province':
          case '省份':
            obj.province = value;
            break;
          case 'population':
          case '人口':
            obj.population = parseInt(value) || 0;
            break;
          case 'gdp':
            obj.gdp = parseFloat(value) || 0;
            break;
          case 'area':
          case '面积':
            obj.area = parseFloat(value) || 0;
            break;
          case 'living_cost':
          case '生活成本':
            obj.dimensions.living_cost = parseFloat(value) || 0;
            break;
          case 'air_quality':
          case '空气质量':
            obj.dimensions.air_quality = parseFloat(value) || 0;
            break;
          case 'medical_facilities':
          case '医疗设施':
            obj.dimensions.medical_facilities = parseFloat(value) || 0;
            break;
          case 'employment':
          case '就业机会':
            obj.dimensions.employment = parseFloat(value) || 0;
            break;
          case 'safety':
          case '安全指数':
            obj.dimensions.safety = parseFloat(value) || 0;
            break;
          case 'elderly_care':
          case '适合养老':
            obj.dimensions.elderly_care = parseFloat(value) || 0;
            break;
        }
      });

      if (!obj.name) {
        return null;
      }

      return obj;
    } catch (error) {
      console.error('转换CSV行失败:', error);
      return null;
    }
  }

  /**
   * 导入城市数据到数据库
   */
  async importCities(citiesData) {
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const cityData of citiesData) {
      try {
        // 验证必需字段
        if (!cityData.name) {
          console.warn('跳过：城市名称为空');
          skippedCount++;
          continue;
        }

        // 计算综合评分
        const overallScore = this.calculateOverallScore(cityData.dimensions || {});

        // 检查城市是否已存在
        const existingCity = await db.get(
          'SELECT id FROM cities WHERE name = ?',
          [cityData.name]
        );

        let cityId;

        if (existingCity) {
          // 更新现有城市
          await db.run(
            `UPDATE cities
             SET province = ?, population = ?, gdp = ?, area = ?,
                 overall_score = ?, status = 'approved',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
              cityData.province || null,
              cityData.population || null,
              cityData.gdp || null,
              cityData.area || null,
              overallScore,
              existingCity.id
            ]
          );
          cityId = existingCity.id;
          console.log(`✓ 更新城市: ${cityData.name}`);
        } else {
          // 插入新城市
          const result = await db.run(
            `INSERT INTO cities (name, province, population, gdp, area,
             overall_score, status)
             VALUES (?, ?, ?, ?, ?, ?, 'approved')`,
            [
              cityData.name,
              cityData.province || null,
              cityData.population || null,
              cityData.gdp || null,
              cityData.area || null,
              overallScore
            ]
          );
          cityId = result.id;
          console.log(`✓ 添加城市: ${cityData.name}`);
        }

        // 处理维度数据
        if (cityData.dimensions && Object.keys(cityData.dimensions).length > 0) {
          await this.importDimensions(cityId, cityData.dimensions);
        }

        successCount++;
      } catch (error) {
        console.error(`✗ 处理城市 ${cityData.name || '未知'} 失败:`, error.message);
        errorCount++;
      }
    }

    return {
      success: successCount,
      error: errorCount,
      skipped: skippedCount,
      total: citiesData.length
    };
  }

  /**
   * 导入城市维度数据
   */
  async importDimensions(cityId, dimensions) {
    const existingDimensions = await db.get(
      'SELECT id FROM city_dimensions WHERE city_id = ?',
      [cityId]
    );

    const dimensionValues = {
      living_cost: dimensions.living_cost || 0,
      air_quality: dimensions.air_quality || 0,
      medical_facilities: dimensions.medical_facilities || 0,
      employment: dimensions.employment || 0,
      safety: dimensions.safety || 0,
      elderly_care: dimensions.elderly_care || 0
    };

    if (existingDimensions) {
      // 更新维度数据
      await db.run(
        `UPDATE city_dimensions
         SET living_cost = ?, air_quality = ?, medical_facilities = ?,
             employment = ?, safety = ?, elderly_care = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE city_id = ?`,
        [
          dimensionValues.living_cost,
          dimensionValues.air_quality,
          dimensionValues.medical_facilities,
          dimensionValues.employment,
          dimensionValues.safety,
          dimensionValues.elderly_care,
          cityId
        ]
      );
    } else {
      // 插入维度数据
      await db.run(
        `INSERT INTO city_dimensions
         (city_id, living_cost, air_quality, medical_facilities,
          employment, safety, elderly_care)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          cityId,
          dimensionValues.living_cost,
          dimensionValues.air_quality,
          dimensionValues.medical_facilities,
          dimensionValues.employment,
          dimensionValues.safety,
          dimensionValues.elderly_care
        ]
      );
    }
  }

  /**
   * 计算城市综合评分
   */
  calculateOverallScore(dimensions) {
    const weights = {
      living_cost: 0.20,
      air_quality: 0.15,
      medical_facilities: 0.15,
      employment: 0.20,
      safety: 0.15,
      elderly_care: 0.15
    };

    let totalScore = 0;
    for (const [key, value] of Object.entries(dimensions)) {
      if (weights[key]) {
        totalScore += (value || 0) * weights[key];
      }
    }

    return parseFloat(totalScore.toFixed(2));
  }

  /**
   * 导出城市数据到JSON文件
   */
  async exportToJSON(outputPath) {
    try {
      console.log('正在导出城市数据到JSON...');

      // 查询所有城市及其维度数据
      const cities = await db.query(`
        SELECT
          c.*,
          d.living_cost,
          d.air_quality,
          d.medical_facilities,
          d.employment,
          d.safety,
          d.elderly_care
        FROM cities c
        LEFT JOIN city_dimensions d ON c.id = d.city_id
        WHERE c.status = 'approved'
        ORDER BY c.overall_score DESC
      `);

      const exportData = cities.map(city => ({
        name: city.name,
        province: city.province,
        population: city.population,
        gdp: city.gdp,
        area: city.area,
        dimensions: {
          living_cost: city.living_cost || 0,
          air_quality: city.air_quality || 0,
          medical_facilities: city.medical_facilities || 0,
          employment: city.employment || 0,
          safety: city.safety || 0,
          elderly_care: city.elderly_care || 0
        }
      }));

      fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');

      console.log(`✓ 成功导出 ${exportData.length} 个城市到: ${outputPath}`);
      return exportData.length;
    } catch (error) {
      console.error('导出JSON文件失败:', error.message);
      throw error;
    }
  }

  /**
   * 导出城市数据到CSV文件
   */
  async exportToCSV(outputPath) {
    try {
      console.log('正在导出城市数据到CSV...');

      // 查询所有城市及其维度数据
      const cities = await db.query(`
        SELECT
          c.*,
          d.living_cost,
          d.air_quality,
          d.medical_facilities,
          d.employment,
          d.safety,
          d.elderly_care
        FROM cities c
        LEFT JOIN city_dimensions d ON c.id = d.city_id
        WHERE c.status = 'approved'
        ORDER BY c.overall_score DESC
      `);

      // CSV表头
      const headers = [
        'name', 'province', 'population', 'gdp', 'area',
        'living_cost', 'air_quality', 'medical_facilities',
        'employment', 'safety', 'elderly_care'
      ];

      // 构建CSV内容
      const csvLines = [headers.join(',')];

      cities.forEach(city => {
        const row = [
          city.name,
          city.province || '',
          city.population || 0,
          city.gdp || 0,
          city.area || 0,
          city.living_cost || 0,
          city.air_quality || 0,
          city.medical_facilities || 0,
          city.employment || 0,
          city.safety || 0,
          city.elderly_care || 0
        ];
        csvLines.push(row.join(','));
      });

      fs.writeFileSync(outputPath, csvLines.join('\n'), 'utf-8');

      console.log(`✓ 成功导出 ${cities.length} 个城市到: ${outputPath}`);
      return cities.length;
    } catch (error) {
      console.error('导出CSV文件失败:', error.message);
      throw error;
    }
  }
}

// 命令行使用
if (require.main === module) {
  const importer = new CityDataImporter();
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('城市数据导入/导出工具');
    console.log('\n用法:');
    console.log('  导入JSON: node importCitiesData.js import-json <文件路径>');
    console.log('  导入CSV:  node importCitiesData.js import-csv <文件路径>');
    console.log('  导出JSON: node importCitiesData.js export-json <文件路径>');
    console.log('  导出CSV:  node importCitiesData.js export-csv <文件路径>');
    console.log('\n示例:');
    console.log('  node importCitiesData.js import-json data/cities.json');
    console.log('  node importCitiesData.js export-csv data/cities_export.csv');
    process.exit(0);
  }

  const command = args[0];
  const filePath = args[1];

  if (!filePath) {
    console.error('错误: 请提供文件路径');
    process.exit(1);
  }

  const run = async () => {
    try {
      switch (command) {
        case 'import-json':
          await importer.importFromJSON(filePath);
          break;
        case 'import-csv':
          await importer.importFromCSV(filePath);
          break;
        case 'export-json':
          await importer.exportToJSON(filePath);
          break;
        case 'export-csv':
          await importer.exportToCSV(filePath);
          break;
        default:
          console.error(`未知命令: ${command}`);
          process.exit(1);
      }
      console.log('\n✓ 操作完成');
      process.exit(0);
    } catch (error) {
      console.error('\n✗ 操作失败:', error.message);
      process.exit(1);
    }
  };

  run();
}

module.exports = CityDataImporter;
