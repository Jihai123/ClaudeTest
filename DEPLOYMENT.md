# 生产环境部署指南

## 问题诊断

如果你看到 404 错误：`GET https://www.chatgpt5x.com/api/cities 404 (Not Found)`

这通常是因为：
1. Nginx配置问题
2. API路径配置问题  
3. 服务器未正确启动

## 解决方案

### 方案1：Nginx配置（推荐）

如果你使用Nginx作为反向代理，需要正确配置：

```nginx
server {
    listen 80;
    server_name www.chatgpt5x.com;

    # 静态文件
    location / {
        root /path/to/ClaudeTest/public;
        try_files $uri $uri/ /index.html;
    }

    # API代理
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 方案2：测试API是否正常

```bash
# 测试本地
curl http://localhost:3000/api/cities?limit=1

# 测试生产环境
curl https://www.chatgpt5x.com/api/cities?limit=1
```

## 快速修复

1. 确保Node.js服务器运行在3000端口
2. 重启Nginx：`sudo systemctl restart nginx`
3. 查看日志：`pm2 logs` 或 `tail -f /var/log/nginx/error.log`
