// pages/index/index.js
const api = require('../../utils/api')
const util = require('../../utils/util')

// 城市渐变色生成器 - 基于城市名生成稳定的渐变色
const GRADIENT_COLORS = [
  { from: '#667eea', to: '#764ba2' },  // 紫色渐变
  { from: '#f093fb', to: '#f5576c' },  // 粉色渐变
  { from: '#4facfe', to: '#00f2fe' },  // 蓝色渐变
  { from: '#43e97b', to: '#38f9d7' },  // 绿色渐变
  { from: '#fa709a', to: '#fee140' },  // 橙粉渐变
  { from: '#a8edea', to: '#fed6e3' },  // 淡雅渐变
  { from: '#ff9a9e', to: '#fecfef' },  // 温柔粉
  { from: '#ffecd2', to: '#fcb69f' },  // 暖橙色
  { from: '#89f7fe', to: '#66a6ff' },  // 天蓝渐变
  { from: '#fddb92', to: '#d1fdff' },  // 日出渐变
]

// 城市风景图片映射 - 使用真实的城市图片 URL（来自 Unsplash）
// 这些是固定的真实城市风景图片，作为数据库封面图的回退选项
const CITY_IMAGES = {
  // 一线城市
  '北京': 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=800&h=600&fit=crop',
  '上海': 'https://images.unsplash.com/photo-1538428494232-9c0d8a3ab403?w=800&h=600&fit=crop',
  '广州': 'https://images.unsplash.com/photo-1583001809873-a128495da465?w=800&h=600&fit=crop',
  '深圳': 'https://images.unsplash.com/photo-1598711796884-f221383f7a7b?w=800&h=600&fit=crop',
  // 热门旅居城市
  '成都': 'https://images.unsplash.com/photo-1590650046871-92c887180603?w=800&h=600&fit=crop',
  '杭州': 'https://images.unsplash.com/photo-1600054800747-be294a6a0d26?w=800&h=600&fit=crop',
  '重庆': 'https://images.unsplash.com/photo-1607697210821-e1aff0769b09?w=800&h=600&fit=crop',
  '西安': 'https://images.unsplash.com/photo-1624204621668-f7124c85c49a?w=800&h=600&fit=crop',
  '苏州': 'https://images.unsplash.com/photo-1567706054965-4d25339ce9a5?w=800&h=600&fit=crop',
  '南京': 'https://images.unsplash.com/photo-1599571234909-29ed5d1321d6?w=800&h=600&fit=crop',
  // 沿海城市
  '厦门': 'https://images.unsplash.com/photo-1569949381669-ecf31ae8e613?w=800&h=600&fit=crop',
  '青岛': 'https://images.unsplash.com/photo-1548991422-02ba3a9fe29a?w=800&h=600&fit=crop',
  '三亚': 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop',
  '珠海': 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop',
  '大连': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=600&fit=crop',
  '威海': 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=800&h=600&fit=crop',
  // 云南城市
  '大理': 'https://images.unsplash.com/photo-1537531383496-f4749c6e5d74?w=800&h=600&fit=crop',
  '丽江': 'https://images.unsplash.com/photo-1591122947157-26bad3a117d2?w=800&h=600&fit=crop',
  '昆明': 'https://images.unsplash.com/photo-1590650516494-0c8e4a4dd67e?w=800&h=600&fit=crop',
  // 其他热门城市
  '武汉': 'https://images.unsplash.com/photo-1583001931096-959e9a1a6223?w=800&h=600&fit=crop',
  '长沙': 'https://images.unsplash.com/photo-1590736969955-71cc94901144?w=800&h=600&fit=crop',
  '天津': 'https://images.unsplash.com/photo-1580077812579-4e0b6db9e7da?w=800&h=600&fit=crop',
  '桂林': 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=800&h=600&fit=crop',
}

const generateCityGradient = (cityName) => {
  let hash = 0
  for (let i = 0; i < cityName.length; i++) {
    hash = cityName.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % GRADIENT_COLORS.length
  return GRADIENT_COLORS[index]
}

// 获取渐变色索引（用于CSS类）
const getGradientIndex = (cityName) => {
  let hash = 0
  for (let i = 0; i < cityName.length; i++) {
    hash = cityName.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash) % GRADIENT_COLORS.length
}

// 获取城市图片URL
const getCityImageUrl = (cityName) => {
  // 1. 优先使用预设图片
  if (CITY_IMAGES[cityName]) {
    return CITY_IMAGES[cityName]
  }
  // 2. 没有预设图片时返回空
  return ''
}

Page({
  data: {
    // 搜索
    searchQuery: '',

    // 城市总数
    totalCities: 300,

    // 快捷筛选标签
    quickTags: [
      { type: 'recommend', icon: '🧭', label: '推荐', active: false },
      { type: 'lowCost', icon: '💰', label: '低成本', active: false },
      { type: 'elderly', icon: '🏥', label: '养老', active: false },
      { type: 'employment', icon: '💼', label: '就业', active: false },
      { type: 'airQuality', icon: '🌿', label: '空气好', active: false },
      { type: 'coastal', icon: '🌊', label: '沿海', active: false }
    ],

    // 精选推荐城市（轮播）
    featuredCities: [],

    // 预算区间
    budgetRanges: [
      { range: '0-500', label: '< ¥500', desc: '极致省钱', count: 0 },
      { range: '500-800', label: '¥500-800', desc: '经济实惠', count: 0 },
      { range: '800-1200', label: '¥800-1200', desc: '舒适生活', count: 0 },
      { range: '1200-9999', label: '> ¥1200', desc: '品质享受', count: 0 }
    ],

    // 榜单标签
    rankingTabs: [
      { type: 'china_general', icon: '🏆', label: '宜居榜' },
      { type: 'china_layflat', icon: '🏝️', label: '旅居榜' },
      { type: 'world', icon: '🌍', label: '世界榜' }
    ],
    currentRankingTab: 'china_general',

    // 榜单数据缓存
    rankingData: {
      china_general: [],
      china_layflat: [],
      world: []
    },
    currentRankingCities: [],

    // 热门城市
    hotCities: [],

    // 最近访问
    recentCities: [],

    // 加载状态
    loading: false
  },

  onLoad() {
    this.initData()
  },

  onShow() {
    // 每次显示页面时刷新最近访问
    this.loadRecentCities()
  },

  // ================================
  // 初始化数据
  // ================================

  async initData() {
    this.setData({ loading: true })

    try {
      // 并发加载所有数据
      await Promise.all([
        this.loadFeaturedCities(),
        this.loadBudgetCounts(),
        this.loadAllRankings(),
        this.loadHotCities(),
        this.loadRecentCities(),
        this.loadTotalCities()
      ])
    } catch (error) {
      console.error('初始化数据失败:', error)
      util.showToast('加载失败，请下拉刷新')
    } finally {
      this.setData({ loading: false })
    }
  },

  // 加载城市总数
  async loadTotalCities() {
    try {
      const result = await api.getCities({ limit: 1 })
      if (result.pagination) {
        this.setData({ totalCities: result.pagination.total })
      }
    } catch (error) {
      console.error('获取城市总数失败:', error)
    }
  },

  // ================================
  // 精选推荐（轮播）
  // ================================

  async loadFeaturedCities() {
    try {
      // 获取高评分+低房租的优质城市
      const result = await api.getCities({
        sort: 'overall_score',
        order: 'DESC',
        limit: 6,
        filters: JSON.stringify({ country: '中国' })
      })

      const cities = (result.cities || []).map(city => this.processCity(city, true))
      this.setData({ featuredCities: cities })
    } catch (error) {
      console.error('加载精选城市失败:', error)
    }
  },

  // ================================
  // 预算统计
  // ================================

  async loadBudgetCounts() {
    const ranges = [
      { range: '0-500', label: '< ¥500', desc: '极致省钱' },
      { range: '500-800', label: '¥500-800', desc: '经济实惠' },
      { range: '800-1200', label: '¥800-1200', desc: '舒适生活' },
      { range: '1200-9999', label: '> ¥1200', desc: '品质享受' }
    ]

    try {
      // 并发查询各价格区间的城市数量
      const counts = await Promise.all(ranges.map(async (r) => {
        try {
          const result = await api.getCities({
            limit: 1,
            filters: JSON.stringify({ rent: r.range })
          })
          return result.pagination?.total || 0
        } catch {
          return 0
        }
      }))

      const budgetRanges = ranges.map((r, i) => ({
        ...r,
        count: counts[i]
      }))

      this.setData({ budgetRanges })
    } catch (error) {
      console.error('加载预算统计失败:', error)
    }
  },

  // ================================
  // 榜单数据（3榜切换）
  // ================================

  async loadAllRankings() {
    try {
      // 并发加载三个榜单
      const [generalResult, layflatResult, worldResult] = await Promise.all([
        api.getCities({
          list_type: 'china_general',
          sort: 'overall_score',
          order: 'DESC',
          limit: 5
        }),
        api.getCities({
          list_type: 'china_layflat',
          sort: 'layflat_score',
          order: 'DESC',
          limit: 5
        }),
        api.getCities({
          list_type: 'world',
          sort: 'world_score',
          order: 'DESC',
          limit: 5
        })
      ])

      const rankingData = {
        china_general: (generalResult.cities || []).map(city => this.processCity(city, false, 'overall_score')),
        china_layflat: (layflatResult.cities || []).map(city => this.processCity(city, false, 'layflat_score')),
        world: (worldResult.cities || []).map(city => this.processCity(city, false, 'world_score'))
      }

      this.setData({
        rankingData,
        currentRankingCities: rankingData[this.data.currentRankingTab]
      })
    } catch (error) {
      console.error('加载榜单失败:', error)
    }
  },

  // 切换榜单
  onRankingTabChange(e) {
    const type = e.currentTarget.dataset.type
    this.setData({
      currentRankingTab: type,
      currentRankingCities: this.data.rankingData[type] || []
    })
  },

  // ================================
  // 热门城市
  // ================================

  async loadHotCities() {
    try {
      const result = await api.getCities({
        sort: 'overall_score',
        order: 'DESC',
        limit: 6,
        filters: JSON.stringify({ country: '中国' })
      })

      // 从不同的城市中选取（避免与轮播重复）
      const cities = (result.cities || [])
        .slice(0, 6)
        .map(city => this.processCity(city))

      this.setData({ hotCities: cities })
    } catch (error) {
      console.error('加载热门城市失败:', error)
    }
  },

  // ================================
  // 最近访问
  // ================================

  async loadRecentCities() {
    try {
      const recentIds = wx.getStorageSync('recentVisits') || []
      if (recentIds.length === 0) {
        this.setData({ recentCities: [] })
        return
      }

      // 只显示最近5个
      const limitedIds = recentIds.slice(0, 5)

      const cities = await Promise.all(
        limitedIds.map(async id => {
          try {
            const city = await api.getCity(id)
            return city ? this.processCity(city) : null
          } catch {
            return null
          }
        })
      )

      this.setData({
        recentCities: cities.filter(c => c !== null)
      })
    } catch (error) {
      console.error('加载最近访问失败:', error)
      this.setData({ recentCities: [] })
    }
  },

  // 清空最近访问
  onClearRecent() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空最近浏览记录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('recentVisits')
          this.setData({ recentCities: [] })
          util.showToast('已清空')
        }
      }
    })
  },

  // ================================
  // 数据处理
  // ================================

  processCity(city, withTags = false, scoreField = 'overall_score') {
    const score = city[scoreField] || city.overall_score || 0
    const emotional = util.getEmotionalScore(score)
    const topDimensions = util.getTopDimensions(city)

    // 获取城市图片 - 多级优先
    let imageUrl = ''

    // 1. 首先检查数据库中是否有封面图片
    if (city.cover_image && city.cover_image.image_url) {
      imageUrl = city.cover_image.image_url
    }
    // 2. 然后使用预设的城市图片
    if (!imageUrl) {
      imageUrl = getCityImageUrl(city.name)
    }

    const hasImage = !!imageUrl

    // 生成渐变色索引用于CSS类
    const gradientIndex = getGradientIndex(city.name)
    const gradient = generateCityGradient(city.name)

    const processed = {
      ...city,
      imageUrl,
      hasImage,  // 是否有真实图片
      gradientIndex,  // 渐变色索引（0-9）
      gradient,  // 备用渐变色对象
      overall_score: Math.round(score),
      displayScore: Math.round(score),
      emoji: emotional.emoji,
      mainTag: topDimensions.length > 0 ? topDimensions[0].label : '宜居城市',
      // 修复世界榜 null 显示问题
      province: city.province || city.country || ''
    }

    // 轮播需要更多标签
    if (withTags) {
      const tags = []
      if (topDimensions.length > 0) tags.push(topDimensions[0].label)
      if (topDimensions.length > 1) tags.push(topDimensions[1].label)
      if (city.climate) tags.push(city.climate)
      processed.displayTags = tags.slice(0, 3)
    }

    return processed
  },

  // ================================
  // 搜索功能
  // ================================

  onSearchInput(e) {
    this.setData({ searchQuery: e.detail.value })
  },

  onSearchConfirm() {
    const query = this.data.searchQuery.trim()
    if (!query) return

    wx.navigateTo({
      url: `/pages/city-list/city-list?search=${encodeURIComponent(query)}`
    })
  },

  onClearSearch() {
    this.setData({ searchQuery: '' })
  },

  // ================================
  // 快捷筛选
  // ================================

  onQuickTagTap(e) {
    const type = e.currentTarget.dataset.type

    // 更新标签状态
    const quickTags = this.data.quickTags.map(tag => ({
      ...tag,
      active: tag.type === type
    }))
    this.setData({ quickTags })

    // 构建筛选参数并跳转
    let params = {}

    switch (type) {
      case 'recommend':
        wx.navigateTo({ url: '/pages/recommend/recommend' })
        return

      case 'lowCost':
        params = {
          title: '低成本城市',
          sort: 'avg_rent',
          order: 'ASC',
          filter: JSON.stringify({ rent: '0-1500' })
        }
        break

      case 'elderly':
        params = {
          title: '适合养老',
          sort: 'elderly_care',
          order: 'DESC',
          filter: JSON.stringify({ elderly_care_min: 6 })
        }
        break

      case 'employment':
        params = {
          title: '就业机会多',
          sort: 'employment',
          order: 'DESC',
          filter: JSON.stringify({ employment_min: 6 })
        }
        break

      case 'airQuality':
        params = {
          title: '空气质量好',
          sort: 'air_quality',
          order: 'DESC',
          filter: JSON.stringify({ air_quality_min: 7 })
        }
        break

      case 'coastal':
        params = {
          title: '沿海宜居',
          filter: JSON.stringify({ coastal: true })
        }
        break
    }

    const urlParams = Object.keys(params)
      .map(key => `${key}=${encodeURIComponent(params[key])}`)
      .join('&')

    wx.navigateTo({
      url: `/pages/city-list/city-list?${urlParams}`
    })
  },

  // ================================
  // 预算筛选
  // ================================

  onBudgetTap(e) {
    const range = e.currentTarget.dataset.range

    wx.navigateTo({
      url: `/pages/city-list/city-list?title=按预算找城市&sort=avg_rent&order=ASC&filter=${encodeURIComponent(JSON.stringify({ rent: range }))}`
    })
  },

  // ================================
  // 城市点击
  // ================================

  onCityTap(e) {
    const cityId = e.currentTarget.dataset.id

    // 保存到最近访问
    this.saveRecentVisit(cityId)

    wx.navigateTo({
      url: `/pages/city-detail/city-detail?id=${cityId}`
    })
  },

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

  // ================================
  // 图片加载处理
  // ================================

  // 图片加载失败时，隐藏图片显示渐变色背景
  onImageError(e) {
    const { type, index } = e.currentTarget.dataset
    const dataKey = {
      'featured': 'featuredCities',
      'hot': 'hotCities',
      'ranking': 'currentRankingCities',
      'recent': 'recentCities'
    }[type]

    if (dataKey && index !== undefined) {
      // 将对应城市的 hasImage 设为 false，触发显示渐变色背景
      const key = `${dataKey}[${index}].hasImage`
      this.setData({ [key]: false })
    }
  },

  // ================================
  // 查看更多
  // ================================

  onViewMore(e) {
    const type = e.currentTarget.dataset.type

    switch (type) {
      case 'featured':
        wx.navigateTo({
          url: '/pages/city-list/city-list?title=精选推荐&sort=overall_score&order=DESC'
        })
        break

      case 'hot':
        wx.navigateTo({
          url: '/pages/city-list/city-list?title=热门城市&sort=overall_score&order=DESC'
        })
        break

      case 'ranking':
        wx.navigateTo({
          url: '/pages/ranking/ranking'
        })
        break
    }
  },

  // ================================
  // 下拉刷新
  // ================================

  async onPullDownRefresh() {
    await this.initData()
    wx.stopPullDownRefresh()
  }
})
