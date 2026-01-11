// pages/recommend/recommend.js
Page({
  data: {
    // 问题选项
    budgetOptions: [
      { value: 'low', label: '经济实惠', icon: '💰' },
      { value: 'medium', label: '中等预算', icon: '💵' },
      { value: 'high', label: '预算充足', icon: '💎' },
      { value: 'flexible', label: '预算灵活', icon: '🌟' }
    ],

    purposeOptions: [
      { value: 'work', label: '工作发展', icon: '💼' },
      { value: 'elderly', label: '养老退休', icon: '👵' },
      { value: 'travel', label: '旅居体验', icon: '🎒' },
      { value: 'settle', label: '长期定居', icon: '🏡' }
    ],

    environmentOptions: [
      { value: 'air', label: '空气质量', icon: '🌿' },
      { value: 'safety', label: '治安安全', icon: '🛡️' },
      { value: 'climate', label: '气候舒适', icon: '☀️' },
      { value: 'scenery', label: '自然风光', icon: '🏞️' }
    ],

    scaleOptions: [
      { value: 'large', label: '一线大城市', icon: '🏙️' },
      { value: 'medium', label: '二三线城市', icon: '🌆' },
      { value: 'small', label: '小城慢生活', icon: '🏘️' },
      { value: 'any', label: '都可以', icon: '🌍' }
    ],

    // 用户答案
    answers: {
      budget: '',
      purpose: '',
      environment: '',
      scale: ''
    },

    // 是否可以生成推荐
    canRecommend: false
  },

  // 选择选项
  onSelectOption(e) {
    const { question, value } = e.currentTarget.dataset

    // 更新答案
    const answers = { ...this.data.answers }
    answers[question] = value

    // 检查是否所有问题都已回答
    const canRecommend = Object.values(answers).every(answer => answer !== '')

    this.setData({
      answers,
      canRecommend
    })
  },

  // 生成推荐
  onGenerateRecommendation() {
    if (!this.data.canRecommend) {
      return
    }

    const { answers } = this.data

    // 构建筛选条件和排序
    const filters = {}
    let sort = 'overall_score'  // 默认排序
    let order = 'DESC'
    let listType = ''  // 默认不限榜单类型

    // 1. 根据预算设置 - 影响榜单类型和排序
    switch (answers.budget) {
      case 'low':
        // 低预算优先躺平榜，按月租排序
        listType = 'china_layflat'
        sort = 'avg_rent'
        order = 'ASC'
        break
      case 'medium':
        // 中等预算，按生活成本排序
        sort = 'living_cost'
        order = 'ASC'
        break
      case 'high':
      case 'flexible':
        // 高预算/灵活，按综合评分
        sort = 'overall_score'
        order = 'DESC'
        break
    }

    // 2. 根据目的设置排序优先级
    switch (answers.purpose) {
      case 'work':
        sort = 'employment'
        order = 'DESC'
        break
      case 'elderly':
        sort = 'elderly_care'
        order = 'DESC'
        break
      case 'travel':
        sort = 'air_quality'
        order = 'DESC'
        break
      case 'settle':
        sort = 'overall_score'
        order = 'DESC'
        break
    }

    // 3. 根据环境偏好可能覆盖排序
    switch (answers.environment) {
      case 'air':
        sort = 'air_quality'
        order = 'DESC'
        break
      case 'safety':
        sort = 'safety'
        order = 'DESC'
        break
      case 'climate':
        // 气候舒适度使用climate_score
        sort = 'climate'
        order = 'DESC'
        break
      case 'scenery':
        // 自然风光相关，保持原排序
        break
    }

    // 4. 根据城市规模设置城市等级筛选（使用city_tier代替population）
    switch (answers.scale) {
      case 'large':
        // 一线/新一线城市
        filters.tier = '一线'
        break
      case 'medium':
        // 二三线城市
        filters.tier = '二线'
        break
      case 'small':
        // 小城市，优先躺平榜
        if (!listType) {
          listType = 'china_layflat'
        }
        break
      case 'any':
        // 不限制
        break
    }

    // 构建页面标题
    const titles = {
      work: '适合工作发展的城市',
      elderly: '适合养老的城市',
      travel: '适合旅居的城市',
      settle: '适合长期定居的城市'
    }

    const title = titles[answers.purpose] || '推荐城市'

    // 跳转到城市列表页
    const params = {
      title: title,
      sort: sort,
      order: order,
      limit: 500  // 获取足够多的城市
    }

    if (listType) {
      params.list_type = listType
    }

    if (Object.keys(filters).length > 0) {
      params.filter = JSON.stringify(filters)
    }

    const queryString = Object.keys(params)
      .map(key => `${key}=${encodeURIComponent(params[key])}`)
      .join('&')

    wx.navigateTo({
      url: `/pages/city-list/city-list?${queryString}`
    })
  },

  // 重置问卷
  onReset() {
    this.setData({
      answers: {
        budget: '',
        purpose: '',
        environment: '',
        scale: ''
      },
      canRecommend: false
    })
  }
})
