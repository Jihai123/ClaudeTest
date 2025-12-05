# 图片上传功能配置指南

## 概述

系统支持多种图片上传方式，可根据实际需求选择：

1. **本地存储** (默认) - 适合开发测试
2. **ImgBB** - 免费图床API
3. **Cloudflare R2** - 专业云存储
4. **阿里云OSS** - 国内云存储

## 配置方法

### 1. 本地存储 (默认)

无需配置，图片将保存到 `public/uploads/` 目录。

```.env
IMAGE_UPLOAD_METHOD=local
```

**优点:**
- 无需额外配置
- 完全免费
- 适合开发测试

**缺点:**
- 占用服务器存储空间
- 不适合大规模生产环境

---

### 2. ImgBB (免费图床)

**步骤:**

1. 访问 https://api.imgbb.com/ 注册账号
2. 获取API Key
3. 在`.env`中配置:

```.env
IMAGE_UPLOAD_METHOD=imgbb
IMGBB_API_KEY=your_api_key_here
```

**优点:**
- 完全免费
- 无需服务器存储
- 配置简单

**缺点:**
- 每月有上传限制
- 依赖第三方服务

---

### 3. Cloudflare R2

**步骤:**

1. 注册Cloudflare账号
2. 创建R2存储桶
3. 生成API令牌
4. 配置环境变量:

```.env
IMAGE_UPLOAD_METHOD=r2
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_DOMAIN=your.custom.domain.com  # 可选
```

**优点:**
- 每月10GB免费存储
- 无出站流量费
- 高性能

**安装依赖:**
```bash
npm install aws-sdk
```

---

### 4. 阿里云OSS

**步骤:**

1. 注册阿里云账号
2. 开通OSS服务
3. 创建Bucket
4. 获取AccessKey
5. 配置环境变量:

```.env
IMAGE_UPLOAD_METHOD=oss
OSS_REGION=oss-cn-hangzhou
OSS_ACCESS_KEY_ID=your_access_key_id
OSS_ACCESS_KEY_SECRET=your_access_key_secret
OSS_BUCKET=your_bucket_name
```

**优点:**
- 国内速度快
- 稳定可靠
- CDN加速

**安装依赖:**
```bash
npm install ali-oss
```

---

## API使用

### 上传接口

**端点:** `POST /api/upload`

**请求:**
```javascript
const formData = new FormData();
formData.append('image', file);

const response = await fetch('/api/upload', {
  method: 'POST',
  body: formData
});

const data = await response.json();
console.log(data.url); // 图片URL
```

**响应:**
```json
{
  "success": true,
  "url": "https://example.com/uploads/image.jpg",
  "filename": "image.jpg",
  "size": 123456
}
```

**错误响应:**
```json
{
  "success": false,
  "error": "错误信息"
}
```

---

## 文件限制

- **最大文件大小:** 5MB
- **支持格式:** JPEG, PNG, GIF, WebP
- **命名规则:** `时间戳-随机字符串.扩展名`

---

## 安全建议

1. **生产环境:**
   - 使用Cloudflare R2或阿里云OSS
   - 配置CDN加速
   - 启用图片压缩

2. **API安全:**
   - 添加身份验证
   - 限制上传频率
   - 检测恶意文件

3. **存储管理:**
   - 定期清理未使用图片
   - 实施备份策略
   - 监控存储用量

---

## 故障排除

### 问题: 上传失败

**检查清单:**
1. ✅ 环境变量配置正确
2. ✅ 依赖包已安装
3. ✅ API凭证有效
4. ✅ 网络连接正常
5. ✅ 文件大小未超限

### 问题: 图片无法访问

**解决方案:**
1. 检查文件权限
2. 验证URL配置
3. 确认CDN设置
4. 检查CORS配置

---

## 升级建议

**从本地存储迁移到云存储:**

1. 选择云存储服务
2. 配置环境变量
3. 安装依赖包
4. 重启服务
5. 迁移现有图片(可选)

**迁移脚本示例:**
```bash
# 将本地图片上传到云存储
npm run migrate-images
```

---

## 成本估算

| 服务 | 免费额度 | 超出费用 |
|------|----------|----------|
| 本地存储 | ∞ | 服务器成本 |
| ImgBB | 限制请求 | 免费 |
| Cloudflare R2 | 10GB/月 | $0.015/GB |
| 阿里云OSS | 按需 | ¥0.12/GB/月 |

---

## 联系支持

如需帮助，请查阅:
- 📖 [项目文档](../README.md)
- 🐛 [问题反馈](https://github.com/your-repo/issues)
- 💬 [社区讨论](https://github.com/your-repo/discussions)
