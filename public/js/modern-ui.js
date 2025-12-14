/**
 * 宜居城市指南 - 现代化 UI 交互脚本
 * 功能: 滚动动画、主题切换、筛选、搜索、动画效果等
 */

// ==================== 工具函数 ====================
const Utils = {
    // 防抖函数
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // 节流函数
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    // 获取元素
    $(selector) {
        return document.querySelector(selector);
    },

    $$(selector) {
        return document.querySelectorAll(selector);
    },

    // 添加类
    addClass(el, className) {
        if (el) el.classList.add(className);
    },

    // 移除类
    removeClass(el, className) {
        if (el) el.classList.remove(className);
    },

    // 切换类
    toggleClass(el, className) {
        if (el) el.classList.toggle(className);
    },

    // 判断是否有类
    hasClass(el, className) {
        return el ? el.classList.contains(className) : false;
    },

    // 动画帧请求
    animate(callback) {
        requestAnimationFrame(callback);
    }
};

// ==================== 导航栏管理 ====================
class NavbarManager {
    constructor() {
        this.navbar = Utils.$('.navbar');
        this.navToggle = Utils.$('#navToggle');
        this.navMenu = Utils.$('#navMenu');
        this.lastScroll = 0;

        this.init();
    }

    init() {
        if (!this.navbar) return;

        // 滚动效果
        window.addEventListener('scroll', Utils.throttle(() => {
            this.handleScroll();
        }, 100));

        // 移动端菜单切换
        if (this.navToggle && this.navMenu) {
            this.navToggle.addEventListener('click', () => {
                this.toggleMenu();
            });

            // 点击菜单项后关闭菜单
            Utils.$$('.nav-link').forEach(link => {
                link.addEventListener('click', () => {
                    this.closeMenu();
                });
            });

            // 点击外部关闭菜单
            document.addEventListener('click', (e) => {
                if (!this.navMenu.contains(e.target) && !this.navToggle.contains(e.target)) {
                    this.closeMenu();
                }
            });
        }
    }

    handleScroll() {
        const currentScroll = window.pageYOffset;

        if (currentScroll > 50) {
            Utils.addClass(this.navbar, 'scrolled');
        } else {
            Utils.removeClass(this.navbar, 'scrolled');
        }

        this.lastScroll = currentScroll;
    }

    toggleMenu() {
        Utils.toggleClass(this.navMenu, 'active');
        this.updateToggleIcon();
    }

    closeMenu() {
        Utils.removeClass(this.navMenu, 'active');
        this.updateToggleIcon();
    }

    updateToggleIcon() {
        const spans = this.navToggle.querySelectorAll('span');
        if (Utils.hasClass(this.navMenu, 'active')) {
            spans[0].style.transform = 'rotate(45deg) translateY(8px)';
            spans[1].style.opacity = '0';
            spans[2].style.transform = 'rotate(-45deg) translateY(-8px)';
        } else {
            spans.forEach(span => {
                span.style.transform = '';
                span.style.opacity = '';
            });
        }
    }
}

// ==================== 主题管理 ====================
class ThemeManager {
    constructor() {
        this.themeToggle = Utils.$('#themeToggle');
        this.html = document.documentElement;
        this.currentTheme = localStorage.getItem('theme') || 'light';

        this.init();
    }

    init() {
        if (!this.themeToggle) return;

        // 设置初始主题
        this.setTheme(this.currentTheme);

        // 切换主题事件
        this.themeToggle.addEventListener('click', () => {
            this.toggleTheme();
        });
    }

    setTheme(theme) {
        this.html.setAttribute('data-theme', theme);
        this.currentTheme = theme;
        this.updateIcon(theme);
        localStorage.setItem('theme', theme);

        // 触发自定义事件
        window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    }

    updateIcon(theme) {
        const icon = this.themeToggle.querySelector('i');
        if (icon) {
            icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        }
    }

    getTheme() {
        return this.currentTheme;
    }
}

// ==================== 滚动显示动画 ====================
class ScrollReveal {
    constructor(options = {}) {
        this.options = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px',
            ...options
        };

        this.observer = null;
        this.init();
    }

    init() {
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    Utils.addClass(entry.target, 'active');

                    // 如果设置了只触发一次,则停止观察
                    if (entry.target.dataset.once === 'true') {
                        this.observer.unobserve(entry.target);
                    }
                }
            });
        }, this.options);

        this.observe();
    }

    observe() {
        // 观察所有带有 scroll-reveal 类的元素
        Utils.$$('.scroll-reveal, .scroll-reveal-left, .scroll-reveal-right').forEach(el => {
            this.observer.observe(el);
        });
    }

    refresh() {
        this.observe();
    }
}

// ==================== 筛选管理 ====================
class FilterManager {
    constructor() {
        this.filters = {
            province: 'all',
            features: [],
            rent: 'all'
        };

        this.init();
    }

    init() {
        // 绑定筛选标签点击事件
        Utils.$$('.filter-tag').forEach(tag => {
            tag.addEventListener('click', (e) => {
                this.handleFilterClick(e.target);
            });
        });
    }

    handleFilterClick(tag) {
        const parent = tag.closest('.filter-group');
        const filterType = this.getFilterType(parent);

        // 如果是省份或租金筛选(单选)
        if (filterType === 'province' || filterType === 'rent') {
            // 移除同组其他标签的激活状态
            parent.querySelectorAll('.filter-tag').forEach(t => {
                Utils.removeClass(t, 'active');
            });

            // 激活当前标签
            Utils.addClass(tag, 'active');

            // 更新筛选条件
            this.filters[filterType] = tag.textContent.trim();
        }
        // 如果是特色筛选(多选)
        else if (filterType === 'features') {
            Utils.toggleClass(tag, 'active');

            // 更新特色筛选数组
            this.updateFeatureFilters(parent);
        }

        // 应用筛选
        this.applyFilters();
    }

    getFilterType(parent) {
        const label = parent.querySelector('.filter-label');
        if (!label) return null;

        const text = label.textContent.toLowerCase();
        if (text.includes('省份')) return 'province';
        if (text.includes('特色')) return 'features';
        if (text.includes('租')) return 'rent';

        return null;
    }

    updateFeatureFilters(parent) {
        const activeTags = parent.querySelectorAll('.filter-tag.active');
        this.filters.features = Array.from(activeTags).map(tag => {
            // 提取图标后的文本
            const text = tag.textContent.trim();
            return text;
        });
    }

    applyFilters() {
        console.log('应用筛选条件:', this.filters);

        // 触发自定义筛选事件
        window.dispatchEvent(new CustomEvent('filterchange', {
            detail: { filters: this.filters }
        }));

        // 这里可以调用 API 获取筛选后的城市数据
        // 示例: this.fetchFilteredCities(this.filters);
    }

    getFilters() {
        return this.filters;
    }

    reset() {
        this.filters = {
            province: 'all',
            features: [],
            rent: 'all'
        };

        // 重置所有筛选标签
        Utils.$$('.filter-tag').forEach(tag => {
            Utils.removeClass(tag, 'active');
        });

        // 激活所有"全部"标签
        Utils.$$('.filter-tag').forEach(tag => {
            if (tag.textContent.includes('全部')) {
                Utils.addClass(tag, 'active');
            }
        });

        this.applyFilters();
    }
}

// ==================== 搜索管理 ====================
class SearchManager {
    constructor() {
        this.searchInput = Utils.$('.search-input');
        this.searchBtn = Utils.$('.search-btn');

        this.init();
    }

    init() {
        if (!this.searchInput || !this.searchBtn) return;

        // 搜索按钮点击
        this.searchBtn.addEventListener('click', () => {
            this.handleSearch();
        });

        // 回车搜索
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleSearch();
            }
        });

        // 实时搜索(可选)
        // this.searchInput.addEventListener('input', Utils.debounce(() => {
        //     this.handleSearch();
        // }, 500));
    }

    handleSearch() {
        const query = this.searchInput.value.trim();

        if (!query) {
            this.showNotification('请输入搜索关键词', 'warning');
            return;
        }

        console.log('搜索:', query);

        // 触发搜索事件
        window.dispatchEvent(new CustomEvent('search', {
            detail: { query }
        }));

        // 这里调用实际的搜索 API
        // 示例: this.fetchSearchResults(query);
    }

    showNotification(message, type) {
        // 可以调用通知管理器
        if (window.notificationManager) {
            window.notificationManager.show(message, type);
        }
    }
}

// ==================== 通知管理 ====================
class NotificationManager {
    constructor() {
        this.container = this.createContainer();
    }

    createContainer() {
        let container = Utils.$('#notification-container');

        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            container.style.cssText = `
                position: fixed;
                top: 2rem;
                right: 2rem;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 1rem;
            `;
            document.body.appendChild(container);
        }

        return container;
    }

    show(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;

        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        notification.innerHTML = `
            <div class="notification-icon">
                <i class="fas ${icons[type] || icons.info}"></i>
            </div>
            <div class="notification-content">
                <div class="notification-message">${message}</div>
            </div>
        `;

        this.container.appendChild(notification);

        // 触发显示动画
        setTimeout(() => {
            Utils.addClass(notification, 'show');
        }, 10);

        // 自动关闭
        setTimeout(() => {
            this.hide(notification);
        }, duration);

        // 点击关闭
        notification.addEventListener('click', () => {
            this.hide(notification);
        });
    }

    hide(notification) {
        Utils.removeClass(notification, 'show');

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }

    success(message, duration) {
        this.show(message, 'success', duration);
    }

    error(message, duration) {
        this.show(message, 'error', duration);
    }

    warning(message, duration) {
        this.show(message, 'warning', duration);
    }

    info(message, duration) {
        this.show(message, 'info', duration);
    }
}

// ==================== 加载管理 ====================
class LoadingManager {
    constructor() {
        this.overlay = this.createOverlay();
    }

    createOverlay() {
        let overlay = Utils.$('#loading-overlay');

        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loading-overlay';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = `
                <div class="spinner"></div>
            `;
            document.body.appendChild(overlay);
        }

        return overlay;
    }

    show() {
        Utils.addClass(this.overlay, 'active');
        document.body.style.overflow = 'hidden';
    }

    hide() {
        Utils.removeClass(this.overlay, 'active');
        document.body.style.overflow = '';
    }
}

// ==================== 平滑滚动 ====================
class SmoothScroll {
    constructor() {
        this.init();
    }

    init() {
        Utils.$$('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                const href = anchor.getAttribute('href');

                // 如果是 #,则滚动到顶部
                if (href === '#') {
                    e.preventDefault();
                    window.scrollTo({
                        top: 0,
                        behavior: 'smooth'
                    });
                    return;
                }

                const target = Utils.$(href);
                if (target) {
                    e.preventDefault();
                    const offsetTop = target.offsetTop - 80; // 减去导航栏高度

                    window.scrollTo({
                        top: offsetTop,
                        behavior: 'smooth'
                    });
                }
            });
        });
    }
}

// ==================== 懒加载图片 ====================
class LazyLoad {
    constructor() {
        this.images = Utils.$$('[data-src]');
        this.observer = null;

        this.init();
    }

    init() {
        if ('IntersectionObserver' in window) {
            this.observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.loadImage(entry.target);
                        this.observer.unobserve(entry.target);
                    }
                });
            });

            this.images.forEach(img => {
                this.observer.observe(img);
            });
        } else {
            // 降级方案:直接加载所有图片
            this.images.forEach(img => {
                this.loadImage(img);
            });
        }
    }

    loadImage(img) {
        const src = img.getAttribute('data-src');
        if (!src) return;

        img.src = src;
        img.removeAttribute('data-src');

        img.addEventListener('load', () => {
            Utils.addClass(img, 'loaded');
        });
    }
}

// ==================== 城市卡片动画 ====================
class CityCardAnimations {
    constructor() {
        this.init();
    }

    init() {
        Utils.$$('.city-card').forEach(card => {
            // 悬停效果增强
            card.addEventListener('mouseenter', (e) => {
                this.handleMouseEnter(e.currentTarget);
            });

            card.addEventListener('mouseleave', (e) => {
                this.handleMouseLeave(e.currentTarget);
            });

            // 点击效果
            card.addEventListener('click', (e) => {
                this.handleClick(e.currentTarget);
            });
        });
    }

    handleMouseEnter(card) {
        // 可以添加额外的动画效果
        const image = card.querySelector('.city-image');
        if (image) {
            image.style.transform = 'scale(1.05)';
        }
    }

    handleMouseLeave(card) {
        const image = card.querySelector('.city-image');
        if (image) {
            image.style.transform = 'scale(1)';
        }
    }

    handleClick(card) {
        // 添加点击波纹效果
        const ripple = document.createElement('div');
        ripple.style.cssText = `
            position: absolute;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.6);
            width: 20px;
            height: 20px;
            animation: ripple 0.6s ease-out;
            pointer-events: none;
        `;

        const rect = card.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';

        card.style.position = 'relative';
        card.appendChild(ripple);

        setTimeout(() => {
            ripple.remove();
        }, 600);

        // 触发城市详情事件
        const cityId = card.dataset.cityId;
        if (cityId) {
            window.dispatchEvent(new CustomEvent('cityclick', {
                detail: { cityId }
            }));
        }
    }
}

// 添加波纹动画样式
if (!document.getElementById('ripple-animation')) {
    const style = document.createElement('style');
    style.id = 'ripple-animation';
    style.textContent = `
        @keyframes ripple {
            to {
                transform: scale(20);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

// ==================== 初始化所有功能 ====================
class ModernUI {
    constructor() {
        this.navbar = null;
        this.theme = null;
        this.scrollReveal = null;
        this.filter = null;
        this.search = null;
        this.notification = null;
        this.loading = null;
        this.smoothScroll = null;
        this.lazyLoad = null;
        this.cityCards = null;

        this.init();
    }

    init() {
        // 等待 DOM 加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.initializeComponents();
            });
        } else {
            this.initializeComponents();
        }
    }

    initializeComponents() {
        console.log('🚀 初始化现代化 UI 组件...');

        // 初始化各个管理器
        this.navbar = new NavbarManager();
        this.theme = new ThemeManager();
        this.scrollReveal = new ScrollReveal();
        this.filter = new FilterManager();
        this.search = new SearchManager();
        this.notification = new NotificationManager();
        this.loading = new LoadingManager();
        this.smoothScroll = new SmoothScroll();
        this.lazyLoad = new LazyLoad();
        this.cityCards = new CityCardAnimations();

        // 将通知管理器暴露到全局,方便其他脚本使用
        window.notificationManager = this.notification;
        window.loadingManager = this.loading;

        console.log('✅ 现代化 UI 组件初始化完成');

        // 欢迎通知
        setTimeout(() => {
            this.notification.info('欢迎使用宜居城市指南!', 2000);
        }, 500);
    }

    // 刷新滚动显示动画
    refreshScrollReveal() {
        if (this.scrollReveal) {
            this.scrollReveal.refresh();
        }
    }

    // 显示加载
    showLoading() {
        if (this.loading) {
            this.loading.show();
        }
    }

    // 隐藏加载
    hideLoading() {
        if (this.loading) {
            this.loading.hide();
        }
    }

    // 显示通知
    showNotification(message, type = 'info', duration = 3000) {
        if (this.notification) {
            this.notification.show(message, type, duration);
        }
    }

    // 获取当前筛选条件
    getFilters() {
        return this.filter ? this.filter.getFilters() : {};
    }

    // 重置筛选
    resetFilters() {
        if (this.filter) {
            this.filter.reset();
        }
    }

    // 获取当前主题
    getTheme() {
        return this.theme ? this.theme.getTheme() : 'light';
    }

    // 设置主题
    setTheme(theme) {
        if (this.theme) {
            this.theme.setTheme(theme);
        }
    }
}

// 创建全局实例
const modernUI = new ModernUI();

// 导出到全局
window.modernUI = modernUI;
