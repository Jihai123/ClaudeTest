// miniprogram/pages/review/list.js
const app = getApp();

Page({
  data: {
    cityId: null,
    cityName: '',
    reviews: [],
    sortType: 'latest', // latest, helpful, rating
    page: 1,
    limit: 10,
    hasMore: true,
    loading: false,
    totalReviews: 0,
    avgRating: 0
  },

  onLoad(options) {
    if (options.cityId) {
      this.setData({
        cityId: options.cityId,
        cityName: options.cityName || ''
      });
      this.loadReviews();
      this.loadStats();
    } else {
      wx.showToast({
        title: '缺少城市信息',
        icon: 'error'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  // 加载评价列表
  async loadReviews(reset = true) {
    if (this.data.loading) return;

    if (reset) {
      this.setData({
        page: 1,
        reviews: [],
        hasMore: true
      });
    }

    this.setData({ loading: true });

    try {
      const res = await this.fetchReviews();

      const newReviews = res.reviews.map(review => {
        // 解析images
        if (typeof review.images === 'string') {
          try {
            review.images = JSON.parse(review.images);
          } catch (e) {
            review.images = [];
          }
        }

        // 格式化时间
        review.created_at = this.formatTime(review.created_at);

        return review;
      });

      this.setData({
        reviews: reset ? newReviews : [...this.data.reviews, ...newReviews],
        hasMore: newReviews.length >= this.data.limit,
        page: this.data.page + 1
      });

    } catch (error) {
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
      console.error('加载评价失败:', error);
    } finally {
      this.setData({ loading: false });
    }
  },

  // 获取评价数据
  fetchReviews() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${app.globalData.apiBaseUrl}/reviews/city/${this.data.cityId}`,
        method: 'GET',
        data: {
          sort: this.data.sortType,
          page: this.data.page,
          limit: this.data.limit
        },
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(res.data.data || res.data);
          } else {
            reject(new Error('请求失败'));
          }
        },
        fail: reject
      });
    });
  },

  // 加载统计信息
  async loadStats() {
    try {
      const res = await this.fetchStats();
      this.setData({
        totalReviews: res.total_reviews,
        avgRating: res.avg_rating
      });
    } catch (error) {
      console.error('加载统计失败:', error);
    }
  },

  // 获取统计数据
  fetchStats() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${app.globalData.apiBaseUrl}/reviews/city/${this.data.cityId}/stats`,
        method: 'GET',
        success: (res) => {
          if (res.statusCode === 200 && res.data.success) {
            resolve(res.data.data);
          } else {
            reject(new Error('请求失败'));
          }
        },
        fail: reject
      });
    });
  },

  // 排序切换
  onSortChange(e) {
    const sortType = e.currentTarget.dataset.type;
    if (sortType !== this.data.sortType) {
      this.setData({ sortType });
      this.loadReviews(true);
    }
  },

  // 标记有用
  async onToggleHelpful(e) {
    const reviewId = e.currentTarget.dataset.id;

    try {
      await this.markHelpful(reviewId, true);

      // 更新本地数据
      const reviews = this.data.reviews.map(review => {
        if (review.id === reviewId) {
          return {
            ...review,
            helpful_count: (review.helpful_count || 0) + 1
          };
        }
        return review;
      });

      this.setData({ reviews });

      wx.showToast({
        title: '标记成功',
        icon: 'success'
      });

    } catch (error) {
      wx.showToast({
        title: '操作失败',
        icon: 'error'
      });
      console.error('标记有用失败:', error);
    }
  },

  // 标记有用API
  markHelpful(reviewId, isHelpful) {
    return new Promise((resolve, reject) => {
      const token = wx.getStorageSync('token');
      if (!token) {
        reject(new Error('请先登录'));
        return;
      }

      wx.request({
        url: `${app.globalData.apiBaseUrl}/reviews/${reviewId}/helpful`,
        method: 'POST',
        data: { is_helpful: isHelpful },
        header: {
          'content-type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(res.data);
          } else {
            reject(new Error('请求失败'));
          }
        },
        fail: reject
      });
    });
  },

  // 预览图片
  onPreviewImage(e) {
    const index = e.currentTarget.dataset.index;
    const reviewIndex = e.currentTarget.dataset.reviewIndex;
    const images = this.data.reviews[reviewIndex].images;

    wx.previewImage({
      current: images[index],
      urls: images
    });
  },

  // 跳转到写评价
  goToWrite() {
    wx.navigateTo({
      url: `/pages/review/write?cityId=${this.data.cityId}&cityName=${this.data.cityName}`
    });
  },

  // 跳转到评价详情
  goToDetail(e) {
    const reviewId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/review/detail?id=${reviewId}`
    });
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadReviews(true);
    this.loadStats();
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 1000);
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadReviews(false);
    }
  },

  // 格式化时间
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) {
      return '刚刚';
    } else if (diff < hour) {
      return Math.floor(diff / minute) + '分钟前';
    } else if (diff < day) {
      return Math.floor(diff / hour) + '小时前';
    } else if (diff < 7 * day) {
      return Math.floor(diff / day) + '天前';
    } else {
      return date.toLocaleDateString();
    }
  }
});
