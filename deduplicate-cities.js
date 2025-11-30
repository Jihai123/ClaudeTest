#!/usr/bin/env node
/**
 * 清理 layflat-cities-ranking.json 中的重复城市数据
 * 保留每个"名称+省份"组合的第一条记录
 */

const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'data/layflat-cities-ranking.json');
const backupPath = path.join(__dirname, 'data/layflat-cities-ranking.json.backup');

async function deduplicateCities() {
    console.log('📋 开始去重处理...\n');

    try {
        // 读取原始数据
        const rawData = fs.readFileSync(dataPath, 'utf8');
        const cities = JSON.parse(rawData);

        console.log(`📊 原始数据: ${cities.length} 个城市\n`);

        // 创建备份
        fs.copyFileSync(dataPath, backupPath);
        console.log(`✓ 已创建备份: ${backupPath}\n`);

        // 去重逻辑: 使用 Map 保存每个"名称+省份"的第一次出现
        const seen = new Map();
        const unique = [];
        const duplicates = [];

        for (const city of cities) {
            const key = `${city.name}|${city.province}`;

            if (!seen.has(key)) {
                // 第一次遇到这个城市,保留
                seen.set(key, city);
                unique.push(city);
            } else {
                // 重复的城市
                duplicates.push({
                    ...city,
                    firstRank: seen.get(key).rank
                });
            }
        }

        // 显示重复的城市
        if (duplicates.length > 0) {
            console.log('🔍 发现以下重复城市:\n');
            duplicates.forEach(dup => {
                console.log(`   ⊘ ${dup.name} (${dup.province})`);
                console.log(`      - 排名 #${dup.firstRank} (保留)`);
                console.log(`      - 排名 #${dup.rank} (删除)\n`);
            });
        } else {
            console.log('✓ 没有发现重复城市\n');
        }

        // 重新排序 rank
        const sorted = unique.sort((a, b) => {
            // 如果有 rank 字段,按 rank 排序
            if (a.rank && b.rank) {
                return a.rank - b.rank;
            }
            return 0;
        });

        // 写回文件
        fs.writeFileSync(
            dataPath,
            JSON.stringify(sorted, null, 2),
            'utf8'
        );

        console.log('========================================');
        console.log('✅ 去重完成！');
        console.log(`   原始数据: ${cities.length} 个`);
        console.log(`   去重后: ${unique.length} 个`);
        console.log(`   删除重复: ${duplicates.length} 个`);
        console.log('========================================\n');

        console.log('💡 提示:');
        console.log(`   - 已保存到: ${dataPath}`);
        console.log(`   - 如需恢复,使用备份: ${backupPath}\n`);

    } catch (error) {
        console.error('❌ 处理失败:', error.message);
        process.exit(1);
    }
}

// 运行去重
deduplicateCities();
