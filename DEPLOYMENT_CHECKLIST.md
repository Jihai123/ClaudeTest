# 生产环境部署检查清单

## 🚀 部署步骤

### 1. 拉取最新代码

```bash
cd /www/wwwroot/yijucity/ClaudeTest
git pull origin claude/website-ux-ui-audit-012djJnbR7dfPYnK4RWi7GXC
```

### 2. 安装依赖

```bash
# 完整安装（推荐）
npm install

# 或仅生产依赖
npm install --production

# 关键依赖（如果完整安装失败）
npm install multer@1.4.5-lts.1 node-fetch@2.7.0 form-data@4.0.0 aws-sdk@2.1519.0
```

### 3. 配置环境变量

确保 `.env` 文件存在且配置正确：

```bash
# 检查 .env 文件
cat .env

# 必需配置项
BASE_PATH=/yiju
BASE_URL=https://zhibeimao.com
IMAGE_UPLOAD_METHOD=r2

# R2 凭证（必须填写真实值）
R2_ACCOUNT_ID=your_real_account_id
R2_ACCESS_KEY_ID=your_real_access_key
R2_SECRET_ACCESS_KEY=your_real_secret_key
R2_BUCKET_NAME=your_real_bucket_name
R2_PUBLIC_DOMAIN=your.r2.dev  # 或自定义域名
```

### 4. 验证依赖安装

```bash
node -e "
try {
  require('multer');
  require('node-fetch');
  require('form-data');
  require('aws-sdk');
  console.log('✅ 所有依赖已安装');
} catch(e) {
  console.error('❌ 缺少依赖:', e.message);
  process.exit(1);
}
"
```

### 5. 测试路由加载

```bash
node -e "
require('dotenv').config();
const upload = require('./server/routes/upload');
console.log('✅ 上传路由加载成功');
"
```

### 6. 重启服务

```bash
# 使用 PM2
pm2 restart yijucit

# 或使用应用名称
pm2 restart all

# 查看状态
pm2 status

# 查看日志（重要！）
pm2 logs yijucit --lines 50
```

### 7. 验证服务运行

```bash
# 检查端口监听
lsof -i :3000
# 或
netstat -tlnp | grep 3000

# 测试健康检查
curl http://localhost:3000/yiju/api/health

# 测试上传路由（需要有图片文件）
curl -X POST http://localhost:3000/yiju/api/upload \
  -F "image=@test.jpg" \
  -v
```

---

## ⚠️ 常见问题

### 问题1: MODULE_NOT_FOUND

**症状:**
```
Error: Cannot find module 'multer'
```

**解决:**
```bash
npm install
pm2 restart yijucit
```

### 问题2: 404 Not Found

**症状:**
```
POST https://zhibeimao.com/yiju/api/upload 404
```

**检查:**
1. `.env` 中 `BASE_PATH=/yiju` 是否正确
2. 服务是否重启
3. Nginx 配置是否包含 `/yiju/api/` 代理

**Nginx配置示例:**
```nginx
location /yiju/api/ {
    proxy_pass http://localhost:3000/yiju/api/;
    proxy_set_header Host $host;
    client_max_body_size 10M;
}
```

### 问题3: R2上传失败

**症状:**
```
Cloudflare R2配置不完整
```

**解决:**
检查 `.env` 中所有 R2 配置是否填写真实值（不是示例值）

### 问题4: 文件太大

**症状:**
```
文件大小超过限制
```

**解决:**
1. 服务器端已设置 5MB 限制
2. Nginx 需要设置 `client_max_body_size 10M;`

---

## 🧪 测试步骤

### 1. 后端测试

```bash
# 测试上传API
curl -X POST http://localhost:3000/yiju/api/upload \
  -F "image=@/path/to/test.jpg" \
  -H "Content-Type: multipart/form-data"

# 预期返回
{
  "success": true,
  "url": "https://...",
  "filename": "...",
  "size": 12345
}
```

### 2. 前端测试

1. 访问 https://zhibeimao.com/yiju/upload-images.html
2. 选择城市
3. 上传图片
4. 检查浏览器控制台无错误
5. 验证返回的图片URL可访问

### 3. 数据库测试

```bash
# 检查图片记录是否保存
sqlite3 /www/wwwroot/yijucity/ClaudeTest/database.sqlite
SELECT * FROM city_images ORDER BY created_at DESC LIMIT 5;
```

---

## 📊 性能检查

```bash
# PM2 监控
pm2 monit

# 内存使用
pm2 show yijucit

# 日志大小
du -sh ~/.pm2/logs/
```

---

## 🔄 回滚方案

如果新版本有问题，快速回滚：

```bash
# 1. 切回之前的commit
git log --oneline -10
git checkout <previous-commit-hash>

# 2. 重新安装依赖
npm install

# 3. 重启服务
pm2 restart yijucit

# 4. 验证回滚成功
pm2 logs yijucit --lines 20
```

---

## ✅ 部署成功标志

- [x] PM2 显示 `online` 状态
- [x] 日志无错误信息
- [x] `curl http://localhost:3000/yiju/api/health` 返回 200
- [x] 上传图片返回成功响应
- [x] 图片URL可正常访问
- [x] 数据库保存图片记录

---

## 📞 需要帮助？

如果遇到问题：

1. 查看 PM2 日志: `pm2 logs yijucit --lines 100`
2. 查看 Nginx 日志: `tail -f /www/server/panel/logs/error.log`
3. 检查系统日志: `journalctl -u nginx -n 50`
4. 提供完整错误信息以便诊断
