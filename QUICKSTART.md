# 🚀 快速修复指南

## 当前问题
```bash
curl https://www.chatgpt5x.com/api/health
# 返回: 404 Not Found (nginx)
```

这说明：
- ✅ Nginx正在运行
- ❌ API没有配置代理
- ❌ Node.js服务器可能未启动

## 🔧 快速修复步骤

### 步骤1: 启动Node.js服务器

```bash
# 方法A: 使用启动脚本（推荐）
cd /www/wwwroot/yijucity/ClaudeTest
bash start-production.sh

# 方法B: 手动启动
cd /www/wwwroot/yijucity/ClaudeTest
pm2 start server.js --name tangping-api
pm2 save
```

### 步骤2: 测试本地API

```bash
# 应该返回 {"status":"ok","timestamp":"..."}
curl http://localhost:3000/api/health

# 测试城市列表
curl http://localhost:3000/api/cities?limit=1
```

### 步骤3: 配置Nginx

**如果使用宝塔面板：**
1. 登录宝塔面板
2. 网站 → 找到 chatgpt5x.com → 设置
3. 配置文件 → 在 `server {}` 块中添加：

```nginx
# 添加这段到 server {} 内部
location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**如果直接编辑配置文件：**

```bash
# 编辑nginx配置
nano /www/server/panel/vhost/nginx/chatgpt5x.com.conf

# 或者使用示例配置
cp nginx-config-example.conf /www/server/panel/vhost/nginx/chatgpt5x.com.conf
```

### 步骤4: 重启Nginx

```bash
# 测试配置
nginx -t

# 重启nginx
systemctl restart nginx
# 或
/etc/init.d/nginx restart
```

### 步骤5: 验证

```bash
# 测试健康检查
curl https://www.chatgpt5x.com/api/health
# 应该返回: {"status":"ok","timestamp":"..."}

# 测试城市列表
curl https://www.chatgpt5x.com/api/cities?limit=1
```

## 🔍 常见问题

### 1. Node.js服务器没有运行

```bash
# 检查进程
pm2 status

# 如果没有tangping-api，启动它
pm2 start server.js --name tangping-api
```

### 2. 端口3000被占用

```bash
# 查看端口占用
lsof -i :3000
# 或
netstat -tunlp | grep 3000

# 杀死占用进程
kill -9 <PID>
```

### 3. Nginx配置错误

```bash
# 检查配置
nginx -t

# 查看错误日志
tail -f /www/wwwlogs/chatgpt5x.com.error.log
```

### 4. 权限问题

```bash
# 确保文件权限正确
chown -R www:www /www/wwwroot/yijucity/ClaudeTest
```

## 📊 验证清单

完成后，这些命令应该都成功：

```bash
# ✓ 本地API
curl http://localhost:3000/api/health

# ✓ 公网API
curl https://www.chatgpt5x.com/api/health

# ✓ PM2状态
pm2 status
# 应该看到 tangping-api online

# ✓ Nginx测试
nginx -t
# 应该显示 successful
```

## 🆘 需要帮助？

如果问题仍然存在，收集以下信息：

```bash
# 1. PM2状态
pm2 status
pm2 logs tangping-api --lines 50

# 2. Nginx配置
cat /www/server/panel/vhost/nginx/chatgpt5x.com.conf

# 3. 端口检查
netstat -tunlp | grep 3000

# 4. 进程检查
ps aux | grep node
```

然后把这些信息提供给我。
