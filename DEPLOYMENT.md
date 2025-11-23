# 部署指南

本文档提供详细的生产环境部署说明。

## 目录
- [系统要求](#系统要求)
- [部署准备](#部署准备)
- [服务器配置](#服务器配置)
- [应用部署](#应用部署)
- [Nginx配置](#nginx配置)
- [SSL证书](#ssl证书)
- [进程管理](#进程管理)
- [监控和维护](#监控和维护)

## 系统要求

### 硬件要求
- CPU: 1核心以上
- 内存: 1GB以上
- 硬盘: 10GB以上可用空间

### 软件要求
- 操作系统: Ubuntu 20.04+ / CentOS 7+ / Debian 10+
- Node.js: 14.x或更高版本
- npm: 6.x或更高版本
- Nginx: 1.18+（可选，用于反向代理）

## 部署准备

### 1. 创建部署用户
```bash
# 创建专用用户
sudo adduser nodeapp
sudo usermod -aG sudo nodeapp

# 切换到新用户
su - nodeapp
```

### 2. 安装Node.js
```bash
# 使用NodeSource仓库安装
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version
npm --version
```

### 3. 安装PM2进程管理器
```bash
sudo npm install -g pm2
```

## 服务器配置

### 1. 克隆项目
```bash
cd /home/nodeapp
git clone <your-repository-url> livable-cities
cd livable-cities
```

### 2. 安装依赖
```bash
npm install --production
```

### 3. 配置环境变量
```bash
# 创建生产环境配置
cp .env.example .env
nano .env
```

编辑`.env`文件：
```bash
# 生产环境配置
NODE_ENV=production
PORT=3000

# 生成强随机JWT密钥
JWT_SECRET=<使用 node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 生成>
JWT_EXPIRE=7d

# 数据库配置
DB_PATH=/home/nodeapp/livable-cities/database.sqlite

# 修改管理员密码
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<强密码>
ADMIN_EMAIL=admin@yourdomain.com

# CORS配置
CORS_ORIGIN=https://yourdomain.com

# 速率限制
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 4. 初始化数据库
```bash
npm run init-db
```

### 5. 测试运行
```bash
npm start
```

如果一切正常，按`Ctrl+C`停止服务器。

## Nginx配置

### 1. 安装Nginx
```bash
sudo apt-get update
sudo apt-get install nginx
```

### 2. 创建Nginx配置
```bash
sudo nano /etc/nginx/sites-available/livable-cities
```

添加以下配置：
```nginx
# HTTP重定向到HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;

    # 重定向到HTTPS
    return 301 https://$server_name$request_uri;
}

# HTTPS服务器
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL证书配置（稍后配置）
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # SSL配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # 日志
    access_log /var/log/nginx/livable-cities.access.log;
    error_log /var/log/nginx/livable-cities.error.log;

    # Gzip压缩
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss;

    # 静态文件缓存
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # 反向代理到Node.js应用
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # 超时配置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 安全headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' https:; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;" always;

    # 限制文件上传大小
    client_max_body_size 10M;
}
```

### 3. 启用配置
```bash
# 创建符号链接
sudo ln -s /etc/nginx/sites-available/livable-cities /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启Nginx（先配置SSL证书后再重启）
# sudo systemctl restart nginx
```

## SSL证书

### 使用Let's Encrypt免费证书

```bash
# 安装Certbot
sudo apt-get install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# 测试自动续期
sudo certbot renew --dry-run
```

### 重启Nginx
```bash
sudo systemctl restart nginx
sudo systemctl enable nginx
```

## 进程管理

### 使用PM2管理Node.js进程

### 1. 创建PM2配置文件
```bash
nano ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'livable-cities',
    script: './server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    max_memory_restart: '500M',
    autorestart: true,
    watch: false
  }]
};
```

### 2. 启动应用
```bash
# 创建日志目录
mkdir -p logs

# 启动应用
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs

# 设置开机自启
pm2 startup
pm2 save
```

### 3. PM2常用命令
```bash
# 重启应用
pm2 restart livable-cities

# 停止应用
pm2 stop livable-cities

# 删除应用
pm2 delete livable-cities

# 监控
pm2 monit

# 显示详细信息
pm2 show livable-cities
```

## 防火墙配置

```bash
# UFW防火墙
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable
sudo ufw status
```

## 数据库备份

### 创建备份脚本
```bash
nano ~/backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/home/nodeapp/backups"
DB_PATH="/home/nodeapp/livable-cities/database.sqlite"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# 备份数据库
cp $DB_PATH $BACKUP_DIR/database_$DATE.sqlite

# 保留最近30天的备份
find $BACKUP_DIR -name "database_*.sqlite" -mtime +30 -delete

echo "备份完成: database_$DATE.sqlite"
```

### 设置定时任务
```bash
chmod +x ~/backup.sh

# 编辑crontab
crontab -e

# 添加每天凌晨2点执行备份
0 2 * * * /home/nodeapp/backup.sh >> /home/nodeapp/backup.log 2>&1
```

## 监控和维护

### 1. 日志管理
```bash
# 查看Nginx访问日志
sudo tail -f /var/log/nginx/livable-cities.access.log

# 查看Nginx错误日志
sudo tail -f /var/log/nginx/livable-cities.error.log

# 查看应用日志
pm2 logs livable-cities
```

### 2. 性能监控
```bash
# 安装htop
sudo apt-get install htop

# 监控系统资源
htop

# 监控PM2应用
pm2 monit
```

### 3. 更新应用
```bash
cd /home/nodeapp/livable-cities

# 拉取最新代码
git pull

# 安装新依赖（如有）
npm install --production

# 重启应用
pm2 restart livable-cities
```

## 故障排查

### 应用无法启动
```bash
# 检查日志
pm2 logs livable-cities

# 检查端口占用
sudo lsof -i :3000

# 检查环境变量
pm2 env 0
```

### Nginx错误
```bash
# 测试配置
sudo nginx -t

# 查看错误日志
sudo tail -f /var/log/nginx/error.log

# 重启Nginx
sudo systemctl restart nginx
```

### 数据库问题
```bash
# 检查数据库文件权限
ls -la database.sqlite

# 恢复备份
cp ~/backups/database_YYYYMMDD_HHMMSS.sqlite database.sqlite

# 重新初始化（谨慎使用）
npm run init-db
```

## 安全检查清单

- [ ] 修改默认管理员密码
- [ ] 配置强JWT密钥
- [ ] 启用HTTPS
- [ ] 配置防火墙
- [ ] 限制CORS源
- [ ] 定期更新依赖
- [ ] 配置自动备份
- [ ] 监控异常请求
- [ ] 设置日志轮转
- [ ] 限制SSH访问

## 性能优化建议

1. **启用CDN**
   - 使用CDN加速静态资源

2. **Redis缓存**
   - 缓存频繁访问的数据

3. **数据库优化**
   - 添加索引
   - 优化查询

4. **负载均衡**
   - 多实例部署
   - Nginx负载均衡

5. **图片优化**
   - WebP格式
   - 懒加载

## 扩展阅读

- [PM2文档](https://pm2.keymetrics.io/docs/)
- [Nginx文档](https://nginx.org/en/docs/)
- [Let's Encrypt文档](https://letsencrypt.org/docs/)
- [Node.js最佳实践](https://github.com/goldbergyoni/nodebestpractices)

## 支持

如遇到部署问题，请查看项目Issue或提交新Issue。
