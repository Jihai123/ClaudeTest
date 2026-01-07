// pages/login/login.js
const app = getApp()
const api = require('../../utils/api')

Page({
  data: {
    loading: false,
    canUseGetUserProfile: false,
    // 登录方式: 'wechat' | 'password'
    loginType: 'wechat',
    // 表单数据
    username: '',
    password: '',
    showPassword: false
  },

  onLoad() {
    // 检查是否支持 getUserProfile
    if (typeof wx.getUserProfile === 'function') {
      this.setData({ canUseGetUserProfile: true })
    }
  },

  // 切换登录方式
  switchLoginType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({ loginType: type })
  },

  // 输入用户名
  onUsernameInput(e) {
    this.setData({ username: e.detail.value })
  },

  // 输入密码
  onPasswordInput(e) {
    this.setData({ password: e.detail.value })
  },

  // 切换密码显示
  togglePassword() {
    this.setData({ showPassword: !this.data.showPassword })
  },

  // 用户名密码登录
  async onPasswordLogin() {
    const { username, password } = this.data

    if (!username.trim()) {
      wx.showToast({ title: '请输入用户名', icon: 'none' })
      return
    }
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' })
      return
    }

    if (this.data.loading) return
    this.setData({ loading: true })

    try {
      const result = await api.login(username, password)

      // 保存登录状态
      app.setUserInfo(result.user, result.token)

      wx.showToast({
        title: '登录成功',
        icon: 'success',
        duration: 1500
      })

      setTimeout(() => {
        wx.navigateBack()
      }, 1500)

    } catch (error) {
      console.error('登录失败:', error)
      wx.showToast({
        title: error.message || '用户名或密码错误',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 微信一键登录
  async onWechatLogin() {
    if (this.data.loading) return

    this.setData({ loading: true })

    try {
      // 1. 调用 wx.login 获取 code
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject
        })
      })

      if (!loginRes.code) {
        throw new Error('获取登录凭证失败')
      }

      // 2. 尝试获取用户信息（可选）
      let userInfo = null
      if (this.data.canUseGetUserProfile) {
        try {
          const profileRes = await new Promise((resolve, reject) => {
            wx.getUserProfile({
              desc: '用于完善用户资料',
              success: resolve,
              fail: reject
            })
          })
          userInfo = profileRes.userInfo
        } catch (e) {
          // 用户拒绝授权，继续登录流程
          console.log('用户拒绝授权用户信息')
        }
      }

      // 3. 调用服务器登录接口
      const result = await api.wechatLogin(loginRes.code, userInfo)

      // 4. 保存登录状态
      app.setUserInfo(result.user, result.token)

      wx.showToast({
        title: '登录成功',
        icon: 'success',
        duration: 1500
      })

      // 5. 返回上一页
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)

    } catch (error) {
      console.error('登录失败:', error)
      wx.showToast({
        title: error.message || '登录失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 返回上一页
  onBack() {
    wx.navigateBack()
  }
})
