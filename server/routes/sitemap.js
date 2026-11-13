const express = require('express');
const router = express.Router();
const db = require('../models/database');

// 生成动态Sitemap
router.get('/sitemap.xml', async (req, res) => {
  try {
    const baseURL = process.env.SITEMAP_BASE_URL || 'https://yiju.zhibeimao.com';
    const now = new Date().toISOString().slice(0, 10);
    const xmlDate = (value) => {
      const raw = value == null ? '' : String(value).trim();
      // SQLite DATETIME values have no timezone. Preserve their calendar date:
      // parsing as local time and then calling toISOString() shifts the day
      // on hosts east of UTC (for example Asia/Shanghai).
      const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:$|[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$)/);
      if (match) {
        const calendarDay = new Date(match[1] + 'T00:00:00Z');
        return Number.isFinite(calendarDay.getTime()) &&
          calendarDay.toISOString().slice(0, 10) === match[1] ? match[1] : now;
      }
      const parsed = raw ? new Date(raw) : null;
      return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : now;
    };

    // 获取所有已审核的城市
    const cities = await db.query(
      'SELECT id, name, updated_at FROM cities WHERE status = ? ORDER BY id',
      ['approved']
    );

    // XML头部
    let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
    sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // 首页
    sitemap += `  <url>
    <loc>${baseURL}/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>\n`;

    // 躺平榜页面
    sitemap += `  <url>
    <loc>${baseURL}/?list=china_layflat</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>\n`;

    // 综合榜页面
    sitemap += `  <url>
    <loc>${baseURL}/?list=china_general</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>\n`;

    // 世界榜页面
    sitemap += `  <url>
    <loc>${baseURL}/?list=world</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>\n`;

    // 精选站内工具与经来源核验的城市资料页。
    // 仅加入已存在的永久静态页，避免Nginx静态与动态sitemap遗漏互相矛盾。
    const guides = [
      { path: '/city-compare.html', changefreq: 'monthly' },
      { path: '/verified-city-facts.html', changefreq: 'monthly' },
      { path: '/zhangye-city-facts-2025.html', changefreq: 'monthly' },
      { path: '/city-living-checklist.html', changefreq: 'monthly' },
      { path: '/2025-city-evidence-atlas.html', changefreq: 'monthly' }
    ];
    guides.forEach(guide => {
      sitemap += `  <url>
    <loc>${baseURL}${guide.path}</loc>
    <lastmod>2026-11-12</lastmod>
    <changefreq>${guide.changefreq}</changefreq>
    <priority>0.7</priority>
  </url>\n`;
    });

    // 所有城市详情页
    cities.forEach(city => {
      const lastmod = xmlDate(city.updated_at);
      sitemap += `  <url>
    <loc>${baseURL}/city-detail.html?id=${city.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>\n`;
    });

    // XML尾部
    sitemap += '</urlset>';

    // 设置响应头
    res.header('Content-Type', 'application/xml; charset=utf-8');
    res.header('Cache-Control', 'public, max-age=3600'); // 缓存1小时
    res.send(sitemap);

  } catch (error) {
    console.error('生成Sitemap失败:', error);
    res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><error>Failed to generate sitemap</error>');
  }
});

module.exports = router;
