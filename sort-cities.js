const fs = require('fs');

const data = JSON.parse(fs.readFileSync('data/layflat-cities-ranking.json', 'utf8'));

// 按照躺平指数排序：房价越低、租金越低越好
data.sort((a, b) => {
  // 计算躺平指数：综合考虑房价和租金（越低越好）
  const scoreA = (a.house_price || 99999) + (a.avg_rent || 9999) * 10;
  const scoreB = (b.house_price || 99999) + (b.avg_rent || 9999) * 10;
  return scoreA - scoreB;
});

// 重新分配rank
data.forEach((city, index) => {
  city.rank = index + 1;
});

fs.writeFileSync('data/layflat-cities-ranking.json', JSON.stringify(data, null, 2));
console.log('排序完成！共', data.length, '个城市');
console.log('前5名：');
data.slice(0, 5).forEach(c => {
  console.log(c.rank + '. ' + c.name + ' - 房价:¥' + c.house_price + '万 租金:¥' + c.avg_rent + '/月');
});
