// API服务 - 复用网站数据
const app = getApp()

class API {
  constructor() {
    // API基础地址 - 需要根据实际部署情况配置
    this.baseURL = app.globalData.apiBaseUrl
  }

  // 通用请求方法
  request(url, method = 'GET', data = {}) {
    return new Promise((resolve, reject) => {
      const header = {
        'Content-Type': 'application/json'
      }

      // 添加token
      const token = app.globalData.token
      if (token) {
        header['Authorization'] = `Bearer ${token}`
      }

      wx.request({
        url: `${this.baseURL}${url}`,
        method,
        data,
        header,
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(res.data)
          } else {
            const error = res.data.error || res.data.message || '请求失败'
            reject(new Error(error))
          }
        },
        fail: (err) => {
          reject(err)
        }
      })
    })
  }

  // GET请求
  get(url, params = {}) {
    // 构建查询字符串
    const queryString = Object.keys(params)
      .filter(key => params[key] !== undefined && params[key] !== null)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&')

    const fullUrl = queryString ? `${url}?${queryString}` : url
    return this.request(fullUrl, 'GET')
  }

  // POST请求
  post(url, data = {}) {
    return this.request(url, 'POST', data)
  }

  // PUT请求
  put(url, data = {}) {
    return this.request(url, 'PUT', data)
  }

  // DELETE请求
  delete(url) {
    return this.request(url, 'DELETE')
  }

  // ===== 城市相关API =====

  // 获取城市列表
  getCities(params = {}) {
    return this.get('/cities', params)
  }

  // 获取城市详情
  getCity(id) {
    return this.get(`/cities/${id}`)
  }

  // 创建城市
  createCity(cityData) {
    return this.post('/cities', cityData)
  }

  // 更新城市维度
  updateCityDimensions(id, dimensions) {
    return this.put(`/cities/${id}/dimensions`, dimensions)
  }

  // 对比城市
  compareCities(cityIds) {
    return this.post('/cities/compare', { city_ids: cityIds })
  }

  // ===== 城市图片相关API =====

  // 上传城市印象图片
  uploadCityImage(cityId, imageUrl, altText = '') {
    return this.post('/images/upload', {
      city_id: cityId,
      image_url: imageUrl,
      thumbnail_url: imageUrl,
      alt_text: altText,
      image_type: 'user'
    })
  }

  // ===== 评价相关API =====

  // 获取城市评价
  getCityReviews(cityId, params = {}) {
    return this.get(`/reviews/city/${cityId}`, params)
  }

  // 创建评价（支持图片）
  createReview(cityId, rating, comment, images = []) {
    return this.post('/reviews', {
      city_id: cityId,
      rating,
      comment,
      images: images.length > 0 ? images : undefined
    })
  }

  // 更新评价
  updateReview(id, rating, comment) {
    return this.put(`/reviews/${id}`, { rating, comment })
  }

  // 删除评价
  deleteReview(id) {
    return this.delete(`/reviews/${id}`)
  }

  // 点赞评价
  likeReview(id) {
    return this.post(`/reviews/${id}/like`)
  }

  // 回复评价
  replyReview(id, content) {
    return this.post(`/reviews/${id}/reply`, { content })
  }

  // 获取我的评价
  getMyReviews() {
    return this.get('/reviews/user/me')
  }

  // ===== 认证相关API =====

  // 注册
  register(username, email, password) {
    return this.post('/auth/register', { username, email, password })
  }

  // 登录
  login(username, password) {
    return this.post('/auth/login', { username, password })
  }

  // 微信登录
  wechatLogin(code, userInfo) {
    return this.post('/auth/wechat-login', { code, userInfo })
  }
}

// 导出API实例
module.exports = new API()
