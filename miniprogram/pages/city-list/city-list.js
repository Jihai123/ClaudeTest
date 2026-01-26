// pages/city-list/city-list.js
const api = require('../../utils/api')
const util = require('../../utils/util')

Page({
  data: {
    // 页面信息
    pageTitle: '城市列表',
    isSearchMode: false,
    emptyText: '暂无城市数据',

    // 搜索和筛选
    searchQuery: '',
    filters: {},
    isCoastal: false,
    listType: '',  // 榜单类型: world, china_general, china_layflat

    // 省份/地区筛选
    provinceOptions: [{ name: '全部省份', value: '' }],
    selectedProvince: '',
    selectedProvinceIndex: 0,
    regionOptions: ['全部地区', '华东', '华南', '华北', '西南', '西北', '东北', '华中'],
    selectedRegion: '',
    selectedRegionIndex: 0,

    // 排序
    sortField: 'overall_score',
    sortOrder: 'DESC',

    // 数据
    cities: [],
    totalCount: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false
  },

  onLoad(options) {
    // 解析页面参数
    this.parseOptions(options)

    // 加载省份列表
    this.loadProvinces()

    // 加载城市数据
    this.loadCities(true)
  },

  // 加载省份列表
  async loadProvinces() {
    try {
      const result = await api.getProvinces({ list_type: this.data.listType })
      if (result && result.items) {
        const provinceOptions = [{ name: '全部省份', value: '' }]
        result.items.forEach(p => {
          provinceOptions.push({ name: p, value: p })
        })
        this.setData({ provinceOptions })
      }
    } catch (error) {
      console.error('加载省份列表失败:', error)
    }
  },

  // 解析页面参数
  parseOptions(options) {
    const updates = {}

    // 页面标题
    if (options.title) {
      updates.pageTitle = decodeURIComponent(options.title)
    }

    // 搜索模式
    if (options.search) {
      updates.isSearchMode = true
      updates.searchQuery = decodeURIComponent(options.search)
      updates.pageTitle = '搜索结果'
    }

    // 筛选条件
    if (options.filter) {
      try {
        updates.filters = JSON.parse(decodeURIComponent(options.filter))
      } catch (e) {
        console.error('解析筛选条件失败:', e)
      }
    }

    // 榜单类型
    if (options.list_type) {
      updates.listType = options.list_type
    }

    // 沿海城市
    if (options.coastal === 'true') {
      updates.isCoastal = true
    }

    // 排序
    if (options.sort) {
      updates.sortField = options.sort
    }
    if (options.order) {
      updates.sortOrder = options.order
    }

    // 自定义分页大小（用于显示更多城市）
    if (options.limit) {
      updates.pageSize = parseInt(options.limit) || 20
    }

    this.setData(updates)
  },

  // 加载城市数据
  async loadCities(reset = false) {
    if (this.data.loading) return

    this.setData({ loading: true })

    try {
      // 重置分页
      if (reset) {
        this.setData({
          cities: [],
          page: 1,
          hasMore: true
        })
      }

      // 构建API参数
      const params = {
        page: this.data.page,
        limit: this.data.pageSize,
        sort: this.data.sortField,
        order: this.data.sortOrder
      }

      // 如果指定了榜单类型，添加到参数
      if (this.data.listType) {
        params.list_type = this.data.listType
      }

      // 构建筛选条件
      const filters = { ...this.data.filters }

      // 只有非世界榜才默认显示中国城市
      if (!filters.country && this.data.listType !== 'world') {
        filters.country = '中国'
      }

      // 省份筛选
      if (this.data.selectedProvince) {
        filters.province = this.data.selectedProvince
      }

      // 地区筛选
      if (this.data.selectedRegion) {
        filters.region = this.data.selectedRegion
      }

      // 处理搜索
      if (this.data.searchQuery) {
        const parsedFilters = this.parseSearchKeywords(this.data.searchQuery)

        // 合并关键词筛选
        if (parsedFilters.keywords) {
          params.keywords = parsedFilters.keywords.join(',')
        }

        // 合并数值筛选
        if (parsedFilters.filter) {
          Object.assign(filters, parsedFilters.filter)
        }

        // 合并沿海城市筛选
        if (parsedFilters.coastal) {
          this.setData({ isCoastal: true })
        }
      }

      // 【重构】处理沿海城市 - 使用数据库标签
      if (this.data.isCoastal) {
        filters.coastal = true
      }

      // 添加筛选参数
      if (Object.keys(filters).length > 0) {
        params.filters = JSON.stringify(filters)
      }

      // 调用API
      const result = await api.getCities(params)
      const cities = result.cities || []

      // 处理城市数据
      const processedCities = cities.map(city => this.processCityData(city))

      // 更新数据
      const allCities = reset ? processedCities : [...this.data.cities, ...processedCities]

      this.setData({
        cities: allCities,
        totalCount: result.total || allCities.length,
        hasMore: cities.length >= this.data.pageSize,
        loading: false,
        emptyText: this.data.searchQuery ? `未找到"${this.data.searchQuery}"相关城市` : '暂无符合条件的城市'
      })

    } catch (error) {
      console.error('加载城市列表失败:', error)
      util.showToast('加载失败，请重试')
      this.setData({ loading: false })
    }
  },

  // 解析搜索关键词
  parseSearchKeywords(query) {
    const result = {
      keywords: [],
      filter: {},
      coastal: false
    }

    const keywordMap = {
      // 【重构】沿海城市 - 使用数据库标签
      '看海': { coastal: true },
      '海边': { coastal: true },
      '沿海': { coastal: true },
      // 养老相关
      '养老': { filter: { elderly_care_min: 7 } },
      '退休': { filter: { elderly_care_min: 7 } },
      // 旅居相关
      '旅居': { filter: { air_quality_min: 7, safety_min: 7 } },
      // 成本相关
      '性价比': { filter: { living_cost_max: 5 } },
      '便宜': { filter: { living_cost_max: 5 } },
      '低成本': { filter: { living_cost_max: 5 } },
      // 工作相关
      '数字游民': { filter: { employment_min: 6, living_cost_max: 7 } },
      '远程工作': { filter: { employment_min: 6 } },
      '工作': { filter: { employment_min: 6 } },
      '就业': { filter: { employment_min: 7 } },
      // 环境相关
      '空气好': { filter: { air_quality_min: 8 } },
      '空气': { filter: { air_quality_min: 7 } },
      '安全': { filter: { safety_min: 8 } },
      '适合女生': { filter: { safety_min: 8 } },
      '单身女性': { filter: { safety_min: 9 } }
    }

    // 检查是否匹配关键词
    let matched = false
    for (const [keyword, config] of Object.entries(keywordMap)) {
      if (query.includes(keyword)) {
        if (config.keywords) {
          result.keywords.push(...config.keywords)
        }
        if (config.filter) {
          Object.assign(result.filter, config.filter)
        }
        if (config.coastal) {
          result.coastal = true
        }
        matched = true
        break
      }
    }

    // 如果没有匹配关键词，直接作为城市名搜索
    if (!matched) {
      result.keywords = [query]
    }

    return result
  },

  // 处理城市数据
  processCityData(city) {
    // 根据榜单类型选择正确的评分
    let score = city.overall_score || 0
    let scoreLabel = '综合评分'

    if (this.data.listType === 'world' || city.list_type === 'world') {
      score = city.world_score || city.overall_score || 0
      scoreLabel = '宜居指数'
    } else if (this.data.listType === 'china_layflat' || city.list_type === 'china_layflat') {
      score = city.layflat_score || city.overall_score || 0
      scoreLabel = '躺平指数'
    }

    const emotional = util.getEmotionalScore(score)

    // 获取前2个标签
    const topDimensions = util.getTopDimensions(city)
    let mainTag = topDimensions.length > 0 ? topDimensions[0].label : '宜居城市'
    const secondTag = topDimensions.length > 1 ? topDimensions[1].label : ''

    // 躺平榜显示月租金
    if ((this.data.listType === 'china_layflat' || city.list_type === 'china_layflat') && city.avg_rent) {
      mainTag = `月租${city.avg_rent}元`
    }

    return {
      ...city,
      display_score: score.toFixed(1),
      overall_score: score.toFixed(0),
      scoreLabel,
      emoji: emotional.emoji,
      mainTag,
      secondTag,
      location: city.province || city.country || ''
    }
  },

  // ================================
  // 搜索功能
  // ================================

  onSearchInput(e) {
    this.setData({
      searchQuery: e.detail.value
    })
  },

  onSearchConfirm() {
    this.loadCities(true)
  },

  onClearSearch() {
    this.setData({
      searchQuery: ''
    })
    this.loadCities(true)
  },

  // ================================
  // 排序功能
  // ================================

  onSortChange(e) {
    const field = e.currentTarget.dataset.field
    let order = 'DESC'

    // 如果点击的是当前排序字段，切换排序方向
    if (this.data.sortField === field) {
      order = this.data.sortOrder === 'DESC' ? 'ASC' : 'DESC'
    }

    this.setData({
      sortField: field,
      sortOrder: order
    })

    this.loadCities(true)
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

  // 加载更多
  onLoadMore() {
    if (!this.data.hasMore || this.data.loading) return

    this.setData({
      page: this.data.page + 1
    })

    this.loadCities(false)
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadCities(true).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // ================================
  // 省份/地区筛选
  // ================================

  // 省份选择变化
  onProvinceChange(e) {
    const index = parseInt(e.detail.value)
    const province = this.data.provinceOptions[index]
    this.setData({
      selectedProvinceIndex: index,
      selectedProvince: province ? province.value : ''
    })
    this.loadCities(true)
  },

  // 地区选择变化
  onRegionChange(e) {
    const index = parseInt(e.detail.value)
    const region = index === 0 ? '' : this.data.regionOptions[index]
    this.setData({
      selectedRegionIndex: index,
      selectedRegion: region
    })
    this.loadCities(true)
  },

  // 清除筛选
  onClearFilters() {
    this.setData({
      selectedProvince: '',
      selectedProvinceIndex: 0,
      selectedRegion: '',
      selectedRegionIndex: 0
    })
    this.loadCities(true)
  }
})
