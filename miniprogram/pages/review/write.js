// miniprogram/pages/review/write.js
const app = getApp();

Page({
  data: {
    cityId: null,
    cityName: '',

    // 总体评分
    rating: 0,

    // 六维评分
    dimensions: [
      { key: 'living_cost_rating', name: '生活成本', value: 0 },
      { key: 'air_quality_rating', name: '空气质量', value: 0 },
      { key: 'medical_rating', name: '医疗设施', value: 0 },
      { key: 'employment_rating', name: '就业机会', value: 0 },
      { key: 'safety_rating', name: '安全指数', value: 0 },
      { key: 'elderly_care_rating', name: '养老设施', value: 0 }
    ],

    // 居住时长
    durationOptions: ['不到1年', '1-2年', '2-5年', '5-10年', '10年以上'],
    durationIndex: 0,

    // 居住目的
    purposeOptions: ['工作', '求学', '旅居', '养老', '其他'],
    purposeIndex: 0,

    // 文字评价
    comment: '',

    // 图片
    images: [],

    // 匿名
    isAnonymous: false,

    // 提交状态
    submitting: false
  },

  onLoad(options) {
    if (options.cityId) {
      this.setData({
        cityId: options.cityId,
        cityName: options.cityName || ''
      });
    } else {
      wx.showToast({
        title: '缺少城市信息',
        icon: 'error'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  // 总体评分变化
  onRatingChange(e) {
    const rating = parseInt(e.currentTarget.dataset.rating);
    this.setData({ rating });
  },

  // 维度评分变化
  onDimensionChange(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;
    const dimensions = this.data.dimensions.map(dim => {
      if (dim.key === key) {
        return { ...dim, value: parseFloat(value) };
      }
      return dim;
    });
    this.setData({ dimensions });
  },

  // 居住时长选择
  onDurationChange(e) {
    this.setData({
      durationIndex: parseInt(e.detail.value)
    });
  },

  // 居住目的选择
  onPurposeChange(e) {
    this.setData({
      purposeIndex: parseInt(e.detail.value)
    });
  },

  // 评价内容输入
  onCommentInput(e) {
    this.setData({
      comment: e.detail.value
    });
  },

  // 选择图片（兼容新旧版本微信）
  onChooseImage() {
    const remainingCount = 9 - this.data.images.length;

    // 优先使用新 API wx.chooseMedia（微信基础库 2.10.0+）
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: remainingCount,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success: (res) => {
          const tempFilePaths = res.tempFiles.map(file => file.tempFilePath);
          wx.showLoading({ title: '上传中...' });
          this.uploadImages(tempFilePaths);
        },
        fail: (err) => {
          console.error('选择图片失败:', err);
          if (err.errMsg && !err.errMsg.includes('cancel')) {
            wx.showToast({ title: '选择图片失败', icon: 'none' });
          }
        }
      });
    } else {
      // 降级使用旧 API wx.chooseImage
      wx.chooseImage({
        count: remainingCount,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const tempFilePaths = res.tempFilePaths;
          wx.showLoading({ title: '上传中...' });
          this.uploadImages(tempFilePaths);
        },
        fail: (err) => {
          console.error('选择图片失败:', err);
          if (err.errMsg && !err.errMsg.includes('cancel')) {
            wx.showToast({ title: '选择图片失败', icon: 'none' });
          }
        }
      });
    }
  },

  // 上传图片到服务器
  async uploadImages(filePaths) {
    const uploadedUrls = [];

    try {
      for (const filePath of filePaths) {
        const res = await this.uploadSingleImage(filePath);
        if (res.success && res.url) {
          uploadedUrls.push(res.url);
        }
      }

      this.setData({
        images: [...this.data.images, ...uploadedUrls]
      });

      wx.hideLoading();
      wx.showToast({
        title: `已上传${uploadedUrls.length}张`,
        icon: 'success'
      });

    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: '上传失败',
        icon: 'error'
      });
      console.error('上传图片失败:', error);
    }
  },

  // 上传单张图片
  uploadSingleImage(filePath) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${app.globalData.apiBaseUrl}/upload/upload`,
        filePath: filePath,
        name: 'image',
        success: (res) => {
          try {
            const data = JSON.parse(res.data);
            resolve(data);
          } catch (e) {
            reject(e);
          }
        },
        fail: reject
      });
    });
  },

  // 删除图片
  onDeleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images.filter((_, i) => i !== index);
    this.setData({ images });
  },

  // 匿名开关
  onAnonymousChange(e) {
    this.setData({
      isAnonymous: e.detail.value
    });
  },

  // 提交评价
  async onSubmit() {
    // 验证必填项
    if (this.data.rating === 0) {
      wx.showToast({
        title: '请选择总体评分',
        icon: 'none'
      });
      return;
    }

    // 准备数据
    const reviewData = {
      city_id: this.data.cityId,
      rating: this.data.rating,
      comment: this.data.comment,
      living_duration: this.data.durationOptions[this.data.durationIndex],
      living_purpose: this.data.purposeOptions[this.data.purposeIndex],
      is_anonymous: this.data.isAnonymous,
      images: this.data.images
    };

    // 添加六维评分（只添加非零的）
    this.data.dimensions.forEach(dim => {
      if (dim.value > 0) {
        reviewData[dim.key] = dim.value;
      }
    });

    console.log('提交评价数据:', reviewData);

    this.setData({ submitting: true });

    try {
      const res = await this.submitReview(reviewData);

      wx.showToast({
        title: '发布成功',
        icon: 'success'
      });

      // 延迟返回
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);

    } catch (error) {
      wx.showToast({
        title: error.message || '发布失败',
        icon: 'error'
      });
      console.error('提交评价失败:', error);
    } finally {
      this.setData({ submitting: false });
    }
  },

  // 提交评价到服务器
  submitReview(data) {
    return new Promise((resolve, reject) => {
      const token = wx.getStorageSync('token');
      if (!token) {
        reject(new Error('请先登录'));
        return;
      }

      wx.request({
        url: `${app.globalData.apiBaseUrl}/reviews`,
        method: 'POST',
        data: data,
        header: {
          'content-type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        success: (res) => {
          if (res.statusCode === 201 && res.data.success) {
            resolve(res.data);
          } else {
            reject(new Error(res.data.message || '提交失败'));
          }
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },

  // 预览图片
  onPreviewImage(e) {
    const index = e.currentTarget.dataset.index;
    wx.previewImage({
      current: this.data.images[index],
      urls: this.data.images
    });
  }
});
