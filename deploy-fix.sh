#!/bin/bash

# 生产服务器快速部署脚本
# 用法: bash deploy-fix.sh

set -e  # 遇到错误立即退出

echo "🚀 开始修复依赖问题..."

# 进入项目目录
cd /www/wwwroot/yijucity/ClaudeTest

# 备份当前 node_modules
if [ -d "node_modules" ]; then
    echo "📦 备份现有 node_modules..."
    mv node_modules node_modules.backup.$(date +%s) || true
fi

# 安装依赖
echo "📥 安装依赖包..."
npm install --production

# 检查关键依赖
echo "✅ 检查关键依赖..."
node -e "
try {
  require('multer');
  require('node-fetch');
  require('form-data');
  require('aws-sdk');
  console.log('✅ 所有依赖安装成功');
} catch(e) {
  console.error('❌ 依赖安装失败:', e.message);
  process.exit(1);
}
"

# 重启PM2
echo "🔄 重启PM2服务..."
pm2 restart yijucit

# 等待2秒
sleep 2

# 查看日志
echo "📋 服务状态:"
pm2 status
echo ""
echo "📋 最新日志:"
pm2 logs yijucit --lines 20 --nostream

echo ""
echo "✅ 部署完成！"
echo "请访问: https://zhibeimao.com/yiju/upload-images.html 测试上传功能"
