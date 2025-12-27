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
    orderIndex: 0
  },

  onLoad() {
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
          // 为卡片背景预计算渐变样式
          cardStyle: `background: ${emotional.gradient};`
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

  // 搜索输入
  onSearchInput(e) {
    this.setData({
      searchQuery: e.detail.value
    })
  },

  // 搜索确认
  onSearchConfirm() {
    this.setData({
      currentPage: 1
    })
    this.loadCities()
  },

  // 清除搜索
  onClearSearch() {
    this.setData({
      searchQuery: '',
      currentPage: 1
    })
    this.loadCities()
  },

  // 排序改变
  onSortChange(e) {
    this.setData({
      sortIndex: parseInt(e.detail.value),
      currentPage: 1
    })
    this.loadCities()
  },

  // 排序方向改变
  onOrderChange(e) {
    this.setData({
      orderIndex: parseInt(e.detail.value),
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
      wx.pageScrollTo({
        scrollTop: 0,
        duration: 300
      })
    }
  },

  // 下一页
  onNextPage() {
    if (this.data.currentPage < this.data.totalPages) {
      this.setData({
        currentPage: this.data.currentPage + 1
      })
      this.loadCities()
      wx.pageScrollTo({
        scrollTop: 0,
        duration: 300
      })
    }
  },

  // 点击城市卡片
  onCityTap(e) {
    const cityId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/city-detail/city-detail?id=${cityId}`
    })
  },

  // 获取维度颜色
  getDimensionColor(value) {
    return util.getDimensionColor(value || 0)
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
          cardStyle: `background: ${emotional.gradient};`
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
  }
})
