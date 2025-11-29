#!/usr/bin/env node
/**
 * 批量导入躺平榜城市数据
 * 使用方法：node import-data.js
 */

const db = require('./server/models/database');

// 躺平榜城市数据
const cities = [
    {
        name: '荣成',
        province: '山东',
        slogan: '中国最美海岸线',
        population: 670000,
        avg_rent: 500,
        avg_temp: 12,
        climate: 8,
        layflat_score: 8.85,
        list_type: 'china_layflat',
        city_tier: 'small',
        tags: ['seaside', 'low_rent', 'quiet'],
        dimensions: {
            rent_cost: 10,
            slow_pace: 9.8,
            medical_access: 6.5,
            nature: 10,
            population_density: 9.8,
            price_index: 9.5,
            digital_facilities: 5.5
        }
    },
    {
        name: '乳山',
        province: '山东',
        slogan: '超低成本海滨养老',
        population: 530000,
        avg_rent: 400,
        avg_temp: 12,
        climate: 8,
        layflat_score: 8.77,
        list_type: 'china_layflat',
        city_tier: 'small',
        tags: ['seaside', 'low_rent', 'quiet', 'elderly_friendly'],
        dimensions: {
            rent_cost: 10,
            slow_pace: 9.8,
            medical_access: 6,
            nature: 9.5,
            population_density: 10,
            price_index: 10,
            digital_facilities: 5
        }
    },
    {
        name: '威海',
        province: '山东',
        slogan: '四季如春的低成本海滨小城',
        population: 2900000,
        avg_rent: 800,
        avg_temp: 13,
        climate: 8.8,
        layflat_score: 8.46,
        list_type: 'china_layflat',
        city_tier: 'tier3',
        tags: ['seaside', 'spring_climate', 'low_rent', 'quiet'],
        dimensions: {
            rent_cost: 9.2,
            slow_pace: 8.5,
            medical_access: 7.5,
            nature: 9,
            population_density: 8,
            price_index: 8.5,
            digital_facilities: 7
        }
    },
    {
        name: '大理',
        province: '云南',
        slogan: '数字游民圣地',
        population: 670000,
        avg_rent: 1200,
        avg_temp: 15,
        climate: 9.8,
        altitude: 1976,
        has_lake: 1,
        layflat_score: 8.47,
        list_type: 'china_layflat',
        city_tier: 'small',
        tags: ['lake', 'spring_climate', 'digital_nomad', 'mountain'],
        dimensions: {
            rent_cost: 7.5,
            slow_pace: 9.5,
            medical_access: 6.5,
            nature: 10,
            population_density: 9.5,
            price_index: 7,
            digital_facilities: 9
        }
    },
    {
        name: '昆明',
        province: '云南',
        slogan: '春城',
        population: 8500000,
        avg_rent: 1500,
        avg_temp: 15,
        climate: 9.5,
        altitude: 1891,
        layflat_score: 8.25,
        list_type: 'china_layflat',
        city_tier: 'tier2',
        tags: ['spring_climate', 'mountain'],
        dimensions: {
            rent_cost: 7,
            slow_pace: 7.5,
            medical_access: 8.5,
            nature: 8.5,
            population_density: 7,
            price_index: 7.5,
            digital_facilities: 8.5
        }
    }
];

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
    'elderly_friendly': { name: '👴 养老天堂', icon: '👴' }
};

async function importData() {
    console.log('🚀 开始导入躺平榜城市数据...\n');

    try {
        // 初始化数据库
        await db.init();
        console.log('✓ 数据库连接成功\n');

        let successCount = 0;
        let skipCount = 0;

        for (const cityData of cities) {
            try {
                // 检查城市是否已存在
                const existing = await db.get(
                    'SELECT id FROM cities WHERE name = ? AND province = ?',
                    [cityData.name, cityData.province]
                );

                if (existing) {
                    console.log(`⊘ 跳过已存在的城市: ${cityData.name}`);
                    skipCount++;
                    continue;
                }

                // 插入城市基本信息
                const cityResult = await db.run(
                    `INSERT INTO cities (
                        name, province, slogan, population, gdp, area,
                        climate, overall_score, layflat_score, list_type,
                        city_tier, avg_rent, avg_temp, altitude, has_lake,
                        status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                    [
                        cityData.name,
                        cityData.province,
                        cityData.slogan,
                        cityData.population,
                        cityData.gdp || null,
                        cityData.area || null,
                        cityData.climate,
                        cityData.layflat_score,
                        cityData.layflat_score,
                        cityData.list_type,
                        cityData.city_tier,
                        cityData.avg_rent,
                        cityData.avg_temp,
                        cityData.altitude || null,
                        cityData.has_lake || 0,
                        'approved'
                    ]
                );

                const cityId = cityResult.id;

                // 插入维度数据
                if (cityData.dimensions) {
                    await db.run(
                        `INSERT INTO city_dimensions (
                            city_id, rent_cost, slow_pace, medical_access,
                            nature, population_density, price_index, digital_facilities
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            cityId,
                            cityData.dimensions.rent_cost || 0,
                            cityData.dimensions.slow_pace || 0,
                            cityData.dimensions.medical_access || 0,
                            cityData.dimensions.nature || 0,
                            cityData.dimensions.population_density || 0,
                            cityData.dimensions.price_index || 0,
                            cityData.dimensions.digital_facilities || 0
                        ]
                    );
                }

                // 插入标签
                if (cityData.tags && cityData.tags.length > 0) {
                    for (const tagKey of cityData.tags) {
                        const tagInfo = tagMapping[tagKey];
                        if (tagInfo) {
                            await db.run(
                                `INSERT INTO city_tags (city_id, tag_key, tag_name, tag_icon, is_primary)
                                 VALUES (?, ?, ?, ?, 1)`,
                                [cityId, tagKey, tagInfo.name, tagInfo.icon]
                            );
                        }
                    }
                }

                console.log(`✓ 导入成功: ${cityData.name} (评分: ${cityData.layflat_score})`);
                successCount++;

            } catch (error) {
                console.error(`✗ 导入失败: ${cityData.name}`, error.message);
            }
        }

        console.log('\n========================================');
        console.log(`✅ 导入完成！`);
        console.log(`   成功: ${successCount} 个`);
        console.log(`   跳过: ${skipCount} 个`);
        console.log(`   总计: ${cities.length} 个`);
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
