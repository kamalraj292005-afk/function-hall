/**
 * Palani Murugan Function Hall - Core Client Library
 */

const App = {
  // Get stored auth token
  getToken() {
    return localStorage.getItem('pmh_token');
  },

  // Get stored user object
  getUser() {
    try {
      const u = localStorage.getItem('pmh_user');
      return u ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  },

  // Set auth credentials
  setAuth(token, user) {
    localStorage.setItem('pmh_token', token);
    localStorage.setItem('pmh_user', JSON.stringify(user));
  },

  // Clear auth credentials
  clearAuth() {
    localStorage.removeItem('pmh_token');
    localStorage.removeItem('pmh_user');
  },

  // Check login status
  isLoggedIn() {
    return !!this.getToken();
  },

  // Authenticated fetch wrapper
  async apiFetch(url, options = {}) {
    const headers = options.headers || {};
    const token = this.getToken();

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({ success: false, message: 'Invalid response from server' }));

    if (res.status === 401 && !url.includes('/api/auth/login')) {
      this.clearAuth();
      if (!window.location.pathname.includes('login.html')) {
        window.location.href = '/login.html?session=expired';
      }
    }

    return { status: res.status, ok: res.ok, data };
  },

  // Format currency in Indian Rupees
  formatINR(amount) {
    const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
    return '₹' + num.toLocaleString('en-IN');
  },

  // Format date in Asia/Kolkata friendly format (e.g. 15 Nov 2026)
  formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00+05:30');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  },

  // Toast notification
  toast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:10px;max-width:380px;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bgColors = {
      success: '#15803d',
      error: '#b91c1c',
      warning: '#d97706',
      info: '#701325'
    };
    toast.style.cssText = `background:${bgColors[type] || '#701325'};color:white;padding:12px 18px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,0.25);font-size:0.92rem;font-weight:600;display:flex;justify-content:space-between;align-items:center;animation:slideIn 0.3s ease;border:1px solid #c59b27;`;
    toast.innerHTML = `<span>${message}</span><button style="background:none;border:none;color:white;font-size:1.2rem;margin-left:12px;cursor:pointer;">&times;</button>`;

    toast.querySelector('button').onclick = () => toast.remove();
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.4s ease';
      setTimeout(() => toast.remove(), 400);
    }, 4500);
  },

  // Setup navigation state on all pages
  setupNav() {
    const user = this.getUser();
    const navActions = document.getElementById('nav-auth-actions');

    if (navActions) {
      if (user) {
        let dashboardUrl = '/customer-dashboard.html';
        if (user.role === 'owner') dashboardUrl = '/owner-dashboard.html';
        if (user.role === 'admin') dashboardUrl = '/admin-dashboard.html';

        navActions.innerHTML = `
          <a href="${dashboardUrl}" class="btn btn-outline btn-sm">
            <span>Dashboard (${user.role})</span>
            <span class="btn-ta">டாஷ்போர்டு</span>
          </a>
          <button id="logout-btn" class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;">
            <span>Logout</span>
            <span class="btn-ta">வெளியேறு</span>
          </button>
        `;

        document.getElementById('logout-btn')?.addEventListener('click', () => {
          App.clearAuth();
          App.toast('Logged out successfully.', 'info');
          setTimeout(() => window.location.href = '/', 500);
        });
      } else {
        navActions.innerHTML = `
          <a href="/login.html" class="btn btn-outline btn-sm">
            <span>Login</span>
            <span class="btn-ta">உள்நுழைய</span>
          </a>
          <a href="/register.html" class="btn btn-primary btn-sm">
            <span>Register</span>
            <span class="btn-ta">பதிவு செய்க</span>
          </a>
        `;
      }
    }

    // Mobile nav toggle
    const toggle = document.querySelector('.mobile-toggle');
    const menu = document.querySelector('.nav-menu');
    if (toggle && menu) {
      toggle.addEventListener('click', () => {
        menu.classList.toggle('active');
      });
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.setupNav();
});
