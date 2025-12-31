// app.js
App({
  globalData: {
    userInfo: null,
    token: null,
    // API地址配置
    // 本地开发: http://localhost:3000/api
    // 真机测试: http://你的电脑IP:3000/api (例如: http://192.168.1.100:3000/api)
    // 生产环境: https://your-domain.com/api
    apiBaseUrl: 'http://localhost:3000/api'
  },

  onLaunch() {
    // 小程序启动时执行
    console.log('小程序启动')

    // 检查登录状态
    this.checkLoginStatus()

    // 获取系统信息
    this.getSystemInfo()
  },

  onShow() {
    // 小程序显示时执行
    console.log('小程序显示')
  },

  onHide() {
    // 小程序隐藏时执行
    console.log('小程序隐藏')
  },

  // 检查登录状态
  checkLoginStatus() {
    const token = wx.getStorageSync('token')
    const userInfo = wx.getStorageSync('userInfo')

    if (token && userInfo) {
      this.globalData.token = token
      this.globalData.userInfo = userInfo
    }
  },

  // 获取系统信息
  getSystemInfo() {
    // 使用新API替代废弃的wx.getSystemInfo
    try {
      const deviceInfo = wx.getDeviceInfo()
      const windowInfo = wx.getWindowInfo()
      const appBaseInfo = wx.getAppBaseInfo()

      this.globalData.systemInfo = {
        ...deviceInfo,
        ...windowInfo,
        ...appBaseInfo
      }

      console.log('系统信息:', this.globalData.systemInfo)
    } catch (e) {
      console.error('获取系统信息失败:', e)
    }
  },

  // 设置用户信息
  setUserInfo(userInfo, token) {
    this.globalData.userInfo = userInfo
    this.globalData.token = token

    // 保存到本地存储
    wx.setStorageSync('userInfo', userInfo)
    wx.setStorageSync('token', token)
  },

  // 清除用户信息
  clearUserInfo() {
    this.globalData.userInfo = null
    this.globalData.token = null

    // 清除本地存储
    wx.removeStorageSync('userInfo')
    wx.removeStorageSync('token')
  }
})
