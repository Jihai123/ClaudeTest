// app.js
App({
  globalData: {
    userInfo: null,
    token: null,
    // 根据实际部署情况配置API地址
    apiBaseUrl: 'https://your-domain.com/api' // TODO: 修改为实际的API地址
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
    wx.getSystemInfo({
      success: (res) => {
        this.globalData.systemInfo = res
        console.log('系统信息:', res)
      }
    })
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
