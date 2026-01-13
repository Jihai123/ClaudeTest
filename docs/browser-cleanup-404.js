/**
 * 浏览器端 404 图片检测和清理脚本
 *
 * 使用方法：
 * 1. 登录管理后台
 * 2. 打开浏览器开发者工具 (F12)
 * 3. 切换到 Console 标签
 * 4. 复制粘贴下面的代码并运行
 *
 * 注意：需要先登录管理后台，脚本会使用当前登录凭证
 */

(async function cleanup404Images() {
  const API_BASE = window.location.origin; // 自动获取当前域名
  const TOKEN = localStorage.getItem('token'); // 从localStorage获取token

  if (!TOKEN) {
    console.error('未找到登录凭证，请先登录管理后台');
    return;
  }

  console.log('='.repeat(50));
  console.log('     404 图片检测和清理脚本');
  console.log('='.repeat(50));

  // 1. 获取所有图片
  console.log('\n正在获取图片列表...');
  const response = await fetch(`${API_BASE}/api/admin/images?page=1&limit=9999`, {
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    console.error('获取图片列表失败:', response.status);
    return;
  }

  const data = await response.json();
  const images = data.images || [];
  console.log(`找到 ${images.length} 张图片`);

  if (images.length === 0) {
    console.log('没有图片需要检查');
    return;
  }

  // 2. 检查每张图片
  console.log('\n正在检查图片 URL...');
  const notFoundIds = [];
  const errorIds = [];
  const validCount = { count: 0 };
  const BATCH_SIZE = 20;

  for (let i = 0; i < images.length; i += BATCH_SIZE) {
    const batch = images.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (img) => {
      try {
        const res = await fetch(img.image_url, { method: 'HEAD', mode: 'cors' });

        if (res.status === 404) {
          notFoundIds.push(img.id);
          console.log(`❌ 404: ID=${img.id}, ${img.image_url}`);
        } else if (res.ok) {
          validCount.count++;
        } else {
          errorIds.push({ id: img.id, status: res.status });
        }
      } catch (error) {
        // 跨域错误可能意味着图片不存在或服务器问题
        // 尝试用 img 标签加载来确认
        const exists = await checkImageExists(img.image_url);
        if (!exists) {
          notFoundIds.push(img.id);
          console.log(`❌ 无法加载: ID=${img.id}, ${img.image_url}`);
        } else {
          validCount.count++;
        }
      }
    }));

    // 显示进度
    const progress = Math.min(i + BATCH_SIZE, images.length);
    console.log(`进度: ${progress}/${images.length}`);
  }

  // 辅助函数：用 img 标签检测图片是否存在
  function checkImageExists(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
      // 5秒超时
      setTimeout(() => resolve(false), 5000);
    });
  }

  // 3. 显示结果
  console.log('\n' + '='.repeat(50));
  console.log('     检查结果');
  console.log('='.repeat(50));
  console.log(`有效图片: ${validCount.count}`);
  console.log(`404 图片: ${notFoundIds.length}`);
  console.log(`其他错误: ${errorIds.length}`);

  if (notFoundIds.length === 0) {
    console.log('\n没有发现 404 图片！');
    return;
  }

  console.log(`\n发现 ${notFoundIds.length} 张 404 图片`);
  console.log('404 图片 ID 列表:', notFoundIds);

  // 4. 询问是否删除
  const shouldDelete = confirm(`发现 ${notFoundIds.length} 张 404 图片，是否删除？`);

  if (!shouldDelete) {
    console.log('已取消删除');
    console.log('\n如需手动删除，可以运行:');
    console.log(`await deleteImages(${JSON.stringify(notFoundIds)})`);

    // 暴露删除函数供手动调用
    window.deleteImages = async function(ids) {
      const res = await fetch(`${API_BASE}/api/admin/images/batch-delete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids })
      });
      const result = await res.json();
      console.log('删除结果:', result);
      return result;
    };

    return;
  }

  // 5. 执行删除
  console.log('\n正在删除 404 图片...');
  const deleteResponse = await fetch(`${API_BASE}/api/admin/images/batch-delete`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ids: notFoundIds })
  });

  if (deleteResponse.ok) {
    const result = await deleteResponse.json();
    console.log('✅ 删除成功:', result.message);
  } else {
    console.error('❌ 删除失败:', await deleteResponse.text());
  }

  console.log('\n脚本执行完成');
})();
