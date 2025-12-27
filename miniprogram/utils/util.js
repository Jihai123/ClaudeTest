// 工具函数

// 格式化数字
const formatNumber = (num) => {
  if (!num) return '0'
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// 格式化日期
const formatDate = (dateString) => {
  const date = new Date(dateString)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${year}年${month}月${day}日`
}

// 格式化时间
const formatTime = (dateString) => {
  const date = new Date(dateString)
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const hour = date.getHours().toString().padStart(2, '0')
  const minute = date.getMinutes().toString().padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

// 创建星星评分
const createStars = (rating) => {
  const fullStars = Math.floor(rating)
  const hasHalf = rating % 1 >= 0.5
  let stars = ''

  for (let i = 0; i < fullStars; i++) {
    stars += '★'
  }
  if (hasHalf) {
    stars += '⯪'
  }
  const emptyStars = 5 - Math.ceil(rating)
  for (let i = 0; i < emptyStars; i++) {
    stars += '☆'
  }

  return stars
}

// 防抖函数
const debounce = (func, wait = 500) => {
  let timeout
  return function(...args) {
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      func.apply(this, args)
    }, wait)
  }
}

// 节流函数
const throttle = (func, wait = 500) => {
  let previous = 0
  return function(...args) {
    const now = Date.now()
    if (now - previous > wait) {
      func.apply(this, args)
      previous = now
    }
  }
}

// 显示提示
const showToast = (title, icon = 'none', duration = 2000) => {
  wx.showToast({
    title,
    icon,
    duration
  })
}

// 显示加载中
const showLoading = (title = '加载中...') => {
  wx.showLoading({
    title,
    mask: true
  })
}

// 隐藏加载
const hideLoading = () => {
  wx.hideLoading()
}

// 确认对话框
const showConfirm = (content, title = '提示') => {
  return new Promise((resolve, reject) => {
    wx.showModal({
      title,
      content,
      success: (res) => {
        if (res.confirm) {
          resolve(true)
        } else {
          resolve(false)
        }
      },
      fail: reject
    })
  })
}

// 复制到剪贴板
const copyToClipboard = (data) => {
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data,
      success: () => {
        showToast('已复制', 'success')
        resolve()
      },
      fail: reject
    })
  })
}

// 获取维度颜色
const getDimensionColor = (value) => {
  if (value >= 8) return '#10b981' // 绿色
  if (value >= 6) return '#f59e0b' // 橙色
  return '#ef4444' // 红色
}

// 获取情绪化评分信息（根据综合评分）
const getEmotionalScore = (score) => {
  if (score >= 85) {
    return {
      level: '非常宜居',
      gradient: 'linear-gradient(135deg, #FFB703 0%, #FFD166 100%)',
      color: '#FFB703',
      emoji: '🌟'
    }
  } else if (score >= 70) {
    return {
      level: '宜居',
      gradient: 'linear-gradient(135deg, #8ECAE6 0%, #BEE7E8 100%)',
      color: '#8ECAE6',
      emoji: '✨'
    }
  } else if (score >= 60) {
    return {
      level: '尚可',
      gradient: 'linear-gradient(135deg, #ADB5BD 0%, #CED4DA 100%)',
      color: '#ADB5BD',
      emoji: '🌤'
    }
  } else {
    return {
      level: '慎选',
      gradient: 'linear-gradient(135deg, #E09F9F 0%, #F1C0C0 100%)',
      color: '#E09F9F',
      emoji: '⚠️'
    }
  }
}

// 生成城市一句话描述（基于维度数据）
const getCityPersonality = (city) => {
  const descriptions = []

  // 判断生活成本
  if (city.living_cost && city.living_cost <= 4) {
    descriptions.push('生活成本低')
  } else if (city.living_cost >= 7) {
    descriptions.push('生活成本较高')
  }

  // 判断空气质量
  if (city.air_quality && city.air_quality >= 8) {
    descriptions.push('空气很好')
  }

  // 判断养老适合度
  if (city.elderly_care && city.elderly_care >= 8) {
    descriptions.push('适合养老')
  }

  // 判断就业机会
  if (city.employment && city.employment >= 7) {
    descriptions.push('就业机会多')
  } else if (city.employment && city.employment <= 4) {
    descriptions.push('节奏慢')
  }

  // 判断安全指数
  if (city.safety && city.safety >= 8) {
    descriptions.push('安全感强')
  }

  // 组合描述
  if (descriptions.length === 0) {
    return '适合生活的城市'
  }

  // 生成不同的句式
  if (descriptions.includes('节奏慢') && descriptions.includes('生活成本低')) {
    return '节奏慢，适合安心过日子'
  }

  if (descriptions.includes('空气很好') && descriptions.includes('适合养老')) {
    return '空气好，很适合养老'
  }

  if (descriptions.includes('生活成本低') && descriptions.includes('空气很好')) {
    return '收入不高，但生活不贵'
  }

  if (descriptions.includes('就业机会多') && descriptions.includes('生活成本较高')) {
    return '机会多，但成本不低'
  }

  // 默认组合前两个特点
  return descriptions.slice(0, 2).join('，')
}

// 获取维度标签
const getDimensionLabel = (key) => {
  const labels = {
    living_cost: '生活成本',
    air_quality: '空气质量',
    medical_facilities: '医疗设施',
    employment: '就业机会',
    safety: '安全指数',
    elderly_care: '适合养老',
    overall_score: '综合评分'
  }
  return labels[key] || key
}

// 保存图片
const saveImage = (url) => {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode === 200) {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => {
              showToast('保存成功', 'success')
              resolve()
            },
            fail: (err) => {
              if (err.errMsg.includes('auth deny')) {
                showToast('请授权保存图片权限')
              }
              reject(err)
            }
          })
        } else {
          reject(new Error('下载失败'))
        }
      },
      fail: reject
    })
  })
}

module.exports = {
  formatNumber,
  formatDate,
  formatTime,
  createStars,
  debounce,
  throttle,
  showToast,
  showLoading,
  hideLoading,
  showConfirm,
  copyToClipboard,
  getDimensionColor,
  getDimensionLabel,
  getEmotionalScore,
  getCityPersonality,
  saveImage
}
