#!/usr/bin/env node
/**
 * 验证导入的躺平城市数据
 */

const db = require('./server/models/database');

async function verifyData() {
    console.log('🔍 开始验证导入的数据...\n');

    try {
        await db.init();

        // 查询导入的城市数量
        const countResult = await db.get(
            "SELECT COUNT(*) as count FROM cities WHERE list_type = 'china_layflat'"
        );
        console.log(`✓ 躺平榜城市总数: ${countResult.count} 个\n`);

        // 查询前10个城市
        const topCities = await db.query(
            `SELECT c.id, c.name, c.province, c.avg_rent, c.layflat_score,
                    c.slogan, c.city_tier
             FROM cities c
             WHERE c.list_type = 'china_layflat'
             ORDER BY c.layflat_score DESC
             LIMIT 10`
        );

        console.log('📊 躺平榜 TOP 10 城市:');
        console.log('─'.repeat(80));
        topCities.forEach((city, index) => {
            console.log(`${index + 1}. ${city.name} (${city.province})`);
            console.log(`   评分: ${city.layflat_score} | 租金: ${city.avg_rent}元/月 | 等级: ${city.city_tier}`);
            console.log(`   简介: ${city.slogan}`);
            console.log('');
        });

        // 查询城市维度数据
        console.log('\n🎯 维度数据示例 (鞍山市):');
        console.log('─'.repeat(80));
        const cityWithDimensions = await db.get(
            `SELECT c.*, d.*
             FROM cities c
             LEFT JOIN city_dimensions d ON c.id = d.city_id
             WHERE c.name = '鞍山市' AND c.list_type = 'china_layflat'
             LIMIT 1`
        );

        if (cityWithDimensions) {
            console.log(`城市: ${cityWithDimensions.name}`);
            console.log(`省份: ${cityWithDimensions.province}`);
            console.log(`评分: ${cityWithDimensions.layflat_score}`);
            console.log(`\n维度评分:`);
            console.log(`  - 租金成本: ${cityWithDimensions.rent_cost}`);
            console.log(`  - 慢节奏: ${cityWithDimensions.slow_pace}`);
            console.log(`  - 医疗可达: ${cityWithDimensions.medical_access}`);
            console.log(`  - 自然环境: ${cityWithDimensions.nature}`);
            console.log(`  - 人口密度: ${cityWithDimensions.population_density}`);
            console.log(`  - 物价指数: ${cityWithDimensions.price_index}`);
            console.log(`  - 数字设施: ${cityWithDimensions.digital_facilities}`);
        }

        // 查询城市标签
        console.log('\n\n🏷️  标签数据示例 (鞍山市):');
        console.log('─'.repeat(80));
        const cityTags = await db.query(
            `SELECT ct.tag_name, ct.tag_icon
             FROM city_tags ct
             JOIN cities c ON ct.city_id = c.id
             WHERE c.name = '鞍山市' AND c.list_type = 'china_layflat'`
        );

        if (cityTags.length > 0) {
            cityTags.forEach(tag => {
                console.log(`  ${tag.tag_icon} ${tag.tag_name}`);
            });
        } else {
            console.log('  (暂无标签)');
        }

        // 按省份统计
        console.log('\n\n📍 各省份躺平城市数量:');
        console.log('─'.repeat(80));
        const provinceStats = await db.query(
            `SELECT province, COUNT(*) as count
             FROM cities
             WHERE list_type = 'china_layflat'
             GROUP BY province
             ORDER BY count DESC`
        );

        provinceStats.forEach(stat => {
            console.log(`  ${stat.province}: ${stat.count} 个城市`);
        });

        console.log('\n✅ 数据验证完成！\n');

    } catch (error) {
        console.error('❌ 验证过程出错:', error);
    } finally {
        await db.close();
        process.exit(0);
    }
}

verifyData();
