// 主应用逻辑

// 全局状态
let currentPage = 1;
let currentSort = 'overall_score';
let currentOrder = 'DESC';
let searchQuery = '';
let allCities = [];
let selectedCitiesForCompare = [];

// DOM元素
const elements = {
  navLinks: document.querySelectorAll('.nav-link'),
  navToggle: document.getElementById('navToggle'),
  navMenu: document.getElementById('navMenu'),
  searchBtn: document.getElementById('searchBtn'),
  searchBox: document.getElementById('searchBox'),
  searchInput: document.getElementById('searchInput'),
  closeSearch: document.getElementById('closeSearch'),
  loginBtn: document.getElementById('loginBtn'),
  registerBtn: document.getElementById('registerBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  loginModal: document.getElementById('loginModal'),
  registerModal: document.getElementById('registerModal'),
  cityModal: document.getElementById('cityModal'),
  closeLoginModal: document.getElementById('closeLoginModal'),
  closeRegisterModal: document.getElementById('closeRegisterModal'),
  closeCityModal: document.getElementById('closeCityModal'),
  loginForm: document.getElementById('loginForm'),
  registerForm: document.getElementById('registerForm'),
  uploadForm: document.getElementById('uploadForm'),
  sortSelect: document.getElementById('sortSelect'),
  orderSelect: document.getElementById('orderSelect'),
  citiesGrid: document.getElementById('citiesGrid'),
  pagination: document.getElementById('pagination'),
  loadingSpinner: document.getElementById('loadingSpinner'),
  compareBtn: document.getElementById('compareBtn'),
  compareSelection: document.getElementById('compareSelection'),
  compareResult: document.getElementById('compareResult')
};

// ===== 工具函数 =====

function showNotification(message, type = 'info') {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.className = `notification ${type} show`;

  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

function formatNumber(num) {
  if (!num) return '0';
  return new Intl.NumberFormat('zh-CN').format(num);
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function createStars(rating) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  let html = '';

  for (let i = 0; i < fullStars; i++) {
    html += '★';
  }
  if (hasHalf) {
    html += '⯪';
  }
  const emptyStars = 5 - Math.ceil(rating);
  for (let i = 0; i < emptyStars; i++) {
    html += '☆';
  }

  return html;
}

// ===== 导航相关 =====

function initNavigation() {
  // 导航链接点击
  elements.navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const href = link.getAttribute('href');
      navigateTo(href);
    });
  });

  // 移动端菜单切换
  elements.navToggle.addEventListener('click', () => {
    elements.navMenu.classList.toggle('show');
  });

  // Hash变化监听
  window.addEventListener('hashchange', handleHashChange);
  handleHashChange();
}

function navigateTo(hash) {
  window.location.hash = hash;
  elements.navMenu.classList.remove('show');
}

function handleHashChange() {
  const hash = window.location.hash || '#home';
  const page = hash.substring(1);

  // 更新导航状态
  elements.navLinks.forEach(link => {
    if (link.getAttribute('href') === hash) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // 显示/隐藏页面
  document.querySelectorAll('.section').forEach(section => {
    section.style.display = 'none';
  });

  const targetSection = document.getElementById(page);
  if (targetSection) {
    targetSection.style.display = 'block';

    // 根据页面加载相应数据
    switch (page) {
      case 'home':
      case 'rankings':
        loadCities();
        loadStats();
        break;
      case 'compare':
        loadCitiesForCompare();
        break;
      case 'my-reviews':
        if (authManager.isLoggedIn()) {
          loadMyReviews();
        } else {
          navigateTo('#home');
          showNotification('请先登录', 'error');
        }
        break;
      case 'admin':
        if (authManager.isAdmin()) {
          loadAdminPanel();
        } else {
          navigateTo('#home');
          showNotification('需要管理员权限', 'error');
        }
        break;
    }
  }
}

// ===== 搜索功能 =====

function initSearch() {
  elements.searchBtn.addEventListener('click', () => {
    elements.searchBox.style.display = 'block';
    elements.searchInput.focus();
  });

  elements.closeSearch.addEventListener('click', () => {
    elements.searchBox.style.display = 'none';
    elements.searchInput.value = '';
    searchQuery = '';
    loadCities();
  });

  elements.searchInput.addEventListener('input', debounce((e) => {
    searchQuery = e.target.value.trim();
    currentPage = 1;
    loadCities();
  }, 500));
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ===== 认证相关 =====

function initAuth() {
  // 登录
  elements.loginBtn.addEventListener('click', () => {
    elements.loginModal.classList.add('show');
  });

  elements.closeLoginModal.addEventListener('click', () => {
    elements.loginModal.classList.remove('show');
  });

  elements.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    const result = await authManager.login(username, password);

    if (result.success) {
      elements.loginModal.classList.remove('show');
      elements.loginForm.reset();
      showNotification('登录成功', 'success');
      handleHashChange(); // 刷新当前页面
    } else {
      showNotification(result.error, 'error');
    }
  });

  // 注册
  elements.registerBtn.addEventListener('click', () => {
    elements.registerModal.classList.add('show');
  });

  elements.closeRegisterModal.addEventListener('click', () => {
    elements.registerModal.classList.remove('show');
  });

  elements.registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('regUsername').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const passwordConfirm = document.getElementById('regPasswordConfirm').value;

    if (password !== passwordConfirm) {
      showNotification('两次密码输入不一致', 'error');
      return;
    }

    const result = await authManager.register(username, email, password);

    if (result.success) {
      elements.registerModal.classList.remove('show');
      elements.registerForm.reset();
      showNotification('注册成功', 'success');
      handleHashChange();
    } else {
      showNotification(result.error, 'error');
    }
  });

  // 退出
  elements.logoutBtn.addEventListener('click', () => {
    authManager.logout();
    handleHashChange();
  });

  // 点击模态框外部关闭
  [elements.loginModal, elements.registerModal, elements.cityModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
      }
    });
  });
}

// ===== 城市列表 =====

async function loadStats() {
  try {
    const data = await api.getCities({ limit: 1000 });
    const cities = data.cities || [];

    document.getElementById('totalCities').textContent = cities.length;

    let totalReviews = 0;
    let totalRating = 0;
    let ratingCount = 0;

    cities.forEach(city => {
      if (city.review_count) {
        totalReviews += city.review_count;
      }
      if (city.avg_rating) {
        totalRating += city.avg_rating;
        ratingCount++;
      }
    });

    document.getElementById('totalReviews').textContent = totalReviews;
    document.getElementById('avgRating').textContent =
      ratingCount > 0 ? (totalRating / ratingCount).toFixed(1) : '0.0';
  } catch (error) {
    console.error('加载统计数据失败:', error);
  }
}

async function loadCities() {
  elements.loadingSpinner.style.display = 'block';
  elements.citiesGrid.innerHTML = '';

  try {
    const data = await api.getCities({
      search: searchQuery,
      sort: currentSort,
      order: currentOrder,
      page: currentPage,
      limit: 12
    });

    allCities = data.cities || [];
    renderCities(allCities);
    renderPagination(data.pagination);
  } catch (error) {
    showNotification('加载城市数据失败', 'error');
  } finally {
    elements.loadingSpinner.style.display = 'none';
  }
}

function renderCities(cities) {
  if (cities.length === 0) {
    elements.citiesGrid.innerHTML = '<p style="text-align:center;padding:2rem;">暂无数据</p>';
    return;
  }

  elements.citiesGrid.innerHTML = cities.map((city, index) => `
    <div class="city-card" onclick="showCityDetails(${city.id})">
      <div class="city-header">
        <div>
          <div class="city-name">${city.name}</div>
          <div class="city-province">${city.province || '未知省份'}</div>
        </div>
        <div class="city-score">${city.overall_score || 0}</div>
      </div>
      <div class="city-dimensions">
        <div class="dimension-item">
          <span class="dimension-label">生活成本</span>
          <span class="dimension-value">${city.living_cost || 0}</span>
        </div>
        <div class="dimension-item">
          <span class="dimension-label">空气质量</span>
          <span class="dimension-value">${city.air_quality || 0}</span>
        </div>
        <div class="dimension-item">
          <span class="dimension-label">医疗设施</span>
          <span class="dimension-value">${city.medical_facilities || 0}</span>
        </div>
        <div class="dimension-item">
          <span class="dimension-label">就业机会</span>
          <span class="dimension-value">${city.employment || 0}</span>
        </div>
        <div class="dimension-item">
          <span class="dimension-label">安全指数</span>
          <span class="dimension-value">${city.safety || 0}</span>
        </div>
        <div class="dimension-item">
          <span class="dimension-label">适合养老</span>
          <span class="dimension-value">${city.elderly_care || 0}</span>
        </div>
      </div>
      <div class="city-footer">
        <div class="city-reviews">${city.review_count || 0} 条评价</div>
        ${city.avg_rating ? `
          <div class="rating-stars">${createStars(city.avg_rating)} ${city.avg_rating.toFixed(1)}</div>
        ` : '<div class="rating-stars">暂无评分</div>'}
      </div>
    </div>
  `).join('');
}

function renderPagination(pagination) {
  if (!pagination) return;

  const { page, pages } = pagination;
  let html = '';

  // 上一页
  html += `<button class="page-btn" ${page === 1 ? 'disabled' : ''} onclick="changePage(${page - 1})">上一页</button>`;

  // 页码
  const maxVisible = 5;
  let start = Math.max(1, page - Math.floor(maxVisible / 2));
  let end = Math.min(pages, start + maxVisible - 1);

  if (end - start + 1 < maxVisible) {
    start = Math.max(1, end - maxVisible + 1);
  }

  if (start > 1) {
    html += `<button class="page-btn" onclick="changePage(1)">1</button>`;
    if (start > 2) html += '<span>...</span>';
  }

  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn ${i === page ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
  }

  if (end < pages) {
    if (end < pages - 1) html += '<span>...</span>';
    html += `<button class="page-btn" onclick="changePage(${pages})">${pages}</button>`;
  }

  // 下一页
  html += `<button class="page-btn" ${page === pages ? 'disabled' : ''} onclick="changePage(${page + 1})">下一页</button>`;

  elements.pagination.innerHTML = html;
}

function changePage(page) {
  currentPage = page;
  loadCities();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== 城市详情 =====

async function showCityDetails(cityId) {
  try {
    const city = await api.getCity(cityId);
    const reviews = await api.getCityReviews(cityId, { limit: 10 });

    elements.cityModalTitle.textContent = city.name;

    const dimensions = [
      { label: '生活成本', value: city.living_cost, color: '#3b82f6' },
      { label: '空气质量', value: city.air_quality, color: '#10b981' },
      { label: '医疗设施', value: city.medical_facilities, color: '#f59e0b' },
      { label: '就业机会', value: city.employment, color: '#8b5cf6' },
      { label: '安全指数', value: city.safety, color: '#ec4899' },
      { label: '适合养老', value: city.elderly_care, color: '#14b8a6' }
    ];

    let html = `
      <div class="city-detail">
        <div class="city-info">
          <div class="info-item"><strong>省份:</strong> ${city.province || '未知'}</div>
          <div class="info-item"><strong>人口:</strong> ${formatNumber(city.population)} 人</div>
          <div class="info-item"><strong>GDP:</strong> ${city.gdp ? formatNumber(city.gdp) + ' 亿元' : '未知'}</div>
          <div class="info-item"><strong>面积:</strong> ${city.area ? formatNumber(city.area) + ' km²' : '未知'}</div>
          <div class="info-item"><strong>综合评分:</strong> ${city.overall_score || 0}</div>
          ${city.review_stats ? `
            <div class="info-item">
              <strong>用户评分:</strong> ${city.review_stats.avg_rating ? city.review_stats.avg_rating.toFixed(1) : '暂无'}
              (${city.review_stats.total_reviews} 条评价)
            </div>
          ` : ''}
        </div>

        <div id="dimensionsChart" style="height: 300px; margin: 2rem 0;"></div>

        <h3 style="margin-top: 2rem; margin-bottom: 1rem;">用户评价</h3>

        ${authManager.isLoggedIn() ? `
          <form id="reviewForm" class="form" style="margin-bottom: 2rem;">
            <div class="form-group">
              <label class="form-label">评分 (1-5星)</label>
              <div style="display: flex; gap: 0.5rem;">
                ${[1, 2, 3, 4, 5].map(i => `
                  <label style="cursor: pointer;">
                    <input type="radio" name="rating" value="${i}" required style="margin-right: 0.25rem;">
                    ${i}星
                  </label>
                `).join('')}
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">评论内容</label>
              <textarea id="reviewComment" class="form-input" rows="4" maxlength="1000"></textarea>
            </div>
            <button type="submit" class="btn btn-primary">提交评价</button>
          </form>
        ` : '<p style="text-align:center;padding:1rem;background:var(--light-bg);border-radius:var(--border-radius);">请登录后评价</p>'}

        <div class="reviews-list">
          ${reviews.reviews && reviews.reviews.length > 0 ? reviews.reviews.map(review => `
            <div class="review-card">
              <div class="review-header">
                <div>
                  <div class="review-author">${review.username}</div>
                  <div class="review-date">${formatDate(review.created_at)}</div>
                </div>
                <div class="review-rating">${createStars(review.rating)} ${review.rating.toFixed(1)}</div>
              </div>
              ${review.comment ? `<div class="review-content">${review.comment}</div>` : ''}
              <div class="review-actions">
                <button class="btn-icon" onclick="likeReview(${review.id}, event)">
                  ${review.user_liked ? '❤️' : '🤍'} ${review.likes || 0}
                </button>
                ${authManager.isLoggedIn() ? `
                  <button class="btn btn-outline" onclick="showReplyForm(${review.id})">回复</button>
                ` : ''}
              </div>
              ${review.replies && review.replies.length > 0 ? `
                <div style="margin-top: 1rem; padding-left: 1rem; border-left: 3px solid var(--border-color);">
                  ${review.replies.map(reply => `
                    <div style="margin-bottom: 0.5rem;">
                      <strong>${reply.username}:</strong> ${reply.content}
                    </div>
                  `).join('')}
                </div>
              ` : ''}
              <div id="replyForm${review.id}" style="display:none; margin-top: 1rem;">
                <textarea id="replyContent${review.id}" class="form-input" rows="2" maxlength="500" placeholder="输入回复内容..."></textarea>
                <div style="margin-top: 0.5rem;">
                  <button class="btn btn-primary" onclick="submitReply(${review.id})">提交回复</button>
                  <button class="btn btn-outline" onclick="hideReplyForm(${review.id})">取消</button>
                </div>
              </div>
            </div>
          `).join('') : '<p style="text-align:center;color:var(--text-secondary);">暂无评价</p>'}
        </div>
      </div>
    `;

    elements.cityModalBody.innerHTML = html;
    elements.cityModal.classList.add('show');

    // 绘制维度图表
    setTimeout(() => {
      const chart = echarts.init(document.getElementById('dimensionsChart'));
      chart.setOption({
        radar: {
          indicator: dimensions.map(d => ({ name: d.label, max: 10 }))
        },
        series: [{
          type: 'radar',
          data: [{
            value: dimensions.map(d => d.value || 0),
            name: city.name,
            areaStyle: { opacity: 0.3 }
          }]
        }]
      });
    }, 100);

    // 评价表单提交
    const reviewForm = document.getElementById('reviewForm');
    if (reviewForm) {
      reviewForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rating = parseFloat(document.querySelector('input[name="rating"]:checked').value);
        const comment = document.getElementById('reviewComment').value.trim();

        try {
          await api.createReview(cityId, rating, comment);
          showNotification('评价提交成功', 'success');
          elements.cityModal.classList.remove('show');
        } catch (error) {
          showNotification(error.message, 'error');
        }
      });
    }
  } catch (error) {
    showNotification('加载城市详情失败', 'error');
  }
}

// 评价相关函数
async function likeReview(reviewId, event) {
  event.stopPropagation();

  if (!authManager.isLoggedIn()) {
    showNotification('请先登录', 'error');
    return;
  }

  try {
    await api.likeReview(reviewId);
    // 重新加载当前城市详情
    showNotification('操作成功', 'success');
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

function showReplyForm(reviewId) {
  document.getElementById(`replyForm${reviewId}`).style.display = 'block';
}

function hideReplyForm(reviewId) {
  document.getElementById(`replyForm${reviewId}`).style.display = 'none';
}

async function submitReply(reviewId) {
  const content = document.getElementById(`replyContent${reviewId}`).value.trim();

  if (!content) {
    showNotification('请输入回复内容', 'error');
    return;
  }

  try {
    await api.replyReview(reviewId, content);
    showNotification('回复成功', 'success');
    hideReplyForm(reviewId);
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

// ===== 城市对比 =====

async function loadCitiesForCompare() {
  try {
    const data = await api.getCities({ limit: 100 });
    const cities = data.cities || [];

    elements.compareSelection.innerHTML = cities.map(city => `
      <label class="city-checkbox">
        <input type="checkbox" value="${city.id}" onchange="toggleCityForCompare(${city.id}, this.checked)">
        <span>${city.name}</span>
      </label>
    `).join('');

    selectedCitiesForCompare = [];
    elements.compareBtn.disabled = true;
  } catch (error) {
    showNotification('加载城市列表失败', 'error');
  }
}

function toggleCityForCompare(cityId, checked) {
  if (checked) {
    if (selectedCitiesForCompare.length >= 5) {
      showNotification('最多选择5个城市', 'error');
      event.target.checked = false;
      return;
    }
    selectedCitiesForCompare.push(cityId);
  } else {
    selectedCitiesForCompare = selectedCitiesForCompare.filter(id => id !== cityId);
  }

  elements.compareBtn.disabled = selectedCitiesForCompare.length < 2;
}

elements.compareBtn.addEventListener('click', async () => {
  try {
    const data = await api.compareCities(selectedCitiesForCompare);
    const cities = data.cities || [];

    renderCompareChart(cities);
    renderCompareTable(cities);

    elements.compareResult.style.display = 'block';
    elements.compareResult.scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    showNotification('对比失败', 'error');
  }
});

function renderCompareChart(cities) {
  const chart = echarts.init(document.getElementById('compareChart'));

  const indicators = [
    { name: '生活成本', key: 'living_cost' },
    { name: '空气质量', key: 'air_quality' },
    { name: '医疗设施', key: 'medical_facilities' },
    { name: '就业机会', key: 'employment' },
    { name: '安全指数', key: 'safety' },
    { name: '适合养老', key: 'elderly_care' }
  ];

  chart.setOption({
    title: { text: '城市多维度对比', left: 'center' },
    legend: { bottom: 0, data: cities.map(c => c.name) },
    radar: {
      indicator: indicators.map(i => ({ name: i.name, max: 10 }))
    },
    series: [{
      type: 'radar',
      data: cities.map(city => ({
        value: indicators.map(i => city[i.key] || 0),
        name: city.name,
        areaStyle: { opacity: 0.2 }
      }))
    }]
  });
}

function renderCompareTable(cities) {
  const dimensions = [
    { label: '综合评分', key: 'overall_score' },
    { label: '生活成本', key: 'living_cost' },
    { label: '空气质量', key: 'air_quality' },
    { label: '医疗设施', key: 'medical_facilities' },
    { label: '就业机会', key: 'employment' },
    { label: '安全指数', key: 'safety' },
    { label: '适合养老', key: 'elderly_care' },
    { label: '人口', key: 'population' },
    { label: 'GDP', key: 'gdp' }
  ];

  let html = `
    <table>
      <thead>
        <tr>
          <th>指标</th>
          ${cities.map(city => `<th>${city.name}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${dimensions.map(dim => `
          <tr>
            <td><strong>${dim.label}</strong></td>
            ${cities.map(city => {
              let value = city[dim.key] || 0;
              if (dim.key === 'population' || dim.key === 'gdp') {
                value = formatNumber(value);
              }
              return `<td>${value}</td>`;
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  document.getElementById('compareTable').innerHTML = html;
}

// ===== 上传城市 =====

function initUploadForm() {
  // 滑块值更新
  const rangeInputs = document.querySelectorAll('.range-input');
  rangeInputs.forEach(input => {
    const valueSpan = document.getElementById(`${input.id}Value`);
    input.addEventListener('input', () => {
      valueSpan.textContent = parseFloat(input.value).toFixed(1);
    });
  });

  // 表单提交
  elements.uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!authManager.isLoggedIn()) {
      showNotification('请先登录', 'error');
      return;
    }

    const cityData = {
      name: document.getElementById('cityName').value.trim(),
      province: document.getElementById('province').value.trim(),
      population: parseInt(document.getElementById('population').value) || null,
      gdp: parseFloat(document.getElementById('gdp').value) || null,
      area: parseFloat(document.getElementById('area').value) || null,
      dimensions: {
        living_cost: parseFloat(document.getElementById('livingCost').value),
        air_quality: parseFloat(document.getElementById('airQuality').value),
        medical_facilities: parseFloat(document.getElementById('medicalFacilities').value),
        employment: parseFloat(document.getElementById('employment').value),
        safety: parseFloat(document.getElementById('safety').value),
        elderly_care: parseFloat(document.getElementById('elderlyCare').value)
      }
    };

    try {
      await api.createCity(cityData);
      showNotification('城市提交成功，等待管理员审核', 'success');
      elements.uploadForm.reset();
      rangeInputs.forEach(input => {
        document.getElementById(`${input.id}Value`).textContent = '5.0';
      });
    } catch (error) {
      showNotification(error.message, 'error');
    }
  });
}

// ===== 我的评价 =====

async function loadMyReviews() {
  try {
    const data = await api.getMyReviews();
    const reviews = data.reviews || [];

    const html = reviews.length > 0 ? reviews.map(review => `
      <div class="review-card">
        <div class="review-header">
          <div>
            <div class="review-author">${review.city_name}</div>
            <div class="review-date">${formatDate(review.created_at)}</div>
          </div>
          <div class="review-rating">${createStars(review.rating)} ${review.rating.toFixed(1)}</div>
        </div>
        ${review.comment ? `<div class="review-content">${review.comment}</div>` : ''}
        <div class="review-actions">
          <span>❤️ ${review.likes || 0}</span>
          <button class="btn btn-outline" onclick="deleteMyReview(${review.id})">删除</button>
        </div>
      </div>
    `).join('') : '<p style="text-align:center;padding:2rem;">您还没有发表过评价</p>';

    document.getElementById('myReviewsList').innerHTML = html;
  } catch (error) {
    showNotification('加载评价失败', 'error');
  }
}

async function deleteMyReview(reviewId) {
  if (!confirm('确定要删除这条评价吗？')) return;

  try {
    await api.deleteReview(reviewId);
    showNotification('删除成功', 'success');
    loadMyReviews();
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

// ===== 管理后台 =====

function initAdmin() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });

      const targetContent = document.getElementById(`${tab}Tab`);
      if (targetContent) {
        targetContent.classList.add('active');
      }

      switch (tab) {
        case 'stats':
          loadAdminStats();
          break;
        case 'pending-cities':
          loadPendingCities();
          break;
        case 'pending-reviews':
          loadPendingReviews();
          break;
        case 'users':
          loadUsers();
          break;
      }
    });
  });
}

async function loadAdminPanel() {
  loadAdminStats();
}

async function loadAdminStats() {
  try {
    const stats = await api.getAdminStats();

    const html = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        <div class="admin-card">
          <h3>城市统计</h3>
          <p>总数: ${stats.cities.total}</p>
          <p>已审核: ${stats.cities.approved}</p>
          <p>待审核: ${stats.cities.pending}</p>
        </div>
        <div class="admin-card">
          <h3>用户统计</h3>
          <p>总数: ${stats.users.total}</p>
          <p>普通用户: ${stats.users.users}</p>
          <p>管理员: ${stats.users.admins}</p>
        </div>
        <div class="admin-card">
          <h3>评价统计</h3>
          <p>总数: ${stats.reviews.total}</p>
          <p>已审核: ${stats.reviews.approved}</p>
          <p>平均评分: ${stats.reviews.avg_rating ? stats.reviews.avg_rating.toFixed(1) : '0.0'}</p>
        </div>
      </div>
    `;

    document.getElementById('statsTab').innerHTML = html;
  } catch (error) {
    showNotification('加载统计数据失败', 'error');
  }
}

async function loadPendingCities() {
  try {
    const data = await api.getPendingCities();
    const cities = data.cities || [];

    const html = cities.length > 0 ? cities.map(city => `
      <div class="admin-card">
        <h3>${city.name} (${city.province || '未知省份'})</h3>
        <p>提交者: ${city.submitted_by || '未知'}</p>
        <p>综合评分: ${city.overall_score}</p>
        <div style="margin-top: 1rem; display: flex; gap: 1rem;">
          <button class="btn btn-success" onclick="reviewCity(${city.id}, 'approved')">通过</button>
          <button class="btn btn-danger" onclick="reviewCity(${city.id}, 'rejected')">拒绝</button>
        </div>
      </div>
    `).join('') : '<p>没有待审核的城市</p>';

    document.getElementById('pendingCitiesTab').innerHTML = html;
  } catch (error) {
    showNotification('加载待审核城市失败', 'error');
  }
}

async function reviewCity(cityId, status) {
  try {
    await api.reviewCity(cityId, status);
    showNotification(status === 'approved' ? '已通过' : '已拒绝', 'success');
    loadPendingCities();
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

async function loadPendingReviews() {
  try {
    const data = await api.getPendingReviews();
    const reviews = data.reviews || [];

    const html = reviews.length > 0 ? reviews.map(review => `
      <div class="admin-card">
        <h3>${review.city_name}</h3>
        <p>用户: ${review.username}</p>
        <p>评分: ${createStars(review.rating)} ${review.rating.toFixed(1)}</p>
        ${review.comment ? `<p>评论: ${review.comment}</p>` : ''}
        <div style="margin-top: 1rem; display: flex; gap: 1rem;">
          <button class="btn btn-success" onclick="reviewReviewSubmission(${review.id}, 'approved')">通过</button>
          <button class="btn btn-danger" onclick="reviewReviewSubmission(${review.id}, 'rejected')">拒绝</button>
        </div>
      </div>
    `).join('') : '<p>没有待审核的评价</p>';

    document.getElementById('pendingReviewsTab').innerHTML = html;
  } catch (error) {
    showNotification('加载待审核评价失败', 'error');
  }
}

async function reviewReviewSubmission(reviewId, status) {
  try {
    await api.reviewReviewSubmission(reviewId, status);
    showNotification(status === 'approved' ? '已通过' : '已拒绝', 'success');
    loadPendingReviews();
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

async function loadUsers() {
  try {
    const data = await api.getUsers();
    const users = data.users || [];

    const html = `
      <table>
        <thead>
          <tr>
            <th>用户名</th>
            <th>邮箱</th>
            <th>角色</th>
            <th>城市数</th>
            <th>评价数</th>
            <th>注册时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(user => `
            <tr>
              <td>${user.username}</td>
              <td>${user.email}</td>
              <td>${user.role === 'admin' ? '管理员' : '普通用户'}</td>
              <td>${user.cities_count || 0}</td>
              <td>${user.reviews_count || 0}</td>
              <td>${formatDate(user.created_at)}</td>
              <td>
                ${user.role === 'user' ? `
                  <button class="btn btn-outline" onclick="changeUserRole(${user.id}, 'admin')">设为管理员</button>
                ` : user.role === 'admin' && user.id !== authManager.getCurrentUser().id ? `
                  <button class="btn btn-outline" onclick="changeUserRole(${user.id}, 'user')">取消管理员</button>
                ` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    document.getElementById('usersTab').innerHTML = html;
  } catch (error) {
    showNotification('加载用户列表失败', 'error');
  }
}

async function changeUserRole(userId, role) {
  try {
    await api.updateUserRole(userId, role);
    showNotification('角色更新成功', 'success');
    loadUsers();
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

// ===== 排序功能 =====

function initSorting() {
  elements.sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    currentPage = 1;
    loadCities();
  });

  elements.orderSelect.addEventListener('change', (e) => {
    currentOrder = e.target.value;
    currentPage = 1;
    loadCities();
  });
}

// ===== 初始化 =====

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSearch();
  initAuth();
  initUploadForm();
  initAdmin();
  initSorting();

  // 关闭城市详情模态框
  elements.closeCityModal.addEventListener('click', () => {
    elements.cityModal.classList.remove('show');
  });
});
