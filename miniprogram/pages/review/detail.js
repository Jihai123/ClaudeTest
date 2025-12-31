// pages/review/detail.js
const app = getApp()
const util = require('../../utils/util')

Page({
  data: {
    reviewId: null,
    review: null,
    loading: true,
    isHelpful: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ reviewId: options.id })
      this.loadReviewDetail()
    } else {
      util.showToast('缺少评价ID')
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  // 加载评价详情
  async loadReviewDetail() {
    this.setData({ loading: true })

    try {
      const res = await wx.request({
        url: `${app.globalData.apiBaseUrl}/reviews/${this.data.reviewId}`,
        method: 'GET'
      })

      if (res.data.success) {
        const review = res.data.data

        // 解析图片JSON
        if (review.images && typeof review.images === 'string') {
          try {
            review.images = JSON.parse(review.images)
          } catch (e) {
            review.images = []
          }
        }

        // 格式化时间
        if (review.created_at) {
          review.created_at = util.formatTime(new Date(review.created_at))
        }

        this.setData({
          review: review,
          loading: false
        })

        // 检查当前用户是否标记过有用
        this.checkHelpfulStatus()
      } else {
        throw new Error(res.data.message || '加载失败')
      }
    } catch (error) {
      console.error('加载评价详情失败:', error)
      util.showToast(error.message || '加载失败')
      this.setData({ loading: false })
    }
  },

  // 检查有用状态
  async checkHelpfulStatus() {
    const token = wx.getStorageSync('token')
    if (!token) return

    try {
      const res = await wx.request({
        url: `${app.globalData.apiBaseUrl}/reviews/${this.data.reviewId}/helpful/status`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (res.data.success && res.data.data) {
        this.setData({
          isHelpful: res.data.data.is_helpful
        })
      }
    } catch (error) {
      console.error('检查有用状态失败:', error)
    }
  },

  // 预览图片
  onPreviewImage(e) {
    const index = e.currentTarget.dataset.index
    const images = this.data.review.images

    wx.previewImage({
      current: images[index],
      urls: images
    })
  },

  // 标记有用/没用
  async onToggleHelpful() {
    const token = wx.getStorageSync('token')
    if (!token) {
      util.showToast('请先登录')
      setTimeout(() => {
        wx.navigateTo({
          url: '/pages/login/login'
        })
      }, 1500)
      return
    }

    const newHelpfulState = !this.data.isHelpful

    try {
      const res = await wx.request({
        url: `${app.globalData.apiBaseUrl}/reviews/${this.data.reviewId}/helpful`,
        method: 'POST',
        header: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: {
          is_helpful: newHelpfulState
        }
      })

      if (res.data.success) {
        // 更新本地状态
        const review = this.data.review
        const delta = newHelpfulState ? 1 : -1
        review.helpful_count = (review.helpful_count || 0) + delta

        this.setData({
          isHelpful: newHelpfulState,
          review: review
        })

        util.showToast(newHelpfulState ? '标记成功' : '取消标记', 'success')
      } else {
        throw new Error(res.data.message || '操作失败')
      }
    } catch (error) {
      console.error('标记有用失败:', error)
      util.showToast(error.message || '操作失败')
    }
  },

  // 分享
  onShareAppMessage() {
    return {
      title: `${this.data.review.username || '用户'}的城市评价`,
      path: `/pages/review/detail?id=${this.data.reviewId}`
    }
  }
})
