// pages/city-compare/city-compare.js
const api = require('../../utils/api')
const util = require('../../utils/util')

Page({
  data: {
    cityType: 'china', // china 或 world
    allCities: [],
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
    if (this.data.allCities.length > 0) {
      this.filterCitiesByType()
    }
  },

  // 加载可用城市
  async loadCities() {
    this.setData({ loading: true })

    try {
      const result = await api.getCities({ limit: 1000, sort: 'overall_score', order: 'DESC' })

      const cities = (result.cities || []).map(city => ({
        ...city,
        selected: false
      }))

      this.setData({
        allCities: cities,
        loading: false
      })

      this.filterCitiesByType()
    } catch (error) {
      console.error('加载城市列表失败:', error)
      util.showToast('加载失败，请重试')
      this.setData({ loading: false })
    }
  },

  // 根据类型筛选城市
  filterCitiesByType() {
    const { cityType, allCities, selectedCities } = this.data

    let filtered = allCities.filter(city => {
      if (cityType === 'china') {
        return city.country === '中国' || !city.country || city.country === 'null'
      } else {
        return city.country && city.country !== '中国' && city.country !== 'null'
      }
    })

    // 保持已选中的状态
    filtered = filtered.map(city => ({
      ...city,
      selected: selectedCities.includes(city.id)
    }))

    this.setData({
      availableCities: filtered
    })
  },

  // 切换标签
  onTabChange(e) {
    const type = e.currentTarget.dataset.type
    this.setData({ cityType: type })
    this.filterCitiesByType()
  },

  // 选择城市
  onCitySelect(e) {
    const cityId = parseInt(e.currentTarget.dataset.id)
    const cities = [...this.data.availableCities]
    const selectedCities = [...this.data.selectedCities]

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
    let newSelectedCities
    if (isSelected) {
      newSelectedCities = selectedCities.filter(id => id !== cityId)
    } else {
      newSelectedCities = [...selectedCities, cityId]
    }

    // 同步更新allCities中的选中状态
    const allCities = this.data.allCities.map(city => {
      if (city.id === cityId) {
        return { ...city, selected: !isSelected }
      }
      return city
    })

    this.setData({
      allCities: allCities,
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
