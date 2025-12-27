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
    reviewComment: ''
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

      this.setData({
        city: processedCity,
        dimensions,
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

  // 写评价
  onWriteReview() {
    if (!this.data.userInfo) {
      util.showToast('请先登录')
      return
    }

    this.setData({
      showReviewModal: true,
      reviewRating: 5,
      reviewComment: ''
    })
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

    try {
      util.showLoading('提交中...')

      await api.createReview(
        this.data.cityId,
        this.data.reviewRating,
        this.data.reviewComment
      )

      util.hideLoading()
      util.showToast('评价成功', 'success')

      this.setData({
        showReviewModal: false
      })

      // 重新加载数据
      this.loadCityDetail()
    } catch (error) {
      util.hideLoading()
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

  // 分享
  onShareAppMessage() {
    return {
      title: `推荐${this.data.city.name}，综合评分${this.data.city.overall_score}`,
      path: `/pages/city-detail/city-detail?id=${this.data.cityId}`
    }
  }
})
