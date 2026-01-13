/**
 * R2 存储工具函数
 * 用于管理 Cloudflare R2 中的文件
 */

const AWS = require('aws-sdk');

/**
 * 获取 R2 S3 客户端
 */
function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return new AWS.S3({
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey,
    signatureVersion: 'v4',
  });
}

/**
 * 从图片 URL 提取 R2 key
 * @param {string} imageUrl - 图片完整 URL
 * @returns {string|null} - R2 key 或 null
 */
function extractR2KeyFromUrl(imageUrl) {
  if (!imageUrl) return null;

  // 支持的 R2 域名
  const r2Domains = [
    'cityimg.zhibeimao.com',
    process.env.R2_PUBLIC_DOMAIN?.replace(/^https?:\/\//, '')
  ].filter(Boolean);

  try {
    const url = new URL(imageUrl);

    // 检查是否是 R2 域名
    const isR2Domain = r2Domains.some(domain => url.hostname === domain);
    if (!isR2Domain) {
      return null;
    }

    // 提取路径作为 key（去掉开头的 /）
    return url.pathname.replace(/^\//, '');
  } catch (error) {
    console.error('解析图片 URL 失败:', error.message);
    return null;
  }
}

/**
 * 从 R2 删除单个文件
 * @param {string} imageUrl - 图片完整 URL
 * @returns {Promise<boolean>} - 是否成功
 */
async function deleteFromR2(imageUrl) {
  const s3 = getR2Client();
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!s3 || !bucketName) {
    console.log('R2 未配置，跳过文件删除');
    return false;
  }

  const key = extractR2KeyFromUrl(imageUrl);
  if (!key) {
    console.log('无法从 URL 提取 R2 key，可能不是 R2 文件:', imageUrl);
    return false;
  }

  try {
    await s3.deleteObject({
      Bucket: bucketName,
      Key: key
    }).promise();

    console.log('成功从 R2 删除文件:', key);
    return true;
  } catch (error) {
    console.error('从 R2 删除文件失败:', error.message);
    return false;
  }
}

/**
 * 批量从 R2 删除文件
 * @param {string[]} imageUrls - 图片 URL 数组
 * @returns {Promise<{success: number, failed: number}>}
 */
async function batchDeleteFromR2(imageUrls) {
  const s3 = getR2Client();
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!s3 || !bucketName) {
    console.log('R2 未配置，跳过批量文件删除');
    return { success: 0, failed: imageUrls.length };
  }

  const keys = imageUrls
    .map(url => extractR2KeyFromUrl(url))
    .filter(Boolean);

  if (keys.length === 0) {
    return { success: 0, failed: imageUrls.length };
  }

  try {
    // R2 支持一次删除最多 1000 个对象
    const deleteParams = {
      Bucket: bucketName,
      Delete: {
        Objects: keys.map(key => ({ Key: key })),
        Quiet: false
      }
    };

    const result = await s3.deleteObjects(deleteParams).promise();

    const deleted = result.Deleted?.length || 0;
    const errors = result.Errors?.length || 0;

    console.log(`R2 批量删除: 成功 ${deleted}, 失败 ${errors}`);

    return { success: deleted, failed: errors + (imageUrls.length - keys.length) };
  } catch (error) {
    console.error('R2 批量删除失败:', error.message);
    return { success: 0, failed: imageUrls.length };
  }
}

/**
 * 检查 R2 文件是否存在
 * @param {string} imageUrl - 图片完整 URL
 * @returns {Promise<boolean>}
 */
async function checkR2FileExists(imageUrl) {
  const s3 = getR2Client();
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!s3 || !bucketName) {
    return false;
  }

  const key = extractR2KeyFromUrl(imageUrl);
  if (!key) {
    return false;
  }

  try {
    await s3.headObject({
      Bucket: bucketName,
      Key: key
    }).promise();
    return true;
  } catch (error) {
    if (error.code === 'NotFound') {
      return false;
    }
    throw error;
  }
}

module.exports = {
  getR2Client,
  extractR2KeyFromUrl,
  deleteFromR2,
  batchDeleteFromR2,
  checkR2FileExists
};
