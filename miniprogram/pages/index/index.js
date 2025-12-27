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

  // 加载城市列表
  async loadCities() {
    this.setData({ loading: true })

    try {
      const params = {
        search: this.data.searchQuery,
        sort: this.data.sortOptions[this.data.sortIndex].value,
        order: this.data.orderOptions[this.data.orderIndex].value,
        page: this.data.currentPage,
        limit: this.data.limit
      }

      const result = await api.getCities(params)

      // 处理城市数据
      const cities = (result.cities || []).map(city => {
        const score = city.overall_score || 0
        const emotional = util.getEmotionalScore(score)
        const personality = util.getCityPersonality(city)
        const isInternational = city.country && city.country !== '中国'

        // 动态指标（只显示前3名且>0的）
        const topDimensions = util.getTopDimensions(city)

        // 语义化标签
        const semanticTags = util.getSemanticTags(city)

        // 城市封面图
        const coverImage = util.getCityImage(city.name)

        // 是否已收藏
        const isFavorite = this.data.favorites.includes(city.id)

        // 是否在对比篮子中
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

      this.setData({
        cities,
        totalPages: result.pagination ? result.pagination.pages : 1,
        loading: false
      })
    } catch (error) {
      console.error('加载城市列表失败:', error)
      util.showToast('加载失败，请重试')
      this.setData({ loading: false })
    }
  },

  // 场景切换
  onScenarioTap(e) {
    const scenario = e.currentTarget.dataset.scenario

    // 如果点击同一个场景，取消选择
    const newScenario = this.data.activeScenario === scenario ? '' : scenario

    this.setData({
      activeScenario: newScenario
    })

    // 根据场景筛选城市
    this.filterByScenario(newScenario)
  },

  // 根据场景筛选
  filterByScenario(scenario) {
    // 重置标签
    const smartTags = this.data.smartTags.map(tag => ({
      ...tag,
      active: tag.id === 'all'
    }))

    this.setData({
      smartTags,
      activeTag: 'all',
      currentPage: 1
    })

    // 根据场景设置筛选条件
    // TODO: 可以扩展为根据不同场景调用不同的API参数
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

    this.filterCitiesByTag()
  },

  // 根据标签筛选城市
  filterCitiesByTag() {
    const tagId = this.data.activeTag

    // 如果是"全部"标签，正常加载
    if (tagId === 'all') {
      this.loadCities()
      return
    }

    // 根据标签类型筛选
    this.setData({ loading: true })

    api.getCities({
      search: this.data.searchQuery,
      sort: this.data.sortOptions[this.data.sortIndex].value,
      order: this.data.orderOptions[this.data.orderIndex].value,
      page: this.data.currentPage,
      limit: this.data.limit
    }).then(result => {
      let cities = result.cities || []

      // 根据标签筛选
      cities = cities.filter(city => {
        switch (tagId) {
          case 'elderly':
            return (city.elderly_care || 0) >= 7
          case 'young':
            return (city.employment || 0) >= 7 && (city.living_cost || 0) <= 6
          case 'costEffective':
            return (city.living_cost || 0) <= 5 && (city.overall_score || 0) >= 65
          case 'airQuality':
            return (city.air_quality || 0) >= 8
          case 'safety':
            return (city.safety || 0) >= 8
          default:
            return true
        }
      })

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

      this.setData({
        cities,
        totalPages: Math.ceil(cities.length / this.data.limit),
        loading: false
      })
    }).catch(error => {
      console.error('筛选城市失败:', error)
      util.showToast('筛选失败，请重试')
      this.setData({ loading: false })
    })
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
