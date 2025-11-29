#!/usr/bin/env node
/**
 * 批量导入"低成本躺平城市表格3.0"数据
 * 使用方法：node import-layflat-ranking.js
 */

const db = require('./server/models/database');
const fs = require('fs');
const path = require('path');

// 读取JSON数据
const dataPath = path.join(__dirname, 'data/layflat-cities-ranking.json');
let citiesData = [];

try {
    const rawData = fs.readFileSync(dataPath, 'utf8');
    citiesData = JSON.parse(rawData);
} catch (error) {
    console.error('❌ 读取数据文件失败:', error.message);
    process.exit(1);
}

// 标签映射
const tagMapping = {
    'seaside': { name: '🏖️ 看海小城', icon: '🏖️' },
    'low_rent': { name: '💰 超低房租', icon: '💰' },
    'quiet': { name: '🤫 极度安静', icon: '🤫' },
    'spring_climate': { name: '🌡️ 四季如春', icon: '🌡️' },
    'medical': { name: '🏥 医疗完善', icon: '🏥' },
    'digital_nomad': { name: '💻 数字游民友好', icon: '💻' },
    'mountain': { name: '🏔️ 山居小城', icon: '🏔️' },
    'lake': { name: '🌊 临湖', icon: '🌊' },
    'elderly_friendly': { name: '👴 养老天堂', icon: '👴' },
    'cold': { name: '❄️ 寒冷气候', icon: '❄️' },
    'warm': { name: '☀️ 温暖气候', icon: '☀️' },
    'northeast': { name: '🌲 东北小城', icon: '🌲' }
};

/**
 * 根据城市数据自动生成标签
 */
function generateTags(cityData) {
    const tags = [];

    // 根据租金判断
    if (cityData.avg_rent && cityData.avg_rent < 400) {
        tags.push('low_rent');
    }

    // 根据省份判断
    if (['黑龙江', '吉林', '辽宁'].includes(cityData.province)) {
        tags.push('northeast');
        tags.push('cold');
    }

    if (['云南', '海南', '广东', '福建'].includes(cityData.province)) {
        tags.push('warm');
    }

    // 根据气候描述判断
    if (cityData.climate_desc && cityData.climate_desc.includes('寒')) {
        tags.push('cold');
    }

    // 根据描述判断是否适合养老
    if (cityData.evaluation && (
        cityData.evaluation.includes('养老') ||
        cityData.evaluation.includes('养生') ||
        cityData.evaluation.includes('康养')
    )) {
        tags.push('elderly_friendly');
    }

    // 根据描述判断是否靠海
    if (cityData.evaluation && (
        cityData.evaluation.includes('海') ||
        cityData.evaluation.includes('沿海')
    )) {
        tags.push('seaside');
    }

    // 根据躺平等级判断
    if (cityData.layflat_level && cityData.layflat_level.includes('人少')) {
        tags.push('quiet');
    }

    return [...new Set(tags)]; // 去重
}

/**
 * 计算躺平评分
 */
function calculateLayflatScore(cityData) {
    let score = 7.0; // 基础分

    // 租金越低分数越高
    if (cityData.avg_rent) {
        if (cityData.avg_rent < 300) score += 1.5;
        else if (cityData.avg_rent < 400) score += 1.2;
        else if (cityData.avg_rent < 500) score += 0.8;
        else if (cityData.avg_rent < 600) score += 0.5;
    }

    // 躺平等级加分
    if (cityData.layflat_level) {
        if (cityData.layflat_level.includes('金牌')) score += 0.8;
        if (cityData.layflat_level.includes('人少')) score += 0.5;
        if (cityData.layflat_level.includes('舒适')) score += 0.6;
    }

    // 医疗设施
    if (cityData.medical === '普通') score += 0.3;
    else if (cityData.medical === '良好') score += 0.5;

    return Math.min(10, parseFloat(score.toFixed(2)));
}

/**
 * 计算各维度评分
 */
function calculateDimensions(cityData) {
    const dimensions = {
        rent_cost: 7.0,
        slow_pace: 7.5,
        medical_access: 6.0,
        nature: 7.0,
        population_density: 7.5,
        price_index: 7.5,
        digital_facilities: 6.0
    };

    // 根据租金计算租金成本维度
    if (cityData.avg_rent) {
        if (cityData.avg_rent < 300) dimensions.rent_cost = 10;
        else if (cityData.avg_rent < 400) dimensions.rent_cost = 9.5;
        else if (cityData.avg_rent < 500) dimensions.rent_cost = 9.0;
        else if (cityData.avg_rent < 600) dimensions.rent_cost = 8.5;
        else if (cityData.avg_rent < 800) dimensions.rent_cost = 8.0;
        else dimensions.rent_cost = 7.0;
    }

    // 根据人口密度判断
    if (cityData.layflat_level && cityData.layflat_level.includes('人少')) {
        dimensions.population_density = 9.5;
        dimensions.slow_pace = 9.0;
    }

    // 根据医疗设施
    if (cityData.medical === '普通') {
        dimensions.medical_access = 7.0;
    } else if (cityData.medical === '良好') {
        dimensions.medical_access = 8.5;
    } else if (cityData.medical === '一般') {
        dimensions.medical_access = 6.0;
    }

    // 根据地理位置判断自然环境
    if (cityData.evaluation && (
        cityData.evaluation.includes('森林') ||
        cityData.evaluation.includes('山') ||
        cityData.evaluation.includes('自然') ||
        cityData.evaluation.includes('氧吧')
    )) {
        dimensions.nature = 9.0;
    }

    // 根据城市等级判断数字设施
    if (cityData.city_tier === 'tier2') {
        dimensions.digital_facilities = 8.0;
    } else if (cityData.city_tier === 'tier3') {
        dimensions.digital_facilities = 7.0;
    } else {
        dimensions.digital_facilities = 5.5;
    }

    return dimensions;
}

async function importData() {
    console.log('🚀 开始导入"低成本躺平城市表格3.0"数据...\n');
    console.log(`📊 共有 ${citiesData.length} 个城市待导入\n`);

    try {
        // 初始化数据库
        await db.init();
        console.log('✓ 数据库连接成功\n');

        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;

        for (const cityData of citiesData) {
            try {
                // 检查城市是否已存在
                const existing = await db.get(
                    'SELECT id FROM cities WHERE name = ? AND province = ?',
                    [cityData.name, cityData.province]
                );

                if (existing) {
                    console.log(`⊘ 跳过已存在的城市: ${cityData.name} (${cityData.province})`);
                    skipCount++;
                    continue;
                }

                // 计算评分
                const layflat_score = calculateLayflatScore(cityData);
                const dimensions = calculateDimensions(cityData);
                const tags = generateTags(cityData);

                // 构建slogan
                const slogan = cityData.evaluation ?
                    cityData.evaluation.substring(0, 50) :
                    `${cityData.name}，躺平好去处`;

                // 插入城市基本信息
                const cityResult = await db.run(
                    `INSERT INTO cities (
                        name, province, city_name, district, standard_location,
                        slogan, population, avg_rent, climate,
                        overall_score, layflat_score, list_type, city_tier,
                        evaluation, notes, key_points,
                        status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                    [
                        cityData.name,
                        cityData.province,
                        cityData.name,
                        cityData.district || '',
                        cityData.location || '',
                        slogan,
                        null, // population
                        cityData.avg_rent || null,
                        cityData.climate_desc || '温和',
                        layflat_score,
                        layflat_score,
                        'china_layflat',
                        cityData.city_tier || 'small',
                        cityData.evaluation || '',
                        cityData.notes || '',
                        cityData.suitable_for || '',
                        'approved'
                    ]
                );

                const cityId = cityResult.id;

                // 插入维度数据
                await db.run(
                    `INSERT INTO city_dimensions (
                        city_id, rent_cost, slow_pace, medical_access,
                        nature, population_density, price_index, digital_facilities
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        cityId,
                        dimensions.rent_cost,
                        dimensions.slow_pace,
                        dimensions.medical_access,
                        dimensions.nature,
                        dimensions.population_density,
                        dimensions.price_index,
                        dimensions.digital_facilities
                    ]
                );

                // 插入标签
                for (const tagKey of tags) {
                    const tagInfo = tagMapping[tagKey];
                    if (tagInfo) {
                        await db.run(
                            `INSERT INTO city_tags (city_id, tag_key, tag_name, tag_icon, is_primary)
                             VALUES (?, ?, ?, ?, 1)`,
                            [cityId, tagKey, tagInfo.name, tagInfo.icon]
                        );
                    }
                }

                console.log(`✓ 导入成功: ${cityData.name} (${cityData.province}) - 评分: ${layflat_score} - 排名: #${cityData.rank}`);
                successCount++;

            } catch (error) {
                console.error(`✗ 导入失败: ${cityData.name} (${cityData.province})`, error.message);
                errorCount++;
            }
        }

        console.log('\n========================================');
        console.log(`✅ 导入完成！`);
        console.log(`   成功: ${successCount} 个`);
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
