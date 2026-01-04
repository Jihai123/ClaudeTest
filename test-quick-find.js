#!/usr/bin/env node
/**
 * 小程序功能全面测试脚本
 * 覆盖所有页面功能和各种使用场景
 */

const db = require('./server/models/database');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m'
};

function log(color, msg) {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(50));
  log('magenta', `【${title}】`);
  console.log('='.repeat(50));
}

function subSection(title) {
  console.log('');
  log('cyan', `▶ ${title}`);
}

// 测试结果统计
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  details: []
};

function pass(msg) {
  results.passed++;
  results.details.push({ status: 'pass', msg });
  log('green', `  ✓ ${msg}`);
}

function fail(msg) {
  results.failed++;
  results.details.push({ status: 'fail', msg });
  log('red', `  ✗ ${msg}`);
}

function warn(msg) {
  results.warnings++;
  results.details.push({ status: 'warn', msg });
  log('yellow', `  ⚠ ${msg}`);
}

function info(msg) {
  log('dim', `    ${msg}`);
}

async function runTests() {
  console.log('\n' + '█'.repeat(50));
  log('blue', '       小程序功能全面测试');
  console.log('█'.repeat(50));

  try {
    await db.init();
    await new Promise(r => setTimeout(r, 500));

    // ==========================================
    // 1. 快速找城模块（首页6个按钮）
    // ==========================================
    section('1. 快速找城模块（首页6个按钮）');

    // 1.1 低生活成本
    subSection('1.1 低生活成本城市');
    const lowCostCities = await db.query(`
      SELECT c.name, c.province, c.avg_rent, c.layflat_score
      FROM cities c
      WHERE c.list_type = 'china_layflat' AND c.avg_rent IS NOT NULL
      ORDER BY c.avg_rent ASC
      LIMIT 10
    `);
    if (lowCostCities.length > 0) {
      pass(`找到 ${lowCostCities.length} 个低成本城市`);
      lowCostCities.slice(0, 3).forEach(c => {
        info(`${c.name} (${c.province}) - 月租: ${c.avg_rent}元`);
      });
      // 验证排序是否正确
      const sorted = lowCostCities.every((c, i) => i === 0 || lowCostCities[i-1].avg_rent <= c.avg_rent);
      if (sorted) pass('按月租升序排列正确');
      else fail('月租排序不正确');
    } else {
      fail('没有找到低生活成本城市');
    }

    // 1.2 适合养老
    subSection('1.2 适合养老城市');
    const elderlyCities = await db.query(`
      SELECT c.name, c.province, cd.elderly_care, cd.medical_facilities, cd.air_quality, cd.safety
      FROM cities c
      LEFT JOIN city_dimensions cd ON c.id = cd.city_id
      WHERE cd.elderly_care >= 7 AND c.country = '中国'
      ORDER BY cd.elderly_care DESC
      LIMIT 10
    `);
    if (elderlyCities.length > 0) {
      pass(`找到 ${elderlyCities.length} 个适合养老城市`);
      elderlyCities.slice(0, 3).forEach(c => {
        info(`${c.name} - 养老:${c.elderly_care} 医疗:${c.medical_facilities} 空气:${c.air_quality}`);
      });
    } else {
      // 检查数据分布
      const elderlyStats = await db.get(`
        SELECT MAX(elderly_care) as max_score, AVG(elderly_care) as avg_score
        FROM city_dimensions WHERE elderly_care > 0
      `);
      warn(`养老评分最高仅 ${elderlyStats?.max_score}，平均 ${elderlyStats?.avg_score?.toFixed(1)}`);
    }

    // 1.3 就业机会多
    subSection('1.3 就业机会多城市');
    const employmentCities = await db.query(`
      SELECT c.name, c.province, c.city_tier, cd.employment, c.overall_score
      FROM cities c
      LEFT JOIN city_dimensions cd ON c.id = cd.city_id
      WHERE c.list_type = 'china_general'
      ORDER BY cd.employment DESC, c.overall_score DESC
      LIMIT 10
    `);
    if (employmentCities.length > 0) {
      pass(`找到 ${employmentCities.length} 个就业机会多城市`);
      employmentCities.slice(0, 5).forEach(c => {
        info(`${c.name} (${c.city_tier || '未分级'}) - 就业:${c.employment}`);
      });
      // 验证一线城市是否排在前面
      const tier1InTop5 = employmentCities.slice(0, 5).filter(c =>
        c.city_tier === 'tier1' || c.name.match(/北京|上海|广州|深圳|香港/)
      );
      if (tier1InTop5.length >= 3) pass('一线城市就业排名合理');
      else warn('一线城市就业排名可能不合理');
    } else {
      fail('没有找到就业机会多城市');
    }

    // 1.4 空气好
    subSection('1.4 空气质量好城市');
    const airCities = await db.query(`
      SELECT c.name, c.province, cd.air_quality
      FROM cities c
      LEFT JOIN city_dimensions cd ON c.id = cd.city_id
      WHERE cd.air_quality >= 7 AND c.country = '中国'
      ORDER BY cd.air_quality DESC
      LIMIT 10
    `);
    if (airCities.length > 0) {
      pass(`找到 ${airCities.length} 个空气好城市`);
      airCities.slice(0, 5).forEach(c => {
        info(`${c.name} (${c.province}) - 空气:${c.air_quality}`);
      });
      // 验证北京不在空气好城市前列
      const beijingInTop = airCities.slice(0, 5).some(c => c.name.includes('北京'));
      if (!beijingInTop) pass('北京未在空气好城市前5名（符合实际）');
      else warn('北京出现在空气好城市前5名（不符合实际）');
    } else {
      fail('没有找到空气好城市');
    }

    // 1.5 沿海宜居
    subSection('1.5 沿海宜居城市');
    const coastalCities = await db.query(`
      SELECT c.name, c.province, COALESCE(c.overall_score, c.layflat_score) as score
      FROM cities c
      INNER JOIN city_tags ct ON c.id = ct.city_id
      WHERE ct.tag_key = 'coastal' AND c.country = '中国'
      ORDER BY score DESC
      LIMIT 10
    `);
    if (coastalCities.length > 0) {
      pass(`找到 ${coastalCities.length} 个沿海城市`);
      coastalCities.slice(0, 5).forEach(c => {
        info(`${c.name} (${c.province}) - 评分:${c.score}`);
      });
    } else {
      // 检查coastal标签
      const coastalCount = await db.get(`SELECT COUNT(*) as count FROM city_tags WHERE tag_key = 'coastal'`);
      fail(`沿海城市查询失败，coastal标签数: ${coastalCount?.count || 0}`);
    }

    // ==========================================
    // 2. 排行榜（3个Tab）
    // ==========================================
    section('2. 排行榜功能（3个Tab）');

    // 2.1 世界城市榜
    subSection('2.1 世界城市榜');
    const worldCities = await db.query(`
      SELECT c.name, c.country, c.world_score
      FROM cities c
      WHERE c.list_type = 'world'
      ORDER BY c.world_score DESC
      LIMIT 10
    `);
    if (worldCities.length > 0) {
      pass(`世界榜有 ${worldCities.length} 个城市`);
      worldCities.slice(0, 5).forEach(c => {
        info(`${c.name} (${c.country}) - 宜居指数:${c.world_score}`);
      });
    } else {
      warn('世界城市榜暂无数据');
    }

    // 2.2 中国综合榜
    subSection('2.2 中国综合宜居榜');
    const chinaCities = await db.query(`
      SELECT c.name, c.province, c.overall_score, c.city_tier
      FROM cities c
      WHERE c.list_type = 'china_general'
      ORDER BY c.overall_score DESC
      LIMIT 10
    `);
    if (chinaCities.length > 0) {
      pass(`中国综合榜有 ${chinaCities.length} 个城市`);
      chinaCities.slice(0, 5).forEach(c => {
        info(`${c.name} (${c.province}) - 综合:${c.overall_score}`);
      });
    } else {
      fail('中国综合榜无数据');
    }

    // 2.3 旅居城市榜
    subSection('2.3 旅居城市榜（躺平榜）');
    const layflatCities = await db.query(`
      SELECT c.name, c.province, c.layflat_score, c.avg_rent
      FROM cities c
      WHERE c.list_type = 'china_layflat'
      ORDER BY c.layflat_score DESC
      LIMIT 10
    `);
    if (layflatCities.length > 0) {
      pass(`旅居榜有 ${layflatCities.length} 个城市`);
      layflatCities.slice(0, 5).forEach(c => {
        info(`${c.name} (${c.province}) - 躺平:${c.layflat_score} 月租:${c.avg_rent}元`);
      });
    } else {
      fail('旅居城市榜无数据');
    }

    // ==========================================
    // 3. 智能搜索关键词
    // ==========================================
    section('3. 智能搜索关键词');

    const searchKeywords = [
      { keyword: '看海', filter: 'coastal', expectTag: true },
      { keyword: '养老', filter: 'elderly_care >= 7', expectDim: 'elderly_care' },
      { keyword: '便宜', filter: 'living_cost <= 5', expectDim: 'living_cost' },
      { keyword: '工作', filter: 'employment >= 6', expectDim: 'employment' },
      { keyword: '安全', filter: 'safety >= 8', expectDim: 'safety' }
    ];

    for (const { keyword, filter, expectTag, expectDim } of searchKeywords) {
      subSection(`搜索关键词: "${keyword}"`);

      let query, cities;
      if (expectTag) {
        query = `
          SELECT c.name, c.province FROM cities c
          INNER JOIN city_tags ct ON c.id = ct.city_id
          WHERE ct.tag_key = 'coastal' AND c.country = '中国'
          LIMIT 5
        `;
        cities = await db.query(query);
      } else if (expectDim) {
        query = `
          SELECT c.name, c.province, cd.${expectDim} as score FROM cities c
          LEFT JOIN city_dimensions cd ON c.id = cd.city_id
          WHERE cd.${expectDim} >= 7 AND c.country = '中国'
          ORDER BY cd.${expectDim} DESC
          LIMIT 5
        `;
        cities = await db.query(query);
      }

      if (cities && cities.length > 0) {
        pass(`"${keyword}" 找到 ${cities.length} 个城市`);
        info(cities.map(c => c.name).join(', '));
      } else {
        warn(`"${keyword}" 未找到匹配城市`);
      }
    }

    // ==========================================
    // 4. 高级筛选功能
    // ==========================================
    section('4. 高级筛选功能');

    // 4.1 地区筛选
    subSection('4.1 地区筛选');
    const regions = {
      '华东': ['上海', '江苏', '浙江', '安徽', '福建', '江西', '山东'],
      '华南': ['广东', '广西', '海南'],
      '西南': ['重庆', '四川', '贵州', '云南', '西藏']
    };

    for (const [region, provinces] of Object.entries(regions)) {
      const placeholders = provinces.map(() => '?').join(',');
      const count = await db.get(`
        SELECT COUNT(*) as count FROM cities
        WHERE province IN (${placeholders}) OR province LIKE '%' || ? || '%'
      `, [...provinces, provinces[0]]);
      if (count.count > 0) {
        pass(`${region}地区: ${count.count} 个城市`);
      } else {
        warn(`${region}地区暂无数据`);
      }
    }

    // 4.2 城市等级筛选
    subSection('4.2 城市等级筛选');
    const tiers = ['tier1', 'tier1.5', 'tier2', 'tier3'];
    const tierLabels = { 'tier1': '一线', 'tier1.5': '新一线', 'tier2': '二线', 'tier3': '三线及以下' };

    for (const tier of tiers) {
      let count;
      if (tier === 'tier3') {
        count = await db.get(`
          SELECT COUNT(*) as count FROM cities
          WHERE city_tier NOT IN ('tier1', 'tier1.5', 'tier2') OR city_tier IS NULL
        `);
      } else {
        count = await db.get(`SELECT COUNT(*) as count FROM cities WHERE city_tier = ?`, [tier]);
      }
      if (count.count > 0) {
        pass(`${tierLabels[tier]}: ${count.count} 个城市`);
      } else {
        info(`${tierLabels[tier]}: 0 个城市`);
      }
    }

    // 4.3 租金区间筛选
    subSection('4.3 租金区间筛选');
    const rentRanges = [
      { label: '500元以下', min: 0, max: 500 },
      { label: '500-1000元', min: 500, max: 1000 },
      { label: '1000-2000元', min: 1000, max: 2000 },
      { label: '2000元以上', min: 2000, max: 99999 }
    ];

    for (const { label, min, max } of rentRanges) {
      const count = await db.get(`
        SELECT COUNT(*) as count FROM cities
        WHERE avg_rent >= ? AND avg_rent < ? AND avg_rent IS NOT NULL
      `, [min, max]);
      info(`${label}: ${count.count} 个城市`);
    }

    // ==========================================
    // 5. 热门城市API
    // ==========================================
    section('5. 热门城市API');

    // 5.1 周热门（按浏览量）
    subSection('5.1 周热门（按浏览量）');
    const weeklyHot = await db.query(`
      SELECT name, province, views_count
      FROM cities
      WHERE status = 'approved'
      ORDER BY views_count DESC
      LIMIT 5
    `);
    if (weeklyHot.length > 0) {
      pass(`周热门: ${weeklyHot.length} 个城市`);
      weeklyHot.forEach(c => info(`${c.name} - 浏览:${c.views_count || 0}`));
    } else {
      warn('周热门无数据');
    }

    // 5.2 编辑推荐（高评分+低房租）
    subSection('5.2 编辑推荐');
    const featured = await db.query(`
      SELECT name, province, avg_rent, layflat_score
      FROM cities
      WHERE status = 'approved'
        AND avg_rent IS NOT NULL AND avg_rent < 2000
        AND (layflat_score >= 7.5 OR overall_score >= 7.5)
      ORDER BY layflat_score DESC
      LIMIT 5
    `);
    if (featured.length > 0) {
      pass(`编辑推荐: ${featured.length} 个城市`);
      featured.forEach(c => info(`${c.name} - 月租:${c.avg_rent}元 评分:${c.layflat_score}`));
    } else {
      warn('编辑推荐无数据（高评分+低房租城市）');
    }

    // ==========================================
    // 6. 数据完整性检查
    // ==========================================
    section('6. 数据完整性检查');

    // 6.1 重复城市
    subSection('6.1 重复城市检查');
    const duplicates = await db.query(`
      SELECT name, province, COUNT(*) as cnt
      FROM cities
      GROUP BY name, province
      HAVING cnt > 1
    `);
    if (duplicates.length === 0) {
      pass('无重复城市数据');
    } else {
      fail(`发现 ${duplicates.length} 组重复城市`);
      duplicates.slice(0, 3).forEach(d => info(`${d.name} (${d.province}) - ${d.cnt}条`));
    }

    // 6.2 空省份检查
    subSection('6.2 省份数据检查');
    const nullProvince = await db.query(`
      SELECT name, country FROM cities
      WHERE (province IS NULL OR province = '' OR province = 'null')
        AND country = '中国'
      LIMIT 10
    `);
    if (nullProvince.length === 0) {
      pass('中国城市省份数据完整');
    } else {
      warn(`${nullProvince.length} 个中国城市缺少省份: ${nullProvince.map(c => c.name).join(', ')}`);
    }

    // 6.3 评分数据检查
    subSection('6.3 评分数据检查');
    const noScore = await db.get(`
      SELECT COUNT(*) as count FROM cities c
      LEFT JOIN city_dimensions cd ON c.id = cd.city_id
      WHERE c.status = 'approved' AND cd.city_id IS NULL
    `);
    if (noScore.count === 0) {
      pass('所有城市都有维度评分');
    } else {
      warn(`${noScore.count} 个城市缺少维度评分`);
    }

    // 6.4 异常评分检查
    subSection('6.4 异常评分检查');
    const abnormalScores = await db.query(`
      SELECT c.name, cd.air_quality, cd.employment
      FROM cities c
      LEFT JOIN city_dimensions cd ON c.id = cd.city_id
      WHERE (cd.air_quality > 10 OR cd.air_quality < 0)
         OR (cd.employment > 10 OR cd.employment < 0)
    `);
    if (abnormalScores.length === 0) {
      pass('评分数据均在0-10范围内');
    } else {
      fail(`${abnormalScores.length} 个城市评分异常`);
    }

    // 6.5 各榜单数据量统计
    subSection('6.5 各榜单数据量');
    const listStats = await db.query(`
      SELECT list_type, COUNT(*) as count
      FROM cities
      WHERE status = 'approved'
      GROUP BY list_type
    `);
    listStats.forEach(s => {
      const label = {
        'world': '世界榜',
        'china_general': '中国综合榜',
        'china_layflat': '旅居榜'
      }[s.list_type] || s.list_type || '未分类';
      info(`${label}: ${s.count} 个城市`);
    });

    // ==========================================
    // 7. API模拟测试
    // ==========================================
    section('7. API逻辑模拟测试');

    // 7.1 沿海城市API筛选
    subSection('7.1 沿海城市API筛选SQL');
    const apiCoastal = await db.query(`
      SELECT c.id, c.name, c.province
      FROM cities c
      WHERE c.status = 'approved'
        AND c.id IN (
          SELECT DISTINCT city_id FROM city_tags
          WHERE tag_key = 'coastal'
        )
        AND c.country = '中国'
      LIMIT 5
    `);
    if (apiCoastal.length > 0) {
      pass(`API沿海筛选正常: ${apiCoastal.length} 个城市`);
    } else {
      fail('API沿海筛选返回0条数据');
    }

    // 7.2 维度筛选API
    subSection('7.2 维度筛选API');
    const apiDimFilter = await db.query(`
      SELECT c.name, cd.air_quality
      FROM cities c
      LEFT JOIN city_dimensions cd ON c.id = cd.city_id
      WHERE c.status = 'approved' AND cd.air_quality >= 7
      LIMIT 5
    `);
    if (apiDimFilter.length > 0) {
      pass(`维度筛选正常: ${apiDimFilter.length} 个城市`);
    } else {
      warn('维度筛选返回0条数据');
    }

    // 7.3 城市对比API
    subSection('7.3 城市对比API');
    const cityIds = await db.query(`SELECT id FROM cities WHERE status = 'approved' LIMIT 3`);
    if (cityIds.length >= 2) {
      const ids = cityIds.map(c => c.id);
      const placeholders = ids.map(() => '?').join(',');
      const compare = await db.query(`
        SELECT c.name, cd.living_cost, cd.air_quality, cd.employment
        FROM cities c
        LEFT JOIN city_dimensions cd ON c.id = cd.city_id
        WHERE c.id IN (${placeholders})
      `, ids);
      if (compare.length === ids.length) {
        pass('城市对比API正常');
      } else {
        fail('城市对比API数据不完整');
      }
    }

    // ==========================================
    // 测试汇总
    // ==========================================
    section('测试汇总');

    console.log('');
    log('green', `  ✓ 通过: ${results.passed}`);
    log('red', `  ✗ 失败: ${results.failed}`);
    log('yellow', `  ⚠ 警告: ${results.warnings}`);
    console.log('');

    if (results.failed === 0) {
      log('green', '🎉 所有测试通过！');
    } else {
      log('red', '❌ 存在测试失败，请检查上述错误');
    }

    console.log('\n' + '█'.repeat(50) + '\n');

  } catch (error) {
    log('red', '测试执行失败: ' + error.message);
    console.error(error);
  } finally {
    await db.close();
  }
}

runTests();
