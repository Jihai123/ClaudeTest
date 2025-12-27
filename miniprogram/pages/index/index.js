// pages/index/index.js
const api = require('../../utils/api')
const util = require('../../utils/util')

Page({
  data: {
    cities: [],
    loading: false,
    searchQuery: '',
    currentPage: 1,
    totalPages: 1,
    limit: 10,

    // 国内/国际筛选（默认国内）
    regionFilter: 'domestic',

    // 场景化入口
    activeScenario: '',

    // 智能标签
    smartTags: [
      { id: 'all', label: '全部', active: true },
      { id: 'elderly', label: '养老友好', active: false },
      { id: 'young', label: '年轻人', active: false },
      { id: 'costEffective', label: '性价比', active: false },
      { id: 'airQuality', label: '空气好', active: false },
      { id: 'safety', label: '安全感', active: false }
    ],
    activeTag: 'all',

    // 排序选项
    sortOptions: [
      { label: '综合评分', value: 'overall_score' },
      { label: '城市名称', value: 'name' },
      { label: '人口数量', value: 'population' },
      { label: '创建时间', value: 'created_at' }
    ],
    sortIndex: 0,

    // 排序方向
    orderOptions: [
      { label: '降序', value: 'DESC' },
      { label: '升序', value: 'ASC' }
    ],
    orderIndex: 0,

    // 对比篮子
    compareCities: [],

    // 收藏列表（从缓存加载）
    favorites: []
  },

  onLoad() {
    this.loadFavorites()
    this.loadCities()
  },

  onShow() {
    // 页面显示时刷新数据
    if (this.data.cities.length > 0) {
      this.loadCities()
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({
      currentPage: 1
    })
    this.loadCities().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 加载收藏列表
  loadFavorites() {
    try {
      const favorites = wx.getStorageSync('favorites') || []
      this.setData({ favorites })
    } catch (e) {
      console.error('加载收藏失败:', e)
    }
  },

  // 保存收藏列表
  saveFavorites() {
    try {
      wx.setStorageSync('favorites', this.data.favorites)
    } catch (e) {
      console.error('保存收藏失败:', e)
    }
  },

  // 智能搜索关键词匹配
  parseSearchKeywords(query) {
    const lowerQuery = query.toLowerCase().trim()

    // 关键词映射表
    const keywordMap = {
      '看海': { tags: ['coastal'], keywords: ['海边', '沿海', '海滨'] },
      '海边': { tags: ['coastal'], keywords: ['看海', '沿海', '海滨'] },
      '沿海': { tags: ['coastal'], keywords: ['看海', '海边', '海滨'] },
      '养老': { filter: { elderly_care: 7 }, tags: ['elderly'] },
      '退休': { filter: { elderly_care: 7 }, tags: ['elderly'] },
      '康养': { filter: { elderly_care: 7, medical_facilities: 7 }, tags: ['elderly', 'medical'] },
      '旅居': { filter: { air_quality: 7, safety: 7 }, tags: ['vacation'] },
      '性价比': { filter: { living_cost: 5 }, tags: ['costEffective'] },
      '便宜': { filter: { living_cost: 5 }, tags: ['costEffective'] },
      '空气好': { filter: { air_quality: 8 }, tags: ['airQuality'] },
      '空气': { filter: { air_quality: 7 }, tags: ['airQuality'] },
      '安全': { filter: { safety: 8 }, tags: ['safety'] },
      '工作': { filter: { employment: 7 }, tags: ['young'] },
      '就业': { filter: { employment: 7 }, tags: ['young'] },
      '数字游民': { filter: { employment: 6, living_cost: 6 }, tags: ['nomad'] },
      '远程': { filter: { employment: 6 }, tags: ['nomad'] }
    }

    // 检查是否包含关键词
    for (const [keyword, config] of Object.entries(keywordMap)) {
      if (lowerQuery.includes(keyword)) {
        return config
      }
    }

    return null
  },

  // 加载城市列表
  async loadCities() {
    this.setData({ loading: true })

    try {
      // 解析搜索关键词
      const searchConfig = this.parseSearchKeywords(this.data.searchQuery)

      const params = {
        search: searchConfig ? '' : this.data.searchQuery, // 如果是关键词搜索，不传原始搜索词
        sort: this.data.sortOptions[this.data.sortIndex].value,
        order: this.data.orderOptions[this.data.orderIndex].value,
        page: this.data.currentPage,
        limit: 100 // 加载更多数据以便前端筛选
      }

      const result = await api.getCities(params)
      let cities = result.cities || []

      // 应用地区筛选（国内/国际）
      cities = cities.filter(city => {
        const isInternational = city.country && city.country !== '中国'
        if (this.data.regionFilter === 'domestic') {
          return !isInternational
        } else if (this.data.regionFilter === 'international') {
          return isInternational
        }
        return true
      })

      // 应用场景筛选
      if (this.data.activeScenario) {
        cities = cities.filter(city => {
          switch (this.data.activeScenario) {
            case 'nomad': // 数字游民：就业机会好、生活成本适中
              return (city.employment || 0) >= 6 && (city.living_cost || 0) <= 7
            case 'vacation': // 避暑避寒：空气好、气候宜人
              return (city.air_quality || 0) >= 7
            case 'retirement': // 康养退休：医疗好、空气好、养老友好
              return (city.elderly_care || 0) >= 6 && (city.medical_facilities || 0) >= 6
            default:
              return true
          }
        })
      }

      // 应用标签筛选
      if (this.data.activeTag !== 'all') {
        cities = cities.filter(city => {
          switch (this.data.activeTag) {
            case 'elderly':
              return (city.elderly_care || 0) >= 7
            case 'young':
              return (city.employment || 0) >= 6
            case 'costEffective':
              return (city.living_cost || 0) <= 5 && (city.overall_score || 0) >= 60
            case 'airQuality':
              return (city.air_quality || 0) >= 8
            case 'safety':
              return (city.safety || 0) >= 8
            default:
              return true
          }
        })
      }

      // 应用智能搜索关键词筛选
      if (searchConfig && searchConfig.filter) {
        cities = cities.filter(city => {
          for (const [key, minValue] of Object.entries(searchConfig.filter)) {
            if (key === 'living_cost') {
              // 生活成本是反向指标，越低越好
              if ((city[key] || 10) > minValue) return false
            } else {
              if ((city[key] || 0) < minValue) return false
            }
          }
          return true
        })
      }

      // 处理沿海城市关键词（特殊处理）
      if (searchConfig && searchConfig.keywords && searchConfig.keywords.includes('海边')) {
        // 沿海城市名单（可以从后端获取，这里先硬编码）
        const coastalCities = ['青岛', '厦门', '大连', '三亚', '珠海', '深圳', '广州', '上海', '宁波', '福州', '烟台', '威海', '日照', '连云港', '南通', '舟山', '台州', '温州', '汕头', '湛江', '北海', '海口']
        cities = cities.filter(city => coastalCities.includes(city.name))
      }

      // 如果筛选后为空，给出提示
      if (cities.length === 0) {
        util.showToast('没有符合条件的城市，试试其他筛选条件')
      }

      // 处理城市数据
      cities = cities.map(city => {
        const score = city.overall_score || 0
        const emotional = util.getEmotionalScore(score)
        const personality = util.getCityPersonality(city)
        const isInternational = city.country && city.country !== '中国'
        const topDimensions = util.getTopDimensions(city)
        const semanticTags = util.getSemanticTags(city)
        const coverImage = util.getCityImage(city.name)
        const isFavorite = this.data.favorites.includes(city.id)
        const isComparing = this.data.compareCities.some(c => c.id === city.id)

        return {
          ...city,
          stars: util.createStars(city.avg_rating || 0),
          avg_rating: city.avg_rating ? city.avg_rating.toFixed(1) : null,
          emotionalLevel: emotional.level,
          emotionalGradient: emotional.gradient,
          emotionalColor: emotional.color,
          emoji: emotional.emoji,
          personality,
          isInternational,
          locationText: isInternational ? city.country : city.province,
          cardStyle: `background: ${emotional.gradient};`,
          topDimensions,
          semanticTags,
          coverImage,
          isFavorite,
          isComparing
        }
      })

      // 前端分页
      const totalPages = Math.ceil(cities.length / this.data.limit)
      const start = (this.data.currentPage - 1) * this.data.limit
      const end = start + this.data.limit
      const pagedCities = cities.slice(start, end)

      this.setData({
        cities: pagedCities,
        totalPages: totalPages || 1,
        loading: false
      })
    } catch (error) {
      console.error('加载城市列表失败:', error)
      util.showToast('加载失败，请重试')
      this.setData({ loading: false })
    }
  },

  // 国内/国际切换
  onRegionTap(e) {
    const region = e.currentTarget.dataset.region
    this.setData({
      regionFilter: region,
      currentPage: 1
    })
    this.loadCities()
  },

  // 场景切换
  onScenarioTap(e) {
    const scenario = e.currentTarget.dataset.scenario

    // 如果点击同一个场景，取消选择
    const newScenario = this.data.activeScenario === scenario ? '' : scenario

    this.setData({
      activeScenario: newScenario,
      currentPage: 1
    })

    this.loadCities()
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({
      searchQuery: e.detail.value
    })
  },

  // 搜索确认
  onSearchConfirm() {
    this.setData({ currentPage: 1 })
    this.loadCities()
  },

  // 清空搜索
  onClearSearch() {
    this.setData({
      searchQuery: '',
      currentPage: 1
    })
    this.loadCities()
  },

  // 排序变化
  onSortChange(e) {
    this.setData({
      sortIndex: e.detail.value,
      currentPage: 1
    })
    this.loadCities()
  },

  // 排序方向变化
  onOrderChange(e) {
    this.setData({
      orderIndex: e.detail.value,
      currentPage: 1
    })
    this.loadCities()
  },

  // 标签切换
  onTagTap(e) {
    const tagId = e.currentTarget.dataset.id
    const smartTags = this.data.smartTags.map(tag => ({
      ...tag,
      active: tag.id === tagId
    }))

    this.setData({
      smartTags,
      activeTag: tagId,
      currentPage: 1
    })

    this.loadCities()
  },

  // 上一页
  onPrevPage() {
    if (this.data.currentPage > 1) {
      this.setData({
        currentPage: this.data.currentPage - 1
      })
      this.loadCities()
    }
  },

  // 下一页
  onNextPage() {
    if (this.data.currentPage < this.data.totalPages) {
      this.setData({
        currentPage: this.data.currentPage + 1
      })
      this.loadCities()
    }
  },

  // 点击城市卡片
  onCityTap(e) {
    const cityId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/city-detail/city-detail?id=${cityId}`
    })
  },

  // 切换收藏
  onToggleFavorite(e) {
    const cityId = e.currentTarget.dataset.id
    let favorites = [...this.data.favorites]

    if (favorites.includes(cityId)) {
      // 取消收藏
      favorites = favorites.filter(id => id !== cityId)
      util.showToast('已取消收藏')
    } else {
      // 添加收藏
      favorites.push(cityId)
      util.showToast('已收藏', 'success')
    }

    this.setData({ favorites })
    this.saveFavorites()

    // 更新城市列表中的收藏状态
    const cities = this.data.cities.map(city => ({
      ...city,
      isFavorite: favorites.includes(city.id)
    }))

    this.setData({ cities })
  },

  // 切换对比
  onToggleCompare(e) {
    const cityId = e.currentTarget.dataset.id
    const city = this.data.cities.find(c => c.id === cityId)

    if (!city) return

    let compareCities = [...this.data.compareCities]

    if (compareCities.some(c => c.id === cityId)) {
      // 从对比篮子移除
      compareCities = compareCities.filter(c => c.id !== cityId)
    } else {
      // 添加到对比篮子（最多3个）
      if (compareCities.length >= 3) {
        util.showToast('最多只能对比3个城市')
        return
      }
      compareCities.push(city)
    }

    this.setData({ compareCities })

    // 更新城市列表中的对比状态
    const cities = this.data.cities.map(c => ({
      ...c,
      isComparing: compareCities.some(cc => cc.id === c.id)
    }))

    this.setData({ cities })
  },

  // 开始对比
  onCompareNow() {
    if (this.data.compareCities.length < 2) {
      util.showToast('请至少选择两个城市')
      return
    }

    const ids = this.data.compareCities.map(c => c.id).join(',')
    wx.navigateTo({
      url: `/pages/city-compare/city-compare?ids=${ids}`
    })
  },

  // 清空对比篮子
  onClearCompare() {
    this.setData({ compareCities: [] })

    // 更新城市列表中的对比状态
    const cities = this.data.cities.map(c => ({
      ...c,
      isComparing: false
    }))

    this.setData({ cities })
  },

  // 获取维度颜色
  getDimensionColor(value) {
    return util.getDimensionColor(value || 0)
  }
})
