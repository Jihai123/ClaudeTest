// pages/ranking/ranking.js
const api = require('../../utils/api')
const util = require('../../utils/util')

Page({
  data: {
    activeTab: 'china',  // 默认显示中国综合榜
    cities: [],
    loading: false
  },

  onLoad() {
    this.loadRanking()
  },

  // 切换榜单类型
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab

    if (tab === this.data.activeTab) return

    this.setData({ activeTab: tab })
    this.loadRanking()
  },

  // 加载榜单数据
  async loadRanking() {
    this.setData({ loading: true })

    try {
      // 根据榜单类型构建参数
      const params = this.getRankingParams()

      // 调用API
      const result = await api.getCities(params)
      const cities = result.cities || []

      // 处理城市数据
      const processedCities = cities.map((city, index) =>
        this.processCityData(city, index)
      )

      this.setData({
        cities: processedCities,
        loading: false
      })

    } catch (error) {
      console.error('加载榜单失败:', error)
      util.showToast('加载失败，请重试')
      this.setData({ loading: false })
    }
  },

  // 获取榜单参数
  getRankingParams() {
    const { activeTab } = this.data

    // 基础参数 - 设置较大的limit以获取所有城市
    const params = {
      limit: 500
    }

    // 根据榜单类型设置筛选和排序
    switch (activeTab) {
      case 'world':
        // 世界城市排行榜
        params.list_type = 'world'
        params.sort = 'world_score'
        params.order = 'DESC'
        break

      case 'china':
        // 中国综合宜居城市排行榜
        params.list_type = 'china_general'
        params.sort = 'overall_score'
        params.order = 'DESC'
        break

      case 'layflat':
        // 旅居城市排行榜（躺平榜）
        params.list_type = 'china_layflat'
        params.sort = 'layflat_score'
        params.order = 'DESC'
        break
    }

    return params
  },

  // 处理城市数据
  processCityData(city, index) {
    const { activeTab } = this.data

    // 获取标签
    const topDimensions = util.getTopDimensions(city)
    const mainTag = topDimensions.length > 0 ? topDimensions[0].label : '宜居城市'
    const secondTag = topDimensions.length > 1 ? topDimensions[1].label : ''

    // 根据榜单类型确定显示的分数和标签
    let displayScore, scoreLabel

    switch (activeTab) {
      case 'world':
        displayScore = (city.world_score || 0).toFixed(1)
        scoreLabel = '宜居指数'
        break

      case 'china':
        displayScore = (city.overall_score || 0).toFixed(1)
        scoreLabel = '综合评分'
        break

      case 'layflat':
        displayScore = (city.layflat_score || 0).toFixed(1)
        scoreLabel = '躺平指数'
        // 旅居榜显示月租金作为第二标签
        if (city.avg_rent) {
          return {
            ...city,
            mainTag: `月租${city.avg_rent}元`,
            secondTag: mainTag,
            displayScore,
            scoreLabel
          }
        }
        break

      default:
        displayScore = (city.overall_score || 0).toFixed(1)
        scoreLabel = '综合评分'
    }

    return {
      ...city,
      mainTag,
      secondTag,
      displayScore,
      scoreLabel
    }
  },

  // 点击城市
  onCityTap(e) {
    const cityId = e.currentTarget.dataset.id

    // 保存到最近访问
    this.saveRecentVisit(cityId)

    // 跳转到详情页
    wx.navigateTo({
      url: `/pages/city-detail/city-detail?id=${cityId}`
    })
  },

  // 保存最近访问
  saveRecentVisit(cityId) {
    try {
      let recentIds = wx.getStorageSync('recentVisits') || []
      recentIds = recentIds.filter(id => id !== cityId)
      recentIds.unshift(cityId)
      if (recentIds.length > 10) {
        recentIds = recentIds.slice(0, 10)
      }
      wx.setStorageSync('recentVisits', recentIds)
    } catch (e) {
      console.error('保存最近访问失败:', e)
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadRanking().then(() => {
      wx.stopPullDownRefresh()
    })
  }
})
