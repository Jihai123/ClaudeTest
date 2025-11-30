// API客户端
class API {
  constructor() {
    // 自动检测基础路径 - 支持 nginx 代理环境
    const pathname = window.location.pathname;
    const href = window.location.href;
    const pathPrefix = (pathname.includes('/livablecities') || href.includes('/livablecities')) ? '/livablecities' : '';
    this.baseURL = `${pathPrefix}/api`;
    this.token = localStorage.getItem('token');
  }

  // 设置认证令牌
  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  // 获取headers
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  // 通用请求方法
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers
      }
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        // 处理后端返回的错误信息
        let errorMessage = '请求失败';

        // 处理 errors 数组格式（如验证错误）
        if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
          errorMessage = data.errors.map(err => err.msg || err.message).join('; ');
        }
        // 处理 error 字符串格式
        else if (data.error) {
          errorMessage = data.error;
        }
        // 处理 message 字段
        else if (data.message) {
          errorMessage = data.message;
        }

        throw new Error(errorMessage);
      }

      return data;
    } catch (error) {
      console.error('API请求失败:', error);
      throw error;
    }
  }

  // GET请求
  get(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = query ? `${endpoint}?${query}` : endpoint;
    return this.request(url, { method: 'GET' });
  }

  // POST请求
  post(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // PUT请求
  put(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  // DELETE请求
  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // ===== 认证相关 =====

  async register(username, email, password) {
    return this.post('/auth/register', { username, email, password });
  }

  async login(username, password) {
    return this.post('/auth/login', { username, password });
  }

  // ===== 城市相关 =====

  async getCities(params = {}) {
    return this.get('/cities', params);
  }

  async getCity(id) {
    return this.get(`/cities/${id}`);
  }

  async createCity(cityData) {
    return this.post('/cities', cityData);
  }

  async updateCityDimensions(id, dimensions) {
    return this.put(`/cities/${id}/dimensions`, dimensions);
  }

  async compareCities(cityIds) {
    return this.post('/cities/compare', { city_ids: cityIds });
  }

  // ===== 评价相关 =====

  async getCityReviews(cityId, params = {}) {
    return this.get(`/reviews/city/${cityId}`, params);
  }

  async createReview(cityId, rating, comment) {
    return this.post('/reviews', { city_id: cityId, rating, comment });
  }

  async updateReview(id, rating, comment) {
    return this.put(`/reviews/${id}`, { rating, comment });
  }

  async deleteReview(id) {
    return this.delete(`/reviews/${id}`);
  }

  async likeReview(id) {
    return this.post(`/reviews/${id}/like`);
  }

  async replyReview(id, content) {
    return this.post(`/reviews/${id}/reply`, { content });
  }

  async getMyReviews() {
    return this.get('/reviews/user/me');
  }

  // ===== 管理员相关 =====

  async getAdminStats() {
    return this.get('/admin/stats');
  }

  async getPendingCities(params = {}) {
    return this.get('/admin/cities/pending', params);
  }

  async reviewCity(id, status) {
    return this.put(`/admin/cities/${id}/review`, { status });
  }

  async deleteCity(id) {
    return this.delete(`/admin/cities/${id}`);
  }

  async getPendingReviews(params = {}) {
    return this.get('/admin/reviews/pending', params);
  }

  async reviewReviewSubmission(id, status) {
    return this.put(`/admin/reviews/${id}/review`, { status });
  }

  async getUsers(params = {}) {
    return this.get('/admin/users', params);
  }

  async updateUserRole(id, role) {
    return this.put(`/admin/users/${id}/role`, { role });
  }
}

// 创建全局API实例
const api = new API();
