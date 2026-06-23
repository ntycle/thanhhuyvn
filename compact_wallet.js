const fs = require('fs');

let pageHtml = fs.readFileSync('app/page.js', 'utf8');

// Use a regex to match the entire wallet-card and the button div
const walletRegex = /<div class="wallet-card">([\s\S]*?)<\/div>\s*<div class="card" style="padding:0">/g;

const compactWalletHtml = `<div class="wallet-card">
          <div class="wallet-content">
            <div class="wallet-top-row">
              <div class="wallet-greeting-col">
                <div class="wallet-greeting">
                  <h3>Xin chào, <span id="welcome-name"></span>!</h3>
                </div>
                <p class="wallet-label">Số dư khả dụng</p>
                <div class="wallet-balance" id="sum-avail">0</div>
              </div>
              <div class="wallet-action-col">
                <button class="btn-withdraw" onclick="createPaymentRequest()">Thanh Toán</button>
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
          </div>
        </div>
        <div class="card" style="padding:0">`;

pageHtml = pageHtml.replace(walletRegex, compactWalletHtml);
fs.writeFileSync('app/page.js', pageHtml);
console.log('Successfully updated wallet layout in page.js');

let cssHtml = fs.readFileSync('app/globals.css', 'utf8');

// I will append the CSS for `.wallet-top-row` and `.btn-withdraw` and modify some padding
const additionalCss = `
/* ADDITIONAL WALLET COMPACT CSS */
.wallet-top-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}
.wallet-greeting-col {
  flex: 1;
}
.wallet-action-col {
  margin-left: 16px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.btn-withdraw {
  padding: 10px 20px;
  font-size: 13px;
  background: white;
  color: #EE4D2D;
  border: none;
  border-radius: 20px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
}
.btn-withdraw:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0,0,0,0.15);
}
@media (max-width: 600px) {
  .wallet-top-row {
    margin-bottom: 16px;
  }
  .btn-withdraw {
    padding: 8px 14px;
    font-size: 12px;
  }
}
`;

fs.appendFileSync('app/globals.css', additionalCss);
console.log('Successfully appended compact wallet CSS to globals.css');
