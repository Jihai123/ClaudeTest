// pages/city-detail/city-detail.js
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    cityId: null,
    city: {},
    dimensions: [],
    reviews: [],
    loading: true,
    userInfo: null,
    showReviewModal: false,
    reviewRating: 5,
    reviewComment: '',
    reviewImages: [],    // 评价图片列表
    submitting: false,   // 提交状态
    cityImages: [],      // 城市印象图片列表
    cityImageUrls: []    // 城市图片URL数组（用于预览）
  },

  onLoad(options) {
    this.setData({
      cityId: options.id,
      userInfo: app.globalData.userInfo
    })
    this.loadCityDetail()
  },

  // 加载城市详情
  async loadCityDetail() {
    this.setData({ loading: true })

    try {
      const city = await api.getCity(this.data.cityId)

      // 处理数据
      const processedCity = {
        ...city,
        population_text: city.population ? util.formatNumber(city.population) : '未知',
        gdp_text: city.gdp ? `${util.formatNumber(city.gdp)}亿元` : '未知',
        area_text: city.area ? `${util.formatNumber(city.area)} km²` : '未知',
        stars: city.review_stats?.avg_rating ? util.createStars(city.review_stats.avg_rating) : ''
      }

      // 维度数据
      const dimensions = [
        {
          key: 'living_cost',
          label: '生活成本',
          value: city.living_cost || 0,
          color: util.getDimensionColor(city.living_cost || 0)
        },
        {
          key: 'air_quality',
          label: '空气质量',
          value: city.air_quality || 0,
          color: util.getDimensionColor(city.air_quality || 0)
        },
        {
          key: 'medical_facilities',
          label: '医疗设施',
          value: city.medical_facilities || 0,
          color: util.getDimensionColor(city.medical_facilities || 0)
        },
        {
          key: 'employment',
          label: '就业机会',
          value: city.employment || 0,
          color: util.getDimensionColor(city.employment || 0)
        },
        {
          key: 'safety',
          label: '安全指数',
          value: city.safety || 0,
          color: util.getDimensionColor(city.safety || 0)
        },
        {
          key: 'elderly_care',
          label: '适合养老',
          value: city.elderly_care || 0,
          color: util.getDimensionColor(city.elderly_care || 0)
        }
      ].map(item => ({
        ...item,
        barStyle: `width: ${item.value * 10}%; background-color: ${item.color}`
      }))

      // 处理城市印象图片
      const cityImages = city.images || []
      const cityImageUrls = cityImages.map(img => img.image_url)

      this.setData({
        city: processedCity,
        dimensions,
        cityImages,
        cityImageUrls,
        loading: false
      })

      // 加载评价
      this.loadReviews()
    } catch (error) {
      console.error('加载城市详情失败:', error)
      util.showToast('加载失败，请重试')
      this.setData({ loading: false })
    }
  },

  // 加载评价列表
  async loadReviews() {
    try {
      const result = await api.getCityReviews(this.data.cityId, { limit: 10 })

      const reviews = (result.reviews || []).map(review => ({
        ...review,
        stars: util.createStars(review.rating),
        created_at_text: util.formatDate(review.created_at)
      }))

      this.setData({ reviews })
    } catch (error) {
      console.error('加载评价失败:', error)
    }
  },

  // 查看全部评价
  onViewAllReviews() {
    wx.navigateTo({
      url: `/pages/review/list?cityId=${this.data.cityId}&cityName=${this.data.city.name}`
    })
  },

  // 写评价
  onWriteReview() {
    if (!this.data.userInfo) {
      util.showToast('请先登录')
      return
    }

    this.setData({
      showReviewModal: true,
      reviewRating: 5,
      reviewComment: '',
      reviewImages: [],
      submitting: false
    })
  },

  // 选择图片（兼容新旧版本微信）
  onChooseImage() {
    const remainingCount = 9 - this.data.reviewImages.length

    // 优先使用新 API wx.chooseMedia（微信基础库 2.10.0+）
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: remainingCount,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success: (res) => {
          wx.showLoading({ title: '上传中...' })
          const tempFilePaths = res.tempFiles.map(file => file.tempFilePath)
          this.uploadImages(tempFilePaths)
        },
        fail: (err) => {
          console.error('选择图片失败:', err)
          if (err.errMsg && err.errMsg.includes('cancel')) {
            // 用户取消选择，不提示
          } else {
            util.showToast('选择图片失败')
          }
        }
      })
    } else {
      // 降级使用旧 API wx.chooseImage
      wx.chooseImage({
        count: remainingCount,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          wx.showLoading({ title: '上传中...' })
          this.uploadImages(res.tempFilePaths)
        },
        fail: (err) => {
          console.error('选择图片失败:', err)
          if (err.errMsg && err.errMsg.includes('cancel')) {
            // 用户取消选择，不提示
          } else {
            util.showToast('选择图片失败')
          }
        }
      })
    }
  },

  // 上传图片到服务器
  async uploadImages(filePaths) {
    const uploadedUrls = []

    try {
      for (const filePath of filePaths) {
        const res = await this.uploadSingleImage(filePath)
        if (res.success && res.url) {
          uploadedUrls.push(res.url)
        }
      }

      this.setData({
        reviewImages: [...this.data.reviewImages, ...uploadedUrls]
      })

      wx.hideLoading()
      if (uploadedUrls.length > 0) {
        util.showToast(`已上传${uploadedUrls.length}张`, 'success')
      }

    } catch (error) {
      wx.hideLoading()
      util.showToast('上传失败')
      console.error('上传图片失败:', error)
    }
  },

  // 上传单张图片
  uploadSingleImage(filePath) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${app.globalData.apiBaseUrl}/upload`,
        filePath: filePath,
        name: 'image',
        success: (res) => {
          try {
            const data = JSON.parse(res.data)
            resolve(data)
          } catch (e) {
            // 如果上传接口不存在，使用本地临时路径
            resolve({ success: true, url: filePath })
          }
        },
        fail: (err) => {
          // 上传失败时使用本地临时路径（用于演示）
          resolve({ success: true, url: filePath })
        }
      })
    })
  },

  // 预览图片
  onPreviewImage(e) {
    const index = e.currentTarget.dataset.index
    wx.previewImage({
      current: this.data.reviewImages[index],
      urls: this.data.reviewImages
    })
  },

  // 删除图片
  onDeleteImage(e) {
    const index = e.currentTarget.dataset.index
    const images = this.data.reviewImages.filter((_, i) => i !== index)
    this.setData({ reviewImages: images })
  },

  // 关闭弹窗
  onCloseModal() {
    this.setData({
      showReviewModal: false
    })
  },

  // 阻止事件冒泡
  stopPropagation() {},

  // 选择评分
  onSelectRating(e) {
    this.setData({
      reviewRating: e.currentTarget.dataset.rating
    })
  },

  // 评论输入
  onCommentInput(e) {
    this.setData({
      reviewComment: e.detail.value
    })
  },

  // 提交评价
  async onSubmitReview() {
    if (!this.data.reviewRating) {
      util.showToast('请选择评分')
      return
    }

    if (this.data.submitting) {
      return
    }

    this.setData({ submitting: true })

    try {
      util.showLoading('提交中...')

      await api.createReview(
        this.data.cityId,
        this.data.reviewRating,
        this.data.reviewComment,
        this.data.reviewImages
      )

      util.hideLoading()
      util.showToast('评价成功', 'success')

      this.setData({
        showReviewModal: false,
        submitting: false
      })

      // 重新加载数据
      this.loadCityDetail()
    } catch (error) {
      util.hideLoading()
      this.setData({ submitting: false })
      util.showToast(error.message || '评价失败')
    }
  },

  // 点赞评价
  async onLikeReview(e) {
    if (!this.data.userInfo) {
      util.showToast('请先登录')
      return
    }

    const reviewId = e.currentTarget.dataset.id

    try {
      await api.likeReview(reviewId)
      util.showToast('操作成功', 'success')
      this.loadReviews()
    } catch (error) {
      util.showToast(error.message || '操作失败')
    }
  },

  // 预览评价列表中的图片
  onPreviewReviewImage(e) {
    const urls = e.currentTarget.dataset.urls
    const current = e.currentTarget.dataset.current
    wx.previewImage({
      current: current,
      urls: urls
    })
  },

  // 预览城市印象图片
  onPreviewCityImage(e) {
    const url = e.currentTarget.dataset.url
    const urls = this.data.cityImageUrls
    wx.previewImage({
      current: url,
      urls: urls
    })
  },

  // 上传城市印象图片
  onUploadCityImage() {
    // 检查用户是否已登录
    const app = getApp()
    if (!app.globalData.token) {
      wx.showModal({
        title: '提示',
        content: '上传图片需要先登录，是否前往登录？',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/login/login'
            })
          }
        }
      })
      return
    }

    // 使用新 API wx.chooseMedia
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 9,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success: (res) => {
          wx.showLoading({ title: '上传中...' })
          const tempFilePaths = res.tempFiles.map(file => file.tempFilePath)
          this.uploadCityImages(tempFilePaths)
        },
        fail: (err) => {
          console.error('选择图片失败:', err)
          if (err.errMsg && !err.errMsg.includes('cancel')) {
            util.showToast('选择图片失败')
          }
        }
      })
    } else {
      // 降级使用旧 API
      wx.chooseImage({
        count: 9,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          wx.showLoading({ title: '上传中...' })
          this.uploadCityImages(res.tempFilePaths)
        },
        fail: (err) => {
          console.error('选择图片失败:', err)
          if (err.errMsg && !err.errMsg.includes('cancel')) {
            util.showToast('选择图片失败')
          }
        }
      })
    }
  },

  // 上传城市图片到服务器
  async uploadCityImages(filePaths) {
    let successCount = 0

    try {
      for (const filePath of filePaths) {
        // 上传图片文件
        const uploadRes = await this.uploadSingleImage(filePath)

        if (uploadRes.success && uploadRes.url) {
          // 将图片关联到城市
          try {
            await api.uploadCityImage(this.data.cityId, uploadRes.url)
            successCount++
          } catch (err) {
            console.error('关联城市图片失败:', err)
          }
        }
      }

      wx.hideLoading()

      if (successCount > 0) {
        util.showToast(`成功上传${successCount}张图片`, 'success')
        // 重新加载城市数据以刷新图片列表
        this.loadCityDetail()
      } else {
        util.showToast('上传失败，请重试')
      }
    } catch (error) {
      wx.hideLoading()
      util.showToast('上传失败')
      console.error('上传城市图片失败:', error)
    }
  },

  // 分享
  onShareAppMessage() {
    return {
      title: `推荐${this.data.city.name}，综合评分${this.data.city.overall_score}`,
      path: `/pages/city-detail/city-detail?id=${this.data.cityId}`
    }
  }
})
