"use client";
import { useEffect } from "react";

export default function Page() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: `window.ENV = {
      apiKey: '${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}',
      authDomain: '${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}',
      projectId: '${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}',
      storageBucket: '${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}',
      messagingSenderId: '${process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID}',
      appId: '${process.env.NEXT_PUBLIC_FIREBASE_APP_ID}'
    };` }} />
      <script type="module" src="/user.js"></script>
    <div dangerouslySetInnerHTML={{ __html: `

  <!-- AUTH -->
  <div id="auth-screen">
    <div class="auth-container">
      <div class="auth-banner">
        <img src="banner.png" alt="Banner Shopee Affiliate">
      </div>
      <div class="auth-card">
        <div class="auth-top">
          <div class="logo">🛍️</div>
          <h2>Tra cứu đơn hàng Shopee</h2>
          <p>Đăng nhập để tìm và quản lý đơn hàng của bạn</p>
        </div>
        <div class="auth-tabs">
          <button class="auth-tab active" onclick="switchTab('login')">Đăng nhập</button>
          <button class="auth-tab" onclick="switchTab('register')">Đăng ký</button>
        </div>
        <div class="auth-body">
          <div id="tab-login">
            <div class="fg"><label>Email</label><input type="email" id="login-email" placeholder="email@example.com"
                onkeydown="if(event.key==='Enter')doLogin()" /></div>
            <div class="fg"><label>Mật khẩu</label><input type="password" id="login-pass" placeholder="••••••••"
                onkeydown="if(event.key==='Enter')doLogin()" /></div>
            <div style="text-align: right; margin-bottom: 14px;"><a href="#" onclick="showForgotPassword()"
                style="font-size: 13px; color: var(--blue); text-decoration: none;">Quên mật khẩu?</a></div>
            <button class="btn-main" onclick="doLogin()">Đăng nhập</button>
            <div class="auth-divider"><span>HOẶC</span></div>
            <button class="btn-zalo" onclick="doLoginZalo('login-msg')">
              <svg width="20" height="20" viewBox="0 0 460.1 436.3" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M230.1 0C103 0 0 92.5 0 206.5C0 268 30.6 323.4 82 359.8C80.2 373.1 72.8 406.8 61.3 430.7C60.2 433 62 435.6 64.5 435.1C91.5 430 139.6 414.5 168.3 395.4C188 401 208.6 404 230.1 404C357.2 404 460.1 311.5 460.1 197.5C460.1 83.5 357.2 0 230.1 0Z" fill="white"/></svg>
              Đăng nhập bằng Zalo
            </button>
            <div id="login-msg" class="amsg"></div>
          </div>
          <div id="tab-register" style="display:none">
            <div class="fg"><label>Họ tên</label><input type="text" id="reg-name" placeholder="Nguyễn Văn A" /></div>
            <div class="fg"><label>Email</label><input type="email" id="reg-email" placeholder="email@example.com" />
            </div>
            <div class="fg"><label>Mật khẩu</label><input type="password" id="reg-pass" placeholder="Ít nhất 6 ký tự" />
            </div>
            <div class="fg"><label>Người giới thiệu (Email)</label><input type="email" id="reg-ref"
                placeholder="Email người giới thiệu (tùy chọn)" />
            </div>
            <button class="btn-main" onclick="doRegister()">Đăng ký tài khoản</button>
            <div class="auth-divider"><span>HOẶC</span></div>
            <button class="btn-zalo" onclick="doLoginZalo('reg-msg')">
              <svg width="20" height="20" viewBox="0 0 460.1 436.3" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M230.1 0C103 0 0 92.5 0 206.5C0 268 30.6 323.4 82 359.8C80.2 373.1 72.8 406.8 61.3 430.7C60.2 433 62 435.6 64.5 435.1C91.5 430 139.6 414.5 168.3 395.4C188 401 208.6 404 230.1 404C357.2 404 460.1 311.5 460.1 197.5C460.1 83.5 357.2 0 230.1 0Z" fill="white"/></svg>
              Đăng nhập bằng Zalo
            </button>
            <div id="reg-msg" class="amsg"></div>
          </div>
          <div id="tab-forgot" style="display:none">
            <div
              style="margin-bottom: 16px; font-size: 13px; color: var(--text-light); text-align: center; line-height: 1.5;">
              Nhập email của bạn để nhận liên kết đặt lại mật khẩu từ hệ thống.
            </div>
            <div class="fg"><label>Email</label><input type="email" id="forgot-email" placeholder="email@example.com" />
            </div>
            <button class="btn-main" onclick="doForgotPassword()">Gửi Email Khôi Phục</button>
            <div style="text-align: center; margin-top: 14px;"><a href="#" onclick="switchTab('login')"
                style="font-size: 13px; color: var(--text-light); text-decoration: none; font-weight: 600;">&larr; Quay
                lại Đăng nhập</a></div>
            <div id="forgot-msg" class="amsg"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- APP -->
  <div id="app-screen">
    <div class="header">
      <div class="header-logo">🛍️ Shopee Affiliate</div>
      <div class="header-right">
        <span class="uname" id="header-uname"></span>
        <button class="btn-out" onclick="doLogout()">Đăng xuất</button>
      </div>
    </div>

    <div class="tab-nav">
      <button class="active" id="nav-search" onclick="showMainTab('search')">🔍 Tìm đơn hàng</button>
      <button id="nav-mine" onclick="showMainTab('mine')">📦 Đơn của tôi <span id="mine-badge"></span></button>
    </div>

    <div class="container">
      <!-- SEARCH TAB -->
      <div id="main-search">
        <div class="card">
          <div class="card-title">🔍 Tìm kiếm đơn hàng</div>
          <div class="guide-links">
            <a href="https://s.shopee.vn/4fswFcE0Mc" target="_blank">🎟️ Mã giảm giá Shopee</a>
            <a href="https://shorten.asia/mTn3wHfD" target="_blank">☕ Mã Highland Coffee</a>
            <a href="https://sandeal.io.vn/huongdan.html" target="_blank">Hướng dẫn sử dụng web</a>
            <a href="https://zalo.me/g/dnyqyk95ihelrtqn3cyg" target="_blank">Link nhóm Zalo</a>
          </div>
          <textarea id="orderId" rows="3"
            placeholder="Nhập ID đơn hàng, cách nhau bằng dấu phẩy hoặc xuống dòng&#10;VD: 250601E7EMYD4X, 250602ABCDE12F"></textarea>
          <button class="btn-search" id="btn-search" onclick="doSearch()">🔍 Tìm đơn hàng</button>
        </div>
        <div id="search-result"></div>
      </div>

      <!-- MY ORDERS TAB -->
      <div id="main-mine" style="display:none">
        <div class="summary-bar">
          <div>
            <h3>Xin chào, <span id="welcome-name"></span>! 👋</h3>
            <p>Các đơn hàng đã được gán về tài khoản của bạn</p>
          </div>
          <div class="summary-stats">
            <div class="stat-box">
              <div class="val" id="sum-count">0</div>
              <div class="lbl">Đơn hàng</div>
            </div>
            <div class="stat-box">
              <div class="val" id="sum-value">0₫</div>
              <div class="lbl">Tổng giá trị</div>
            </div>
            <div class="stat-box">
              <div class="val" id="sum-disc">0₫</div>
              <div class="lbl">Chiết khấu</div>
            </div>
            <div class="stat-box">
              <div class="val" id="sum-avail">0₫</div>
              <div class="lbl">Khả dụng</div>
            </div>
          </div>
          <div style="width: 100%; margin-top: 16px; display: flex; justify-content: flex-end;">
            <button class="btn-search"
              style="width: auto; padding: 10px 24px; margin-top: 0; background: #fff; color: var(--orange); border: 2px solid white; box-shadow: var(--shadow);"
              onclick="createPaymentRequest()">💳 Yêu Cầu Thanh Toán</button>
          </div>
        </div>
        <div class="card" style="padding:0">
          <div style="padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; background: #fafafa; border-radius: var(--radius) var(--radius) 0 0;">
            <div style="font-size: 15px; font-weight: 700; color: var(--blue);">Danh sách đơn hàng</div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 13px; font-weight: 600; color: var(--text-light);">Lọc:</span>
              <select id="order-filter" onchange="window.renderMyOrders()" style="padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; outline: none; font-family: inherit; font-size: 13px; color: var(--text); background: white;">
                <option value="all">Tất cả đơn</option>
                <option value="paid">Đơn đã thanh toán</option>
                <option value="unpaid" selected>Đơn khác (chưa thanh toán)</option>
              </select>
            </div>
          </div>
          <div id="mine-list">
            <div class="spinner-wrap">
              <div class="spinner"></div>Đang tải...
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="overlay" id="bank-info-modal"
    style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center;">
    <div class="panel card"
      style="background:#fff; width:450px; max-width:90%; padding:24px; border-radius:12px; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 12px 0; color:var(--text); font-size:18px;">💳 Thông Tin Nhận Tiền</h3>
      <p style="font-size:13px; color:var(--text-light); margin-bottom:16px; line-height:1.4;">Bạn cần thiết lập thông
        tin ngân hàng trước khi Gửi Yêu Cầu Thanh Toán. <br><b style="color:var(--orange)">Chỉ được nhập 1 lần duy
          nhất</b>.</p>

      <div class="fg">
        <label>Họ và tên chủ tài khoản</label>
        <input type="text" id="bank-fullname" placeholder="VD: NGUYEN VAN A" style="text-transform: uppercase;" />
      </div>
      <div class="fg">
        <label>Ngân hàng nhận tiền</label>
        <select id="bank-name"
          style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:8px; font-family:inherit; outline:none; font-size:14px;">
          <option value="">-- Đang tải danh sách ngân hàng... --</option>
        </select>
      </div>
      <div class="fg">
        <label>Số tài khoản</label>
        <input type="text" id="bank-account" placeholder="Nhập chính xác số tài khoản" />
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
        <button class="btn-outline" onclick="document.getElementById('bank-info-modal').style.display='none'"
          style="padding:10px 20px; border-radius:8px; border:1px solid #ccc; background:white; cursor:pointer;">Hủy
          bỏ</button>
        <button class="btn-main" id="btn-save-bank" onclick="saveBankInfo()"
          style="margin-top:0; width:auto; padding:10px 20px;">Lưu Thông Tin</button>
      </div>
    </div>
  </div>

  <script type="module" src="user.js"></script>
` }} />
  </>
  );
}
