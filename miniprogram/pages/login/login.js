// pages/login/login.js
const app = getApp()
const api = require('../../utils/api')

Page({
  data: {
    loading: false,
    canUseGetUserProfile: false
  },

  onLoad() {
    // 检查是否支持 getUserProfile
    if (typeof wx.getUserProfile === 'function') {
      this.setData({ canUseGetUserProfile: true })
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
