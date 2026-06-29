"use client";
import { useEffect } from "react";

export default function Page() {
  return (
    <>
      <script dangerouslySetInnerHTML={{
        __html: `window.ENV = {
      apiKey: ${JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_API_KEY)},
      authDomain: ${JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN)},
      projectId: ${JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)},
      storageBucket: ${JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)},
      messagingSenderId: ${JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID)},
      appId: ${JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_APP_ID)}
    };` }} />
      <script type="module" src="/user.js?v=1.11"></script>
      <div dangerouslySetInnerHTML={{
        __html: `

  
  <!-- OPTIMIZATION: Instant Load via LocalStorage -->
  <script>
    try {
      if (localStorage.getItem('isLoggedIn') === 'true') {
        document.documentElement.classList.add('is-logged-in');
      } else {
        document.documentElement.classList.add('not-logged-in');
      }
    } catch(e) {}

    window.pasteOrderId = async function() {
      const el = document.getElementById('orderId');
      el.focus();
      let pasted = false;
      try {
        pasted = document.execCommand('paste');
      } catch(e) {}
      
      if (!pasted && navigator.clipboard && navigator.clipboard.readText) {
        try {
          const t = await navigator.clipboard.readText();
          if (t) {
            el.value = el.value ? el.value + ' ' + t : t;
            pasted = true;
          }
        } catch(e) {
          console.error('Clipboard API failed:', e);
        }
      }
      
      if (!pasted) {
        if (/Zalo/i.test(navigator.userAgent)) {
          alert('Zalo chặn tự động dán. Ô nhập đã được chọn sẵn, bạn hãy CHẠM GIỮ vào ô nhập và chọn DÁN (Paste) nhé!');
        } else {
          alert('Trình duyệt chưa cấp quyền dán tự động. Ô nhập đã được chọn, hãy ấn Ctrl+V (trên máy tính) hoặc Chạm Giữ -> Dán (trên điện thoại) nhé!');
        }
      }
    };
  </script>
  <style>
    html.is-logged-in #auth-screen { display: none !important; }
    html.is-logged-in #app-screen { display: block !important; }
    html.not-logged-in #auth-screen { display: flex !important; }
    html.not-logged-in #app-screen { display: none !important; }
    #auth-screen, #app-screen { display: none; } /* Default hide both to prevent flashes */
    #typewriter-logo::after {
      content: '|';
      animation: blink 0.7s step-end infinite;
    }
    #typewriter-logo.done::after { content: ''; }
    @keyframes blink { 50% { opacity: 0; } }
    #typewriter-logo.done {
      background: linear-gradient(90deg, #fff 0%, #fff 35%, #ffeb99 50%, #fff 65%, #fff 100%);
      background-size: 300% auto;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: shimmer 5s linear infinite;
    }
    @keyframes shimmer {
      0%   { background-position: 200% center; }
      100% { background-position: -200% center; }
    }
    @keyframes wave {
      0%   { transform: rotate(0deg); }
      15%  { transform: rotate(18deg); }
      30%  { transform: rotate(-8deg); }
      45%  { transform: rotate(18deg); }
      60%  { transform: rotate(-4deg); }
      75%  { transform: rotate(12deg); }
      100% { transform: rotate(0deg); }
    }
  </style>

  <div id="fb-webview-overlay" style={{display:'none',position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,0.55)',alignItems:'center',justifyContent:'center',padding:'24px'}}>
    <div style={{background:'#ffffff',borderRadius:'20px',padding:'28px 22px 22px',width:'100%',maxWidth:'360px',textAlign:'center',boxShadow:'0 8px 32px rgba(0,0,0,0.22)',fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif'}}>
      <div style={{fontSize:'44px',marginBottom:'10px'}}>🌐</div>
      <h2 style={{fontSize:'18px',fontWeight:700,color:'#1a1a1a',margin:'0 0 8px'}}>Mở bằng trình duyệt ngoài</h2>
      <p style={{fontSize:'14px',color:'#666',lineHeight:1.6,margin:'0 0 18px'}}>Sandeal.io.vn hoạt động tốt nhất trên Chrome hoặc Safari. Vui lòng mở bằng trình duyệt ngoài để trải nghiệm đầy đủ.</p>
      <div id="fb-open-chrome-wrap"></div>
      <div id="fb-steps-text" style={{background:'#f7f7f7',borderRadius:'10px',padding:'12px 14px',textAlign:'left',fontSize:'13px',color:'#555',lineHeight:1.8,marginBottom:'14px'}}></div>
      <button style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'8px',width:'100%',padding:'13px 16px',borderRadius:'12px',fontSize:'15px',fontWeight:600,cursor:'pointer',border:'none',background:'#f0f0f0',color:'#333',marginBottom:'10px'}} onClick="(function(btn){navigator.clipboard.writeText(location.href).then(()=>{btn.textContent='✅ Đã copy link!';setTimeout(()=>{btn.textContent='📋 Copy link'},2000)}).catch(()=>{btn.textContent='📋 Copy link'});})(this)">📋 Copy link</button>
      <button style={{fontSize:'13px',color:'#aaa',cursor:'pointer',marginTop:'4px',background:'none',border:'none',padding:'4px 8px'}} onClick="document.getElementById('fb-webview-overlay').style.display='none'">Bỏ qua, tiếp tục xem</button>
    </div>
  </div>

  <script src="/fbdetect.js" defer></script>

  <!-- AUTH -->
  <div id="auth-screen">
    <div class="auth-container">
      <div class="auth-banner">
        <img src="/headerbanner.png" alt="Sandeal.io.vn - Săn deal Shopee hoàn tiền">
      </div>
      <div class="auth-card">
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
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
              <div class="fg" style="margin-bottom:0"><label style="font-size:12px">Họ tên <span style="color:#e53e3e">*</span></label><input type="text" id="reg-name" placeholder="Nguyễn Văn A" style="padding:8px 10px;font-size:13px" /></div>
              <div class="fg" style="margin-bottom:0"><label style="font-size:12px">Mật khẩu <span style="color:#e53e3e">*</span></label><input type="password" id="reg-pass" placeholder="Ít nhất 6 ký tự" style="padding:8px 10px;font-size:13px" /></div>
            </div>
            <div class="fg" style="margin-bottom:8px"><label style="font-size:12px">Email <span style="color:#e53e3e">*</span></label><input type="email" id="reg-email" placeholder="email@example.com" style="padding:8px 10px;font-size:13px" /></div>
            <div class="fg" style="margin-bottom:10px"><label style="font-size:12px">Người giới thiệu (Email)</label><input type="email" id="reg-ref" placeholder="Tùy chọn" style="padding:8px 10px;font-size:13px" /></div>
            <button class="btn-main" style="padding:10px;font-size:14px" onclick="doRegister()">Đăng ký tài khoản</button>
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
      <div class="header-logo">🛍️ <span id="typewriter-logo"></span></div>
      <div class="header-right">
        <span class="uname" id="header-uname"></span>
        <button class="btn-out" onclick="doLogout()" title="Đăng xuất" style="display:flex; align-items:center; justify-content:center; padding: 6px 10px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
        </button>
      </div>
    </div>

    <div class="tab-nav">
      <button class="active" id="nav-search" onclick="showMainTab('search')">🔍 Tìm đơn hàng</button>
      <button id="nav-mine" onclick="showMainTab('mine')">📦 Đơn của tôi <span id="mine-badge"></span></button>
    </div>

    <div class="container">
      <!-- SEARCH TAB -->
      <div id="main-search">
        <a href="https://zalo.me/g/dnyqyk95ihelrtqn3cyg" target="_blank" rel="noopener noreferrer" style="display:block;margin:0 -6px 12px -6px;border-radius:12px;overflow:hidden">
          <img src="/truycapzalo.png" alt="Tham gia nhóm Zalo" style="width:100%;height:auto;display:block" />
        </a>
        <div class="card">
          <div class="card-title">🔍 Tìm kiếm đơn hàng</div>
          <div class="guide-links">
            <a href="https://s.shopee.vn/4fswFcE0Mc" target="_blank">🎟️ Mã giảm giá Shopee</a>
            <a href="https://shorten.asia/mTn3wHfD" target="_blank">☕ Mã Highland Coffee</a>            
          </div>
          <div style="position: relative; width: 100%;">
            <textarea id="orderId" rows="3"
              placeholder="Nhập ID đơn hàng, cách nhau bằng dấu phẩy hoặc xuống dòng&#10;VD: 250601E7EMYD4X, 250602ABCDE12F"></textarea>
            <button type="button" 
              id="btn-paste-mobile"
              onclick="window.pasteOrderId()" 
              class="btn-paste-mobile"
              title="Dán từ bộ nhớ tạm">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clipboard"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path></svg>
            </button>
            <script>
              (function() {
                var btn = document.getElementById('btn-paste-mobile');
                if (btn && (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function' || /Zalo/i.test(navigator.userAgent))) {
                  btn.style.display = 'none';
                }
              })();
            </script>
          </div>
          <button class="btn-search" id="btn-search" onclick="doSearch()">🔍 Tìm đơn hàng</button>
        </div>
        <div id="search-result"></div>
      </div>

      <!-- MY ORDERS TAB -->
      <div id="main-mine" style="display:none">
        <div class="wallet-card">
          <div class="wallet-content">
            <div class="wallet-greeting" style="display: flex; align-items: center; margin-bottom: 16px;">
              <span style="font-size: 22px; margin-right: 6px; flex-shrink: 0; display: inline-block; animation: wave 2s ease-in-out 1s 3; transform-origin: 70% 80%;">👋</span>
              <h3 style="margin: 0; font-size: 20px; font-weight: 700;">Xin chào, <span id="welcome-name"></span>!</h3>
            </div>
            
            <div class="wallet-top-section" style="display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; margin-bottom: 24px; gap: 16px;">
              
              <!-- LEFT INFO (Anchored extreme left) -->
              <div class="wallet-left-info" style="display: flex; flex-direction: column; justify-content: center; align-items: flex-start; text-align: left;">
                <p class="wallet-label" style="margin-bottom: 2px; font-size: 13px; font-weight: 500; opacity: 0.9;">Số dư khả dụng</p>
                <div class="wallet-balance-container" style="display: flex; align-items: baseline; gap: 4px;">
                  <div class="wallet-balance" id="sum-avail" style="margin-bottom: 0; font-size: 40px; line-height: 1;">0</div>
                  <span style="font-size: 18px; text-decoration: underline; font-weight: 600; opacity: 0.9;">đ</span>
                </div>
              </div>
              
              <!-- CENTER DIVIDER (Dead center) -->
              <div class="wallet-divider" style="width: 1px; height: 50px; background: rgba(255,255,255,0.3);"></div>
              
              <!-- RIGHT IMAGE (Responsive alignment) -->
              <div class="wallet-right-image">
                <svg width="85" height="85" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="wallet-back" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="rgba(255, 255, 255, 0.5)" />
                      <stop offset="100%" stop-color="rgba(255, 255, 255, 0.15)" />
                    </linearGradient>
                    <linearGradient id="wallet-front" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="rgba(255, 255, 255, 0.8)" />
                      <stop offset="100%" stop-color="rgba(255, 255, 255, 0.3)" />
                    </linearGradient>
                    <linearGradient id="wallet-dark" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="rgba(0, 0, 0, 0.15)" />
                      <stop offset="100%" stop-color="rgba(0, 0, 0, 0.02)" />
                    </linearGradient>
                    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#000" flood-opacity="0.15"/>
                    </filter>
                  </defs>
                  
                  <!-- Back panel (inside of wallet showing slightly) -->
                  <path d="M10,32 L84,32 C87.3,32 90,34.7 90,38 L90,68 C90,71.3 87.3,74 84,74 L10,74 C6.7,74 4,71.3 4,68 L4,38 C4,34.7 6.7,32 10,32 Z" fill="url(#wallet-back)" filter="url(#shadow)" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>
                  
                  <!-- Cash sticking out subtly from the top edge -->
                  <rect x="18" y="25" width="58" height="15" rx="3" fill="#ffffff" opacity="0.95" stroke="rgba(255,255,255,0.8)" stroke-width="1.5" filter="url(#shadow)"/>
                  <line x1="25" y1="30" x2="45" y2="30" stroke="rgba(238, 77, 45, 0.4)" stroke-width="2.5" stroke-linecap="round"/>
                  
                  <!-- Front main panel (Men's Bi-fold) -->
                  <path d="M8,38 L86,38 C88.2,38 90,39.8 90,42 L90,72 C90,74.2 88.2,76 86,76 L8,76 C5.8,76 4,74.2 4,72 L4,42 C4,39.8 5.8,38 8,38 Z" fill="url(#wallet-front)" filter="url(#shadow)" stroke="rgba(255,255,255,0.6)" stroke-width="2"/>
                  
                  <!-- Vertical fold line typical of bi-fold wallets (centered) -->
                  <line x1="47" y1="38" x2="47" y2="76" stroke="rgba(0,0,0,0.1)" stroke-width="5"/>
                  <line x1="47" y1="38" x2="47" y2="76" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-dasharray="3,3"/>
                  
                  <!-- Subtle inner shadow/gradient for right side depth -->
                  <path d="M47,38 L86,38 C88.2,38 90,39.8 90,42 L90,72 C90,74.2 88.2,76 86,76 L47,76 Z" fill="url(#wallet-dark)"/>
                  
                  <!-- Classic Leather Stitching around the edges -->
                  <path d="M10,43 L84,43 L84,71 L10,71 Z" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1" stroke-dasharray="3,3" opacity="0.9"/>
                  
                  <!-- Small embossed logo/badge in the corner -->
                  <rect x="74" y="62" width="8" height="6" rx="2" fill="rgba(255,255,255,0.9)" filter="url(#shadow)"/>
                  <circle cx="78" cy="65" r="1.5" fill="rgba(238, 77, 45, 0.8)"/>
                  
                  <!-- Sparkles -->
                  <path d="M10,12 L12,17 L17,19 L12,21 L10,26 L8,21 L3,19 L8,17 Z" fill="#ffffff" opacity="0.9"/>
                  <path d="M85,15 L86,18 L89,19 L86,20 L85,23 L84,20 L81,19 L84,18 Z" fill="#ffffff" opacity="0.7"/>
                </svg>
              </div>
            </div>
            <div class="wallet-stats-row">
              <div class="stat-item">
                <div class="stat-label">Số đơn</div>
                <div class="stat-value" id="sum-count">0</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">Tổng giá trị</div>
                <div class="stat-value" id="sum-value">0</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">Chiết khấu</div>
                <div class="stat-value" id="sum-disc">0</div>
              </div>
            </div>
            
            <button class="btn-withdraw-full" onclick="createPaymentRequest()">💳 Yêu Cầu Thanh Toán</button>
          </div>
        </div>
        <div class="card" style="padding:0">
          <div style="padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; background: #fafafa; border-radius: var(--radius) var(--radius) 0 0;">
            <div style="font-size: 15px; font-weight: 700; color: var(--blue); white-space: nowrap;">Danh sách đơn hàng</div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 13px; font-weight: 600; color: var(--text-light);">Lọc:</span>
              <select id="order-filter" onchange="window.renderMyOrders()" style="padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; outline: none; font-family: inherit; font-size: 13px; color: var(--text); background: white;">
                <option value="all">Tất cả đơn</option>
                <option value="paid">Đơn đã thanh toán</option>
                <option value="unpaid" selected>Đơn khác (chưa thanh toán)</option>
              </select>
            </div>
          </div>
          <div id="mine-list" style="background: white; padding: 14px; border-radius: 0 0 var(--radius) var(--radius);">
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

  <script type="module" src="/user.js?v=1.11"></script>
  <script>
    (function() {
      const text = "Sandeal.io.vn";
      const el = document.getElementById("typewriter-logo");
      if (!el) return;
      let i = 0;
      function type() {
        if (i <= text.length) {
          el.textContent = text.slice(0, i);
          i++;
          setTimeout(type, i === 1 ? 400 : 80);
        } else {
          el.classList.add("done");
        }
      }
      setTimeout(type, 600);
    })();
  </script>
` }} />
    </>
  );
}
