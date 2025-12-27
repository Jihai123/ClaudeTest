// pages/city-compare/city-compare.js
const api = require('../../utils/api')
const util = require('../../utils/util')

Page({
  data: {
    availableCities: [],
    selectedCities: [],
    compareResult: [],
    loading: false,
    colors: ['#667eea', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6']
  },

  onLoad() {
    this.loadCities()
  },

  onShow() {
    // 页面显示时刷新
    if (this.data.availableCities.length > 0) {
      this.loadCities()
    }
  },

  // 加载可用城市
  async loadCities() {
    this.setData({ loading: true })

    try {
      const result = await api.getCities({ limit: 100, sort: 'overall_score', order: 'DESC' })

      const cities = (result.cities || []).map(city => ({
        ...city,
        selected: false
      }))

      this.setData({
        availableCities: cities,
        loading: false
      })
    } catch (error) {
      console.error('加载城市列表失败:', error)
      util.showToast('加载失败，请重试')
      this.setData({ loading: false })
    }
  },

  // 选择城市
  onCitySelect(e) {
    const cityId = parseInt(e.currentTarget.dataset.id)
    const cities = this.data.availableCities
    const selectedCities = this.data.selectedCities

    const index = cities.findIndex(c => c.id === cityId)
    if (index === -1) return

    const isSelected = cities[index].selected

    // 检查是否超过最大选择数
    if (!isSelected && selectedCities.length >= 5) {
      util.showToast('最多选择5个城市')
      return
    }

    // 更新选中状态
    cities[index].selected = !isSelected

    // 更新已选城市列表
    const newSelectedCities = isSelected
      ? selectedCities.filter(id => id !== cityId)
      : [...selectedCities, cityId]

    this.setData({
      availableCities: cities,
      selectedCities: newSelectedCities
    })
  },

  // 开始对比
  async onCompare() {
    if (this.data.selectedCities.length < 2) {
      util.showToast('请至少选择2个城市')
      return
    }

    util.showLoading('对比中...')

    try {
      const result = await api.compareCities(this.data.selectedCities)

      const compareResult = (result.cities || []).map((city, index) => {
        const color = this.data.colors[index % this.data.colors.length]
        return {
          ...city,
          color,
          barStyle: `width: ${(city.overall_score || 0) * 10}%; background-color: ${color}`,
          population_text: city.population ? util.formatNumber(city.population) : '未知',
          gdp_text: city.gdp ? `${util.formatNumber(city.gdp)}亿` : '未知'
        }
      })

      this.setData({
        compareResult
      })

      util.hideLoading()

      // 滚动到结果区域
      wx.pageScrollTo({
        selector: '.result-section',
        duration: 300
      })
    } catch (error) {
      util.hideLoading()
      util.showToast(error.message || '对比失败')
    }
  },

  // 分享
  onShareAppMessage() {
    const cityNames = this.data.compareResult.map(c => c.name).join('、')
    return {
      title: `${cityNames}城市对比`,
      path: '/pages/city-compare/city-compare'
    }
  }
})
