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

    // 构建筛选条件
    const filters = {}

    // 1. 根据预算设置生活成本筛选
    switch (answers.budget) {
      case 'low':
        filters.living_cost_max = 5
        break
      case 'medium':
        filters.living_cost_max = 7
        break
      case 'high':
        // 不限制
        break
      case 'flexible':
        // 不限制
        break
    }

    // 2. 根据目的设置维度筛选
    switch (answers.purpose) {
      case 'work':
        filters.employment_min = 6
        break
      case 'elderly':
        filters.elderly_care_min = 7
        break
      case 'travel':
        filters.air_quality_min = 7
        filters.safety_min = 7
        break
      case 'settle':
        filters.overall_score_min = 75
        break
    }

    // 3. 根据环境偏好设置筛选
    switch (answers.environment) {
      case 'air':
        filters.air_quality_min = 8
        break
      case 'safety':
        filters.safety_min = 8
        break
      case 'climate':
        // 气候舒适度暂时无法精确筛选
        break
      case 'scenery':
        // 自然风光暂时无法精确筛选
        break
    }

    // 4. 根据城市规模设置筛选
    switch (answers.scale) {
      case 'large':
        filters.population_min = 5000000 // 500万以上
        break
      case 'medium':
        filters.population_min = 1000000 // 100万以上
        filters.population_max = 5000000 // 500万以下
        break
      case 'small':
        filters.population_max = 1000000 // 100万以下
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
      filter: JSON.stringify(filters)
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
