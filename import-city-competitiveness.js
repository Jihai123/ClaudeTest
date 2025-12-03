#!/usr/bin/env node
/**
 * 导入中国城市竞争力排行数据
 * 数据来源：中国综合城市竞争力排行榜
 * 使用方法：node import-city-competitiveness.js
 */

const db = require('./server/models/database');
const fs = require('fs');
const path = require('path');

// CSV文件路径
const csvPath = path.join(__dirname, 'data/city-competitiveness-ranking.csv');

/**
 * 解析CSV行（处理引号内的逗号）
 */
function parseCSVLine(line) {
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
 * 读取并解析CSV文件
 */
function readCSV(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      throw new Error('CSV文件为空或格式错误');
    }

    // 解析表头
    const headers = parseCSVLine(lines[0]);
    console.log('📋 CSV表头:', headers.join(' | '));

    // 解析数据行
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === 0) continue;

      const cityData = {
        name: values[0] || '',
        economic_index: parseFloat(values[1]) || 0,
        economic_rank: parseInt(values[2]) || 0,
        livable_index: parseFloat(values[3]) || 0,
        livable_rank: parseInt(values[4]) || 0,
        sustainable_index: parseFloat(values[5]) || 0,
        sustainable_rank: parseInt(values[6]) || 0
      };

      if (cityData.name) {
        data.push(cityData);
      }
    }

    return data;
  } catch (error) {
    console.error('❌ 读取CSV文件失败:', error.message);
    throw error;
  }
}

/**
 * 计算综合评分
 * 基于三个竞争力指数的加权平均
 */
function calculateOverallScore(cityData) {
  const weights = {
    economic: 0.35,      // 经济竞争力权重35%
    livable: 0.40,       // 宜居竞争力权重40%
    sustainable: 0.25    // 可持续竞争力权重25%
  };

  const score = (
    cityData.economic_index * weights.economic +
    cityData.livable_index * weights.livable +
    cityData.sustainable_index * weights.sustainable
  ) * 10; // 转换为10分制

  return parseFloat(score.toFixed(2));
}

/**
 * 生成城市Slogan
 */
function generateSlogan(cityData) {
  const slogans = [];

  // 根据经济竞争力
  if (cityData.economic_rank <= 3) {
    slogans.push('经济实力雄厚');
  } else if (cityData.economic_rank <= 10) {
    slogans.push('经济发展强劲');
  }

  // 根据宜居竞争力
  if (cityData.livable_rank <= 3) {
    slogans.push('宜居典范');
  } else if (cityData.livable_rank <= 10) {
    slogans.push('宜居宜业');
  }

  // 根据可持续竞争力
  if (cityData.sustainable_rank <= 3) {
    slogans.push('可持续发展领先');
  } else if (cityData.sustainable_rank <= 10) {
    slogans.push('发展潜力大');
  }

  return slogans.length > 0 ? slogans.join('，') : `${cityData.name}，未来可期`;
}

/**
 * 生成标签
 */
function generateTags(cityData) {
  const tags = [];

  // 经济相关标签
  if (cityData.economic_rank <= 5) {
    tags.push({ key: 'economic_powerhouse', name: '💼 经济强市', icon: '💼' });
  }

  // 宜居相关标签
  if (cityData.livable_rank <= 5) {
    tags.push({ key: 'highly_livable', name: '🏡 高度宜居', icon: '🏡' });
  }

  // 可持续发展相关标签
  if (cityData.sustainable_rank <= 5) {
    tags.push({ key: 'sustainable', name: '🌱 可持续发展', icon: '🌱' });
  }

  // 综合实力
  if (cityData.economic_rank <= 10 && cityData.livable_rank <= 10) {
    tags.push({ key: 'well_rounded', name: '⭐ 综合实力强', icon: '⭐' });
  }

  return tags;
}

/**
 * 确定城市等级
 */
function determineCityTier(cityData) {
  const topCities = ['北京', '上海', '广州', '深圳'];
  const tier1Cities = ['天津', '重庆', '成都', '杭州', '南京', '武汉', '西安', '苏州'];

  if (topCities.includes(cityData.name)) {
    return 'tier1';
  } else if (tier1Cities.includes(cityData.name) || cityData.economic_rank <= 15) {
    return 'tier2';
  } else {
    return 'tier3';
  }
}

/**
 * 导入城市数据
 */
async function importData() {
  console.log('🚀 开始导入中国城市竞争力排行数据...\n');

  try {
    // 初始化数据库
    await db.init();
    console.log('✓ 数据库连接成功\n');

    // 读取CSV数据
    const citiesData = readCSV(csvPath);
    console.log(`📊 共有 ${citiesData.length} 个城市待导入\n`);

    let successCount = 0;
    let updateCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const cityData of citiesData) {
      try {
        // 检查城市是否已存在
        const existing = await db.get(
          'SELECT id FROM cities WHERE name = ? AND (province IS NULL OR province = \'\')',
          [cityData.name]
        );

        const overallScore = calculateOverallScore(cityData);
        const slogan = generateSlogan(cityData);
        const tags = generateTags(cityData);
        const cityTier = determineCityTier(cityData);

        if (existing) {
          // 更新现有城市
          await db.run(
            `UPDATE cities
             SET overall_score = ?,
                 slogan = ?,
                 city_tier = ?,
                 list_type = 'china_general',
                 status = 'approved',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [overallScore, slogan, cityTier, existing.id]
          );

          // 更新或插入维度数据
          const existingDimensions = await db.get(
            'SELECT id FROM city_dimensions WHERE city_id = ?',
            [existing.id]
          );

          if (existingDimensions) {
            await db.run(
              `UPDATE city_dimensions
               SET employment = ?,
                   medical_facilities = ?,
                   air_quality = ?,
                   updated_at = CURRENT_TIMESTAMP
               WHERE city_id = ?`,
              [
                cityData.economic_index * 10,
                cityData.livable_index * 10,
                cityData.sustainable_index * 10,
                existing.id
              ]
            );
          } else {
            await db.run(
              `INSERT INTO city_dimensions (
                city_id, employment, medical_facilities, air_quality
              ) VALUES (?, ?, ?, ?)`,
              [
                existing.id,
                cityData.economic_index * 10,
                cityData.livable_index * 10,
                cityData.sustainable_index * 10
              ]
            );
          }

          // 删除旧标签并插入新标签
          await db.run('DELETE FROM city_tags WHERE city_id = ?', [existing.id]);
          for (const tag of tags) {
            await db.run(
              `INSERT INTO city_tags (city_id, tag_key, tag_name, tag_icon, is_primary)
               VALUES (?, ?, ?, ?, 1)`,
              [existing.id, tag.key, tag.name, tag.icon]
            );
          }

          console.log(`✓ 更新城市: ${cityData.name} - 评分: ${overallScore} - 经济排名: #${cityData.economic_rank}`);
          updateCount++;
        } else {
          // 插入新城市
          const cityResult = await db.run(
            `INSERT INTO cities (
              name, slogan, overall_score, city_tier,
              list_type, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'china_general', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [cityData.name, slogan, overallScore, cityTier]
          );

          const cityId = cityResult.id;

          // 插入维度数据
          await db.run(
            `INSERT INTO city_dimensions (
              city_id, employment, medical_facilities, air_quality
            ) VALUES (?, ?, ?, ?)`,
            [
              cityId,
              cityData.economic_index * 10,
              cityData.livable_index * 10,
              cityData.sustainable_index * 10
            ]
          );

          // 插入标签
          for (const tag of tags) {
            await db.run(
              `INSERT INTO city_tags (city_id, tag_key, tag_name, tag_icon, is_primary)
               VALUES (?, ?, ?, ?, 1)`,
              [cityId, tag.key, tag.name, tag.icon]
            );
          }

          console.log(`✓ 添加城市: ${cityData.name} - 评分: ${overallScore} - 经济排名: #${cityData.economic_rank}`);
          successCount++;
        }

      } catch (error) {
        console.error(`✗ 处理城市失败: ${cityData.name}`, error.message);
        errorCount++;
      }
    }

    console.log('\n========================================');
    console.log('✅ 导入完成！');
    console.log(`   新增: ${successCount} 个`);
    console.log(`   更新: ${updateCount} 个`);
    console.log(`   跳过: ${skipCount} 个`);
    console.log(`   失败: ${errorCount} 个`);
    console.log(`   总计: ${citiesData.length} 个`);
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ 导入过程出错:', error);
  } finally {
    await db.close();
    process.exit(0);
  }
}

// 运行导入
importData();
