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
      const cities = (result.cities || []).map(city => ({
        ...city,
        stars: util.createStars(city.avg_rating || 0),
        avg_rating: city.avg_rating ? city.avg_rating.toFixed(1) : null
      }))

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
  }
})
