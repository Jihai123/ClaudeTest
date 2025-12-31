// pages/index/index.js
const api = require('../../utils/api')
const util = require('../../utils/util')

Page({
  data: {
    // 搜索
    searchQuery: '',
    currentLocation: '定位中...',

    // 核心数据
    recentCities: [],   // 最近访问（1-3个）
    hotCities: [],      // 热门城市（5-8个）
    rankingCities: [],  // 榜单城市（前3-5名）

    // 加载状态
    loading: false
  },

  onLoad() {
    // 加载所有初始数据
    this.getCurrentLocation()
    this.loadRecentCities()
    this.loadHotCities()
    this.loadRankingCities()
  },

  onShow() {
    // 页面显示时刷新最近访问
    this.loadRecentCities()
  },

  // ================================
  // 定位功能
  // ================================

  getCurrentLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        // 这里应该调用逆地理编码API将坐标转换为城市名
        // 暂时先显示简单提示
        this.setData({
          currentLocation: '正在定位...'
        })

        // 模拟定位结果（实际应该调用地理编码API）
        setTimeout(() => {
          this.setData({
            currentLocation: '当前位置'
          })
        }, 1000)
      },
      fail: () => {
        this.setData({
          currentLocation: '定位失败，点击重试'
        })
      }
    })
  },

  onLocationTap() {
    // 重新获取定位
    this.getCurrentLocation()
  },

  // ================================
  // 搜索功能（保留智能搜索）
  // ================================

  onSearchInput(e) {
    this.setData({
      searchQuery: e.detail.value
    })
  },

  onSearchConfirm() {
    if (!this.data.searchQuery.trim()) {
      return
    }

    // 跳转到搜索结果页（带上搜索词）
    wx.navigateTo({
      url: `/pages/city-list/city-list?search=${encodeURIComponent(this.data.searchQuery)}`
    })
  },

  onClearSearch() {
    this.setData({
      searchQuery: ''
    })
  },

  // ================================
  // 快速入口（6个按钮）
  // ================================

  onQuickEntry(e) {
    const type = e.currentTarget.dataset.type

    // 构建筛选条件并跳转到城市列表页
    let filterParams = {}

    switch (type) {
      case 'recommend':
        // "我适合住哪" - 跳转到推荐页或问卷页
        wx.navigateTo({
          url: '/pages/recommend/recommend'
        })
        return

      case 'lowCost':
        // 低生活成本：living_cost <= 5
        filterParams = {
          title: '低生活成本城市',
          filter: JSON.stringify({ living_cost_max: 5 })
        }
        break

      case 'elderly':
        // 适合养老：elderly_care >= 7
        filterParams = {
          title: '适合养老城市',
          filter: JSON.stringify({ elderly_care_min: 7 })
        }
        break

      case 'employment':
        // 就业机会多：employment >= 7
        filterParams = {
          title: '就业机会多的城市',
          filter: JSON.stringify({ employment_min: 7 })
        }
        break

      case 'airQuality':
        // 空气好：air_quality >= 8
        filterParams = {
          title: '空气质量好的城市',
          filter: JSON.stringify({ air_quality_min: 8 })
        }
        break

      case 'coastal':
        // 沿海城市：特殊处理
        filterParams = {
          title: '沿海城市',
          coastal: 'true'
        }
        break
    }

    // 构建URL参数
    const params = Object.keys(filterParams)
      .map(key => `${key}=${encodeURIComponent(filterParams[key])}`)
      .join('&')

    wx.navigateTo({
      url: `/pages/city-list/city-list?${params}`
    })
  },

  // ================================
  // 最近访问
  // ================================

  loadRecentCities() {
    try {
      // 从缓存读取最近访问的城市ID列表
      const recentIds = wx.getStorageSync('recentVisits') || []

      if (recentIds.length === 0) {
        this.setData({ recentCities: [] })
        return
      }

      // 只显示最近3个
      const limitedIds = recentIds.slice(0, 3)

      // 并发获取城市详情
      Promise.all(limitedIds.map(id => this.getCityById(id)))
        .then(cities => {
          // 过滤掉获取失败的城市
          const validCities = cities.filter(city => city !== null)

          // 处理城市数据
          const processedCities = validCities.map(city => this.processCityData(city))

          this.setData({
            recentCities: processedCities
          })
        })
        .catch(err => {
          console.error('加载最近访问失败:', err)
          this.setData({ recentCities: [] })
        })
    } catch (e) {
      console.error('读取最近访问失败:', e)
      this.setData({ recentCities: [] })
    }
  },

  // 获取单个城市信息
  async getCityById(cityId) {
    try {
      const city = await api.getCity(cityId)
      return city || null
    } catch (error) {
      console.error(`获取城市${cityId}失败:`, error)
      return null
    }
  },

  // 保存最近访问
  saveRecentVisit(cityId) {
    try {
      let recentIds = wx.getStorageSync('recentVisits') || []

      // 移除已存在的该城市
      recentIds = recentIds.filter(id => id !== cityId)

      // 添加到开头
      recentIds.unshift(cityId)

      // 最多保存10个
      if (recentIds.length > 10) {
        recentIds = recentIds.slice(0, 10)
      }

      wx.setStorageSync('recentVisits', recentIds)
    } catch (e) {
      console.error('保存最近访问失败:', e)
    }
  },

  // ================================
  // 热门城市
  // ================================

  async loadHotCities() {
    try {
      // 获取综合评分最高的8个国内城市
      const result = await api.getCities({
        sort: 'overall_score',
        order: 'DESC',
        limit: 8,
        filters: JSON.stringify({ country: '中国' })
      })

      const cities = result.cities || []
      const processedCities = cities.map(city => this.processCityData(city))

      this.setData({
        hotCities: processedCities
      })
    } catch (error) {
      console.error('加载热门城市失败:', error)
      util.showToast('加载热门城市失败')
    }
  },

  // ================================
  // 榜单城市
  // ================================

  async loadRankingCities() {
    this.setData({ loading: true })

    try {
      // 获取综合评分最高的前5名国内城市
      const result = await api.getCities({
        sort: 'overall_score',
        order: 'DESC',
        limit: 5,
        filters: JSON.stringify({ country: '中国' })
      })

      const cities = result.cities || []
      const processedCities = cities.map(city => this.processCityData(city))

      this.setData({
        rankingCities: processedCities,
        loading: false
      })
    } catch (error) {
      console.error('加载榜单失败:', error)
      util.showToast('加载榜单失败')
      this.setData({ loading: false })
    }
  },

  // ================================
  // 数据处理（简化版）
  // ================================

  processCityData(city) {
    const score = city.overall_score || 0
    const emotional = util.getEmotionalScore(score)

    // 获取主要标签（只取第一个）
    const topDimensions = util.getTopDimensions(city)
    const mainTag = topDimensions.length > 0
      ? topDimensions[0].label
      : '宜居城市'

    return {
      ...city,
      overall_score: score.toFixed(0), // 取整数
      emoji: emotional.emoji,
      mainTag: mainTag
    }
  },

  // ================================
  // 点击事件
  // ================================

  onCityTap(e) {
    const cityId = e.currentTarget.dataset.id

    // 保存到最近访问
    this.saveRecentVisit(cityId)

    // 跳转到详情页
    wx.navigateTo({
      url: `/pages/city-detail/city-detail?id=${cityId}`
    })
  },

  onViewMore(e) {
    const type = e.currentTarget.dataset.type

    switch (type) {
      case 'hot':
        // 查看更多热门城市
        wx.navigateTo({
          url: '/pages/city-list/city-list?title=热门城市&sort=overall_score'
        })
        break

      case 'ranking':
        // 查看完整榜单
        wx.navigateTo({
          url: '/pages/ranking/ranking'
        })
        break
    }
  },

  // ================================
  // 下拉刷新
  // ================================

  onPullDownRefresh() {
    Promise.all([
      this.loadHotCities(),
      this.loadRankingCities(),
      this.loadRecentCities()
    ]).then(() => {
      wx.stopPullDownRefresh()
    })
  }
})
