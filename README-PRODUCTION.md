# 🚀 生产环境部署完全指南

## 📍 当前配置

- **网站URL**: https://www.chatgpt5x.com/livablecities/
- **API端口**: 3007
- **项目路径**: /www/wwwroot/yijucity/ClaudeTest

## ✅ 第一步：拉取最新代码

```bash
cd /www/wwwroot/yijucity/ClaudeTest
git pull origin claude/frontend-redesign-city-details-01KWoHSQ7rfXjPfz1XMFwa5B
```

## ✅ 第二步：导入躺平榜数据

### 方案A：快速导入（5个精选城市）

```bash
cd /www/wwwroot/yijucity/ClaudeTest
node import-data.js
```

**输出示例：**
```
🚀 开始导入躺平榜城市数据...

✓ 数据库连接成功

✓ 导入成功: 荣成 (评分: 8.85)
✓ 导入成功: 乳山 (评分: 8.77)
✓ 导入成功: 威海 (评分: 8.46)
✓ 导入成功: 大理 (评分: 8.47)
✓ 导入成功: 昆明 (评分: 8.25)

========================================
✅ 导入完成！
   成功: 5 个
   跳过: 0 个
   总计: 5 个
========================================
```

### 方案B：完整导入（30个城市）

```bash
cd /www/wwwroot/yijucity/ClaudeTest
node server/utils/seedLayflatCities.js
```

## ✅ 第三步：测试API

```bash
# 测试健康检查
curl http://localhost:3007/api/health

# 测试城市列表
curl http://localhost:3007/api/cities?list_type=china_layflat&limit=3

# 测试公网访问
curl https://www.chatgpt5x.com/livablecities/api/health
curl https://www.chatgpt5x.com/livablecities/api/cities?limit=3
```

**正确的响应：**
```json
{
  "status": "ok",
  "timestamp": "2025-11-29T12:40:11.736Z"
}
```

## ✅ 第四步：验证前端

访问：https://www.chatgpt5x.com/livablecities/

**应该看到：**
- ✅ 页面正常加载
- ✅ 统计数据显示城市数量
- ✅ 城市卡片列表展示
- ✅ 控制台显示：`🚀 API配置: {baseURL: "https://www.chatgpt5x.com/livablecities", ...}`

## 🔍 调试技巧

### 1. 查看浏览器控制台（F12）

**Console标签：**
```
🚀 API配置: {baseURL: "https://www.chatgpt5x.com/livablecities", isDev: false}
API Request: https://www.chatgpt5x.com/livablecities/api/cities?list_type=china_layflat&limit=50&filters=%7B%7D
```

**Network标签：**
- 查看 `/api/cities` 请求
- 状态应该是 **200 OK**
- 响应应该包含城市数据

### 2. 检查服务器状态

```bash
# PM2状态
pm2 status

# 查看日志
pm2 logs tangping-api --lines 50

# 重启服务
pm2 restart tangping-api
```

### 3. 检查端口

```bash
# 确认3007端口在监听
netstat -tunlp | grep 3007

# 应该看到类似：
# tcp6  0  0 :::3007  :::*  LISTEN  12345/node
```

## 📊 数据管理

### 查看已导入的城市

```bash
# 进入项目目录
cd /www/wwwroot/yijucity/ClaudeTest

# 使用sqlite3查看
sqlite3 database.sqlite

# 执行SQL
SELECT name, province, layflat_score FROM cities WHERE list_type='china_layflat' ORDER BY layflat_score DESC;

# 退出
.exit
```

### 清空数据重新导入

```bash
# 备份数据库
cp database.sqlite database.sqlite.backup

# 清空城市数据
sqlite3 database.sqlite "DELETE FROM cities WHERE list_type='china_layflat';"

# 重新导入
node import-data.js
```

## 🎯 Nginx配置参考

你的当前配置已经正确：

```nginx
location ^~ /livablecities/ {
    proxy_pass http://127.0.0.1:3007/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

## ⚠️ 常见问题

### 1. API返回404

**检查：**
```bash
# 确认服务在运行
pm2 status | grep tangping-api

# 测试本地API
curl http://localhost:3007/api/health
```

### 2. 页面加载但没有数据

**检查：**
- 打开浏览器控制台查看错误
- 确认数据已导入：`sqlite3 database.sqlite "SELECT COUNT(*) FROM cities;"`

### 3. 样式或资源404

**确保静态文件路径正确：**
- CSS、JS文件应该能通过 `/livablecities/` 路径访问
- 检查Nginx静态文件配置

## 📝 完整测试清单

```bash
# ✓ 服务运行中
pm2 status | grep tangping-api

# ✓ 本地API正常
curl http://localhost:3007/api/health

# ✓ 公网API正常
curl https://www.chatgpt5x.com/livablecities/api/health

# ✓ 数据已导入
sqlite3 database.sqlite "SELECT COUNT(*) FROM cities;"

# ✓ 前端正常访问
curl -I https://www.chatgpt5x.com/livablecities/
```

## 🚀 快速重启服务

```bash
cd /www/wwwroot/yijucity/ClaudeTest
pm2 restart tangping-api
pm2 logs tangping-api --lines 20
```

## 💡 优化建议

1. **设置开机自启**
   ```bash
   pm2 startup
   pm2 save
   ```

2. **配置日志轮转**
   ```bash
   pm2 install pm2-logrotate
   ```

3. **监控资源使用**
   ```bash
   pm2 monit
   ```

## 🆘 需要帮助？

如果遇到问题，收集以下信息：

```bash
# 1. PM2状态
pm2 status

# 2. 服务日志
pm2 logs tangping-api --lines 100 --nostream > logs.txt

# 3. 系统信息
node -v
npm -v
pm2 -v

# 4. 端口检查
netstat -tunlp | grep 3007

# 5. 数据库检查
sqlite3 database.sqlite "SELECT COUNT(*) FROM cities;"
```

将 `logs.txt` 和上述命令的输出提供给技术支持。
