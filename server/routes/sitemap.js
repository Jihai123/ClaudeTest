const express = require('express');
const router = express.Router();
const db = require('../models/database');

// 生成动态Sitemap
router.get('/sitemap.xml', async (req, res) => {
  try {
    const baseURL = process.env.BASE_URL || 'https://tangping.com';
    const now = new Date().toISOString();

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

    // 所有城市详情页
    cities.forEach(city => {
      const lastmod = city.updated_at || now;
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
    res.header('Content-Type', 'application/xml');
    res.header('Cache-Control', 'public, max-age=3600'); // 缓存1小时
    res.send(sitemap);

  } catch (error) {
    console.error('生成Sitemap失败:', error);
    res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><error>Failed to generate sitemap</error>');
  }
});

module.exports = router;
