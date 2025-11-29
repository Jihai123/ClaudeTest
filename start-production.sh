#!/bin/bash
# 生产环境启动脚本

echo "🚀 躺平榜 - 生产环境启动脚本"
echo "================================"

# 进入项目目录
cd /www/wwwroot/yijucity/ClaudeTest

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: Node.js未安装"
    exit 1
fi

echo "✓ Node.js版本: $(node -v)"

# 安装依赖（如果需要）
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 检查PM2
if ! command -v pm2 &> /dev/null; then
    echo "📦 安装PM2..."
    npm install -g pm2
fi

# 停止旧进程
pm2 delete tangping-api 2>/dev/null || true

# 启动服务
echo "🚀 启动服务..."
pm2 start server.js --name tangping-api --env production

# 保存PM2配置
pm2 save

# 设置开机启动
pm2 startup

echo ""
echo "✅ 服务启动成功！"
echo ""
echo "📊 查看状态: pm2 status"
echo "📝 查看日志: pm2 logs tangping-api"
echo "🔄 重启服务: pm2 restart tangping-api"
echo ""
echo "🧪 测试API:"
echo "   curl http://localhost:3000/api/health"
echo ""
