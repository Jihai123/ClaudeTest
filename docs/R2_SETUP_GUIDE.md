# Cloudflare R2 公开访问配置指南

## 问题说明

上传图片后访问出现错误：
```xml
<Error>
<Code>InvalidArgument</Code>
<Message>Authorization</Message>
</Error>
```

**原因**：R2 bucket 默认是私有的，需要配置公开访问或绑定自定义域名。

---

## 解决方案（推荐方案1）

### 方案1：配置自定义域名（推荐）⭐

这是最佳方案，提供更好的性能和SEO。

#### 步骤：

1. **登录 Cloudflare Dashboard**
   - 访问：https://dash.cloudflare.com/

2. **进入 R2 配置**
   - 左侧菜单选择 **R2**
   - 点击您的 bucket 名称

3. **绑定自定义域名**
   - 点击 **Settings** 标签
   - 找到 **Public Access** 区域
   - 点击 **Connect Domain**
   - 选择您的域名（如 `img.zhibeimao.com` 或 `cdn.zhibeimao.com`）
   - 点击 **Connect Domain**

4. **等待DNS生效**
   - Cloudflare会自动配置DNS
   - 通常1-5分钟生效

5. **更新环境变量**
   ```bash
   # 编辑 .env 文件
   nano /www/wwwroot/yijucity/ClaudeTest/.env

   # 修改或添加以下配置（不要加 https://）
   R2_PUBLIC_DOMAIN=img.zhibeimao.com
   ```

6. **重启服务**
   ```bash
   pm2 restart yijucit
   ```

7. **测试**
   上传一张图片，URL应该是：
   ```
   https://img.zhibeimao.com/xxxx.png
   ```

---

### 方案2：使用 R2.dev 公开子域名

如果没有自定义域名，可以使用 Cloudflare 提供的免费 R2.dev 域名。

#### 步骤：

1. **在 R2 Dashboard 中**
   - 点击您的 bucket
   - 进入 **Settings** 标签
   - 找到 **Public Access** 区域
   - 点击 **Allow Access** （启用公开访问）

2. **复制 R2.dev URL**
   - 会显示类似：`https://pub-xxxxx.r2.dev`
   - 这就是您的公开访问域名

3. **更新环境变量**
   ```bash
   # 编辑 .env 文件
   nano /www/wwwroot/yijucity/ClaudeTest/.env

   # 修改配置（不要加 https://）
   R2_PUBLIC_DOMAIN=pub-xxxxx.r2.dev
   ```

4. **重启服务**
   ```bash
   pm2 restart yijucit
   ```

---

### 方案3：暂时使用本地存储（临时方案）

如果R2配置复杂，可以暂时切换到本地存储：

```bash
# 编辑 .env 文件
nano /www/wwwroot/yijucity/ClaudeTest/.env

# 修改上传方式
IMAGE_UPLOAD_METHOD=local

# 重启服务
pm2 restart yijucit
```

**注意**：本地存储会占用服务器硬盘空间，不推荐长期使用。

---

## 验证配置

配置完成后，执行以下测试：

```bash
# 1. 检查环境变量
cd /www/wwwroot/yijucity/ClaudeTest
cat .env | grep R2

# 2. 测试上传
# 访问：https://zhibeimao.com/yiju/upload-images.html
# 上传一张测试图片

# 3. 查看返回的URL
# 应该是可直接访问的公开URL

# 4. 测试访问
curl -I https://你的R2域名/图片文件名.png
# 应该返回 200 OK
```

---

## 常见问题

### Q1: 自定义域名配置后还是无法访问？
A: 检查DNS是否生效：
```bash
dig img.zhibeimao.com
# 应该显示 CNAME 记录指向 R2
```

### Q2: R2.dev 域名找不到？
A: 确保在 R2 bucket 设置中启用了 "Allow Access"，启用后会自动生成。

### Q3: 已有图片无法访问怎么办？
A: 旧图片URL无法更改，需要：
1. 在数据库中找到所有图片记录
2. 更新 `image_url` 字段，替换域名部分

或者运行修复脚本（我可以为您创建）。

---

## 推荐配置

**生产环境推荐使用方案1（自定义域名）**：
- ✅ 更专业的URL
- ✅ 更好的SEO
- ✅ 可以使用 Cloudflare CDN 加速
- ✅ 可以配置缓存策略

**环境变量示例**：
```bash
IMAGE_UPLOAD_METHOD=r2
R2_ACCOUNT_ID=你的账号ID
R2_ACCESS_KEY_ID=你的AccessKey
R2_SECRET_ACCESS_KEY=你的SecretKey
R2_BUCKET_NAME=你的bucket名称
R2_PUBLIC_DOMAIN=img.zhibeimao.com  # 注意：不要加 https://
```

---

## 需要帮助？

如果配置过程中遇到问题，请提供：
1. 当前 `.env` 文件中的 R2 配置（隐藏敏感信息）
2. 上传图片后返回的 URL
3. 访问该 URL 时的错误信息

我会帮您诊断并解决！
