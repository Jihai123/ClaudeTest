// 认证管理
class AuthManager {
  constructor() {
    this.currentUser = null;
    this.init();
  }

  // 初始化
  init() {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (token && userStr) {
      try {
        this.currentUser = JSON.parse(userStr);
        this.updateUI();
      } catch (error) {
        this.logout();
      }
    }
  }

  // 登录
  async login(username, password) {
    try {
      const data = await api.login(username, password);
      this.currentUser = data.user;
      api.setToken(data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      this.updateUI();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 注册
  async register(username, email, password) {
    try {
      const data = await api.register(username, email, password);
      this.currentUser = data.user;
      api.setToken(data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      this.updateUI();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 退出登录
  logout() {
    this.currentUser = null;
    api.setToken(null);
    localStorage.removeItem('user');
    this.updateUI();
    showNotification('已退出登录', 'info');

    // 如果在需要登录的页面，跳转到首页
    const hash = window.location.hash;
    if (hash === '#my-reviews' || hash === '#admin') {
      window.location.hash = '#home';
    }
  }

  // 检查是否登录
  isLoggedIn() {
    return this.currentUser !== null;
  }

  // 检查是否为管理员
  isAdmin() {
    return this.currentUser && this.currentUser.role === 'admin';
  }

  // 更新UI
  updateUI() {
    const authButtons = document.getElementById('authButtons');
    const userMenu = document.getElementById('userMenu');
    const myReviewsNav = document.getElementById('myReviewsNav');
    const adminNav = document.getElementById('adminNav');

    if (this.isLoggedIn()) {
      authButtons.style.display = 'none';
      userMenu.style.display = 'flex';
      document.getElementById('username').textContent = this.currentUser.username;
      myReviewsNav.style.display = 'block';

      if (this.isAdmin()) {
        adminNav.style.display = 'block';
      } else {
        adminNav.style.display = 'none';
      }
    } else {
      authButtons.style.display = 'flex';
      userMenu.style.display = 'none';
      myReviewsNav.style.display = 'none';
      adminNav.style.display = 'none';
    }
  }

  // 获取当前用户
  getCurrentUser() {
    return this.currentUser;
  }
}

// 创建全局认证管理器实例
const authManager = new AuthManager();
