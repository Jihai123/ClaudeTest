// pages/my-reviews/my-reviews.js
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    userInfo: null,
    reviews: [],
    loading: false,
    showLoginModal: false,
    showRegisterModal: false,
    loginUsername: '',
    loginPassword: '',
    registerUsername: '',
    registerEmail: '',
    registerPassword: '',
    registerPasswordConfirm: ''
  },

  onLoad() {
    this.setData({
      userInfo: app.globalData.userInfo
    })

    if (this.data.userInfo) {
      this.loadReviews()
    }
  },

  onShow() {
    // 刷新用户信息
    this.setData({
      userInfo: app.globalData.userInfo
    })

    if (this.data.userInfo && this.data.reviews.length > 0) {
      this.loadReviews()
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    if (this.data.userInfo) {
      this.loadReviews().then(() => {
        wx.stopPullDownRefresh()
      })
    } else {
      wx.stopPullDownRefresh()
    }
  },

  // 加载我的评价
  async loadReviews() {
    this.setData({ loading: true })

    try {
      const result = await api.getMyReviews()

      const reviews = (result.reviews || []).map(review => ({
        ...review,
        stars: util.createStars(review.rating),
        created_at_text: util.formatDate(review.created_at)
      }))

      this.setData({
        reviews,
        loading: false
      })
    } catch (error) {
      console.error('加载评价失败:', error)
      util.showToast('加载失败，请重试')
      this.setData({ loading: false })
    }
  },

  // 点击城市
  onCityTap(e) {
    const cityId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/city-detail/city-detail?id=${cityId}`
    })
  },

  // 删除评价
  async onDeleteReview(e) {
    const reviewId = e.currentTarget.dataset.id

    const confirmed = await util.showConfirm('确定要删除这条评价吗？')
    if (!confirmed) return

    try {
      util.showLoading('删除中...')
      await api.deleteReview(reviewId)
      util.hideLoading()
      util.showToast('删除成功', 'success')
      this.loadReviews()
    } catch (error) {
      util.hideLoading()
      util.showToast(error.message || '删除失败')
    }
  },

  // 显示登录弹窗
  onLogin() {
    this.setData({
      showLoginModal: true,
      loginUsername: '',
      loginPassword: ''
    })
  },

  // 显示注册弹窗
  onShowRegister() {
    this.setData({
      showLoginModal: false,
      showRegisterModal: true,
      registerUsername: '',
      registerEmail: '',
      registerPassword: '',
      registerPasswordConfirm: ''
    })
  },

  // 显示登录弹窗（从注册页）
  onShowLogin() {
    this.setData({
      showRegisterModal: false,
      showLoginModal: true
    })
  },

  // 关闭弹窗
  onCloseModal() {
    this.setData({
      showLoginModal: false,
      showRegisterModal: false
    })
  },

  // 阻止事件冒泡
  stopPropagation() {},

  // 登录表单输入
  onUsernameInput(e) {
    this.setData({ loginUsername: e.detail.value })
  },

  onPasswordInput(e) {
    this.setData({ loginPassword: e.detail.value })
  },

  // 注册表单输入
  onRegUsernameInput(e) {
    this.setData({ registerUsername: e.detail.value })
  },

  onRegEmailInput(e) {
    this.setData({ registerEmail: e.detail.value })
  },

  onRegPasswordInput(e) {
    this.setData({ registerPassword: e.detail.value })
  },

  onRegPasswordConfirmInput(e) {
    this.setData({ registerPasswordConfirm: e.detail.value })
  },

  // 提交登录
  async onSubmitLogin() {
    const { loginUsername, loginPassword } = this.data

    if (!loginUsername || !loginPassword) {
      util.showToast('请填写完整信息')
      return
    }

    try {
      util.showLoading('登录中...')

      const result = await api.login(loginUsername, loginPassword)

      if (result.token && result.user) {
        app.setUserInfo(result.user, result.token)

        this.setData({
          userInfo: result.user,
          showLoginModal: false
        })

        util.hideLoading()
        util.showToast('登录成功', 'success')

        // 加载评价
        this.loadReviews()
      } else {
        util.hideLoading()
        util.showToast('登录失败')
      }
    } catch (error) {
      util.hideLoading()
      util.showToast(error.message || '登录失败')
    }
  },

  // 提交注册
  async onSubmitRegister() {
    const {
      registerUsername,
      registerEmail,
      registerPassword,
      registerPasswordConfirm
    } = this.data

    if (!registerUsername || !registerEmail || !registerPassword) {
      util.showToast('请填写完整信息')
      return
    }

    if (registerPassword !== registerPasswordConfirm) {
      util.showToast('两次密码输入不一致')
      return
    }

    try {
      util.showLoading('注册中...')

      const result = await api.register(registerUsername, registerEmail, registerPassword)

      if (result.token && result.user) {
        app.setUserInfo(result.user, result.token)

        this.setData({
          userInfo: result.user,
          showRegisterModal: false
        })

        util.hideLoading()
        util.showToast('注册成功', 'success')

        // 加载评价
        this.loadReviews()
      } else {
        util.hideLoading()
        util.showToast('注册失败')
      }
    } catch (error) {
      util.hideLoading()
      util.showToast(error.message || '注册失败')
    }
  },

  // 退出登录
  async onLogout() {
    const confirmed = await util.showConfirm('确定要退出登录吗？')
    if (!confirmed) return

    app.clearUserInfo()

    this.setData({
      userInfo: null,
      reviews: []
    })

    util.showToast('已退出', 'success')
  },

  // 去首页
  onGoHome() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  }
})
