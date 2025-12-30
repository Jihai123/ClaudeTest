// pages/ranking/ranking.js
const api = require('../../utils/api')
const util = require('../../utils/util')

Page({
  data: {
    activeTab: 'overall',
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

    // 基础参数
    const params = {
      limit: 50,
      filters: JSON.stringify({ country: '中国' })
    }

    // 根据榜单类型设置排序
    switch (activeTab) {
      case 'overall':
        // 综合榜 - 按综合评分排序
        params.sort = 'overall_score'
        params.order = 'DESC'
        break

      case 'cost':
        // 性价比榜 - 生活成本低且综合评分高
        params.sort = 'living_cost'
        params.order = 'ASC'
        // 筛选综合评分>=70的城市
        params.filters = JSON.stringify({
          country: '中国',
          overall_score_min: 70
        })
        break

      case 'elderly':
        // 养老榜 - 按养老友好度排序
        params.sort = 'elderly_care'
        params.order = 'DESC'
        break

      case 'air':
        // 空气质量榜 - 按空气质量排序
        params.sort = 'air_quality'
        params.order = 'DESC'
        break
    }

    return params
  },

  // 处理城市数据
  processCityData(city, index) {
    const { activeTab } = this.data
    const score = city.overall_score || 0

    // 获取标签
    const topDimensions = util.getTopDimensions(city)
    const mainTag = topDimensions.length > 0 ? topDimensions[0].label : '宜居城市'
    const secondTag = topDimensions.length > 1 ? topDimensions[1].label : ''

    // 根据榜单类型确定显示的分数和标签
    let displayScore, scoreLabel

    switch (activeTab) {
      case 'overall':
        displayScore = score.toFixed(0)
        scoreLabel = '综合评分'
        break

      case 'cost':
        displayScore = (city.living_cost || 0).toFixed(1)
        scoreLabel = '生活成本'
        break

      case 'elderly':
        displayScore = (city.elderly_care || 0).toFixed(1)
        scoreLabel = '养老友好'
        break

      case 'air':
        displayScore = (city.air_quality || 0).toFixed(1)
        scoreLabel = '空气质量'
        break

      default:
        displayScore = score.toFixed(0)
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
