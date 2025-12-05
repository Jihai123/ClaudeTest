const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

// 配置Multer存储
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB限制
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('只支持图片文件 (JPEG, PNG, GIF, WebP)'));
    }
  }
});

// 上传图片
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const uploadMethod = process.env.IMAGE_UPLOAD_METHOD || 'local';

    let imageUrl;

    switch (uploadMethod) {
      case 'local':
        imageUrl = await uploadToLocal(req.file);
        break;
      case 'imgbb':
        imageUrl = await uploadToImgBB(req.file);
        break;
      case 'r2':
        imageUrl = await uploadToCloudflareR2(req.file);
        break;
      case 'oss':
        imageUrl = await uploadToAliOSS(req.file);
        break;
      default:
        imageUrl = await uploadToLocal(req.file);
    }

    res.json({
      success: true,
      url: imageUrl,
      filename: req.file.originalname,
      size: req.file.size
    });

  } catch (error) {
    console.error('图片上传失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '图片上传失败'
    });
  }
});

// 本地存储
async function uploadToLocal(file) {
  const uploadsDir = path.join(__dirname, '../../public/uploads');

  // 确保目录存在
  try {
    await fs.access(uploadsDir);
  } catch {
    await fs.mkdir(uploadsDir, { recursive: true });
  }

  // 生成唯一文件名
  const fileExt = path.extname(file.originalname);
  const fileName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${fileExt}`;
  const filePath = path.join(uploadsDir, fileName);

  // 保存文件
  await fs.writeFile(filePath, file.buffer);

  // 返回访问URL
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const basePath = process.env.BASE_PATH || '';
  return `${baseUrl}${basePath}/uploads/${fileName}`;
}

// ImgBB免费图床 (需要API key: https://api.imgbb.com/)
async function uploadToImgBB(file) {
  const apiKey = process.env.IMGBB_API_KEY;

  if (!apiKey) {
    throw new Error('ImgBB API key未配置，请在.env中设置IMGBB_API_KEY');
  }

  const fetch = require('node-fetch');
  const FormData = require('form-data');

  const formData = new FormData();
  formData.append('image', file.buffer.toString('base64'));

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
    method: 'POST',
    body: formData
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'ImgBB上传失败');
  }

  return data.data.url;
}

// Cloudflare R2 (需要配置S3兼容凭证)
async function uploadToCloudflareR2(file) {
  const AWS = require('aws-sdk');

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error('Cloudflare R2配置不完整');
  }

  const s3 = new AWS.S3({
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey,
    signatureVersion: 'v4',
  });

  const fileExt = path.extname(file.originalname);
  const fileName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${fileExt}`;

  const uploadParams = {
    Bucket: bucketName,
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  const result = await s3.upload(uploadParams).promise();

  // 使用自定义域名或R2公共URL
  const publicDomain = process.env.R2_PUBLIC_DOMAIN;
  if (publicDomain) {
    // 移除可能存在的协议前缀，避免 https://https:// 的问题
    const cleanDomain = publicDomain.replace(/^https?:\/\//, '');
    return `https://${cleanDomain}/${fileName}`;
  }

  return result.Location;
}

// 阿里云OSS
async function uploadToAliOSS(file) {
  const OSS = require('ali-oss');

  const client = new OSS({
    region: process.env.OSS_REGION || 'oss-cn-hangzhou',
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET
  });

  if (!process.env.OSS_ACCESS_KEY_ID || !process.env.OSS_ACCESS_KEY_SECRET || !process.env.OSS_BUCKET) {
    throw new Error('阿里云OSS配置不完整');
  }

  const fileExt = path.extname(file.originalname);
  const fileName = `uploads/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${fileExt}`;

  const result = await client.put(fileName, file.buffer);

  return result.url;
}

module.exports = router;
