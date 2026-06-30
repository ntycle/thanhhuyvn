import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile, sendPasswordResetEmail,
  signInWithCustomToken
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, limit,
  serverTimestamp, runTransaction, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const cfg = {
  apiKey: "AIzaSyCD3bS8LTPnXU-9C0xVTRC-IzYfPe428x8",
  authDomain: "shopeeafff-bfd62.firebaseapp.com",
  projectId: "shopeeafff-bfd62",
  storageBucket: "shopeeafff-bfd62.firebasestorage.app",
  messagingSenderId: "1091380862349",
  appId: "1:1091380862349:web:1c82d576edc1888e4a31c4"
};
const app = initializeApp(cfg);
const auth = getAuth(app);
const db = getFirestore(app);

// Các field bị ẩn khỏi bảng
const EXCLUDE = new Set([
  "Hoa hồng Shopee trên sản phẩm(₫)",
  "Chiết Khấu 2%",
  "userId", "createdAt", "updatedAt", "claimedAt", "_id", "thanhToan"
]);

// Thứ tự cột cố định — luôn hiển thị theo đúng thứ tự này
const COL_ORDER = [
  "ID đơn hàng",
  "Thời Gian Đặt Hàng",
  "Tên Item",
  "Giá trị đơn hàng (₫)",
  "Chiết Khấu",
  "Trạng thái đặt hàng",
];

function escapeHTML(str) {
  if (typeof str !== 'string' && typeof str !== 'number') return '';
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

let me = null, myName = "", myOrders = [], myBankInfo = null;
let cachedUserDoc = null; // Cache cho user document

// ─── AUTH STATE ───────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (user) {
    document.documentElement.classList.remove("not-logged-in");
    document.documentElement.classList.add("is-logged-in");
    
    me = user.uid;
    let uData = {};
    if (cachedUserDoc && cachedUserDoc.uid === user.uid) {
      uData = cachedUserDoc.data;
    } else {
      const snap = await getDoc(doc(db, "users", user.uid));
      uData = snap.exists() ? snap.data() : {};
      cachedUserDoc = { uid: user.uid, data: uData };
    }
    
    myName = uData.name || user.displayName || user.email;

    document.getElementById("header-uname").textContent = myName;
    document.getElementById("welcome-name").textContent = myName;
    const elAuth = document.getElementById("auth-screen");
    if (elAuth) elAuth.style.display = "none";
    
    const elApp = document.getElementById("app-screen");
    if (elApp) {
      elApp.style.display = "block"; 
      localStorage.setItem("isLoggedIn", "true");
    }

    // Check bank info
    if (uData.bankAccount) {
      myBankInfo = { bankFullName: uData.bankFullName, bankName: uData.bankName, bankAccount: uData.bankAccount };
    } else {
      myBankInfo = null;
      window.loadBanksList();
    }

    await refreshMyOrders();
    loadMyBonus();
  } else {
    document.documentElement.classList.remove("is-logged-in");
    document.documentElement.classList.add("not-logged-in");

    me = null;
    const elAuth = document.getElementById("auth-screen");
    if (elAuth) elAuth.style.display = "flex";
    
    const elApp = document.getElementById("app-screen");
    if (elApp) {
      elApp.style.display = "none"; 
      localStorage.removeItem("isLoggedIn");
    }
  }
});

// ─── MY ORDERS ────────────────────────────────────────────

/**
 * [Bước 1] Dọn dẹp trùng ID trong chính myOrders:
 * Nếu user có ≥2 bản ghi cùng "ID đơn hàng" và một trong đó là nháp
 * "Không có thông tin" → xóa nháp, gán đơn thật (nếu chưa có userId).
 */
async function cleanupDuplicateDrafts(orders) {
  const groups = {};
  for (const o of orders) {
    const orderId = (o["ID đơn hàng"] || "").trim();
    if (!orderId) continue;
    if (!groups[orderId]) groups[orderId] = [];
    groups[orderId].push(o);
  }

  const toDelete = [], toClaim = [];
  for (const [, group] of Object.entries(groups)) {
    if (group.length >= 2) {
      group.filter(o => o["Tên Item"] === "Không có thông tin").forEach(d => toDelete.push(d._id));
      group.filter(o => o["Tên Item"] !== "Không có thông tin" && !o.userId).forEach(r => toClaim.push(r._id));
    }
  }

  if (!toDelete.length && !toClaim.length) return false;
  if (toDelete.length) {
    await Promise.all(toDelete.map(id => deleteDoc(doc(db, "orders", id))));
    console.log(`[cleanup] Xóa ${toDelete.length} nháp trùng ID:`, toDelete);
  }
  if (toClaim.length) {
    await Promise.all(toClaim.map(id =>
      updateDoc(doc(db, "orders", id), { userId: me, claimedAt: serverTimestamp(), updatedAt: serverTimestamp() })
    ));
    console.log(`[cleanup] Gán ${toClaim.length} đơn thật (nội bộ) cho user:`, toClaim);
  }
  return true;
}

/**
 * [Bước 2] Với mỗi bản nháp "Không có thông tin" còn lại trong myOrders,
 * chủ động query Firestore để tìm đơn thật cùng "ID đơn hàng"
 * — kể cả đơn thật chưa có userId (không nằm trong myOrders).
 * Nếu tìm thấy → xóa nháp + tự động gán đơn thật về user.
 * Không cần user search thủ công.
 * Trả về true nếu có thay đổi.
 */
async function autoClaimRealOrders(orders) {
  const drafts = orders.filter(o => o["Tên Item"] === "Không có thông tin");
  if (!drafts.length) return false;

  let changed = false;

  // Xử lý tuần tự để tránh race condition
  for (const draft of drafts) {
    const orderId = (draft["ID đơn hàng"] || "").trim();
    if (!orderId) continue;

    // Tìm tất cả đơn có cùng "ID đơn hàng" trong toàn bộ Firestore
    const snap = await getDocs(
      query(collection(db, "orders"), where("ID đơn hàng", "==", orderId))
    );

    // Lọc ra đơn thật (không phải bản nháp này, không phải "Không có thông tin")
    const reals = snap.docs
      .map(d => ({ _id: d.id, ...d.data() }))
      .filter(o => o._id !== draft._id && o["Tên Item"] !== "Không có thông tin");

    if (!reals.length) continue; // Chưa có đơn thật → bỏ qua

    // Có đơn thật → xóa bản nháp
    await deleteDoc(doc(db, "orders", draft._id));
    console.log(`[auto-claim] Xóa nháp "${orderId}" (${draft._id})`);

    // Gán các đơn thật chưa có chủ về user hiện tại
    for (const real of reals) {
      if (!real.userId) {
        await updateDoc(doc(db, "orders", real._id), {
          userId: me,
          claimedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        console.log(`[auto-claim] Gán đơn thật "${orderId}" (${real._id}) cho user`);
      }
    }

    changed = true;
  }

  return changed;
}

async function refreshMyOrders() {
  const q = query(collection(db, "orders"), where("userId", "==", me), limit(50));
  const snap = await getDocs(q);
  myOrders = snap.docs.map(d => ({ _id: d.id, ...d.data() }));

  // Bước 1: Dọn trùng ID trong myOrders
  const cleaned = await cleanupDuplicateDrafts(myOrders);

  // Bước 2: Với mỗi nháp còn lại, chủ động tìm đơn thật trong Firestore
  //         → xóa nháp + tự gán đơn thật về user (không cần search thủ công)
  const autoClaimed = await autoClaimRealOrders(
    cleaned
      ? (await getDocs(query(collection(db, "orders"), where("userId", "==", me), limit(50)))).docs.map(d => ({ _id: d.id, ...d.data() }))
      : myOrders
  );

  // Reload lần cuối nếu có bất kỳ thay đổi nào
  if (cleaned || autoClaimed) {
    const snap2 = await getDocs(query(collection(db, "orders"), where("userId", "==", me), limit(50)));
    myOrders = snap2.docs.map(d => ({ _id: d.id, ...d.data() }));
  }

  const count = myOrders.length;
  document.getElementById("mine-badge").textContent = count > 0 ? `(${count})` : "";

  let totalVal = 0, totalDisc = 0, totalAvailable = 0;
  myOrders.forEach(o => {
    totalVal += Number(o["Giá trị đơn hàng (₫)"]) || 0;
    const disc = calcDisc(o);
    totalDisc += disc;
    if (String(o["Trạng thái đặt hàng"] || "").trim().toLowerCase() === "hoàn thành" && o.thanhToan !== "Đã Thanh Toán") {
      totalAvailable += disc;
    }
  });
  document.getElementById("sum-count").textContent = count;
  document.getElementById("sum-value").textContent = (totalVal / 1e6).toFixed(2) + "M";
  document.getElementById("sum-disc").textContent = totalDisc.toLocaleString("vi-VN");
  const elTotalAvailable = document.getElementById("sum-avail");
  if (elTotalAvailable) elTotalAvailable.textContent = totalAvailable.toLocaleString("vi-VN");

  renderMyOrders();
}

function paymentBadge(val) {
  if (val === "Đã Thanh Toán") return `<span class="tag-paid">💚 Đã Thanh Toán</span>`;
  if (val === "Đang chờ xử lý") return `<span class="tag-unpaid" style="background:#fff3e0;color:#e65100">⏳ Đang chờ xử lý</span>`;
  if (val === "Chưa Thanh Toán") return `<span class="tag-unpaid">🟡 Chưa Thanh Toán</span>`;
  return `<span class="tag-nopay">–</span>`;
}

function calcDisc(o) {
  const hh = Number((o["Hoa hồng Shopee trên sản phẩm(₫)"] || "0").toString().replace(/\./g, "")) || 0;
  const ck = Number(o["Chiết Khấu"]) || Number(o["Chiết Khấu 2%"]) || 0;
  return hh === 0 ? 0 : Math.min(ck, Math.round(hh * 0.7));
}

window.toggleOrderGroup = function(el) {
  el.closest('.order-group').classList.toggle('open');
};

function groupOrdersById(orders) {
  const groups = {};
  for (const o of orders) {
    const id = o["ID đơn hàng"] || "UNKNOWN";
    if (!groups[id]) {
      groups[id] = {
        orderId: id,
        items: [],
        totalVal: 0,
        totalDisc: 0,
        status: o["Trạng thái đặt hàng"] || "",
        payment: o.thanhToan || "",
        time: o["Thời Gian Đặt Hàng"] || "",
        userId: o.userId || null,
        isManual: false
      };
    }
    groups[id].items.push(o);
    groups[id].totalVal += Number(o["Giá trị đơn hàng (₫)"]) || 0;
    groups[id].totalDisc += calcDisc(o);
    if (o["Tên Item"] === "Không có thông tin") {
      groups[id].isManual = true;
    }
    if (o.thanhToan && o.thanhToan !== "Chưa cập nhật") {
      groups[id].payment = o.thanhToan;
    }
    
    // Cập nhật trạng thái nhóm: ưu tiên hiển thị "Đang chờ xử lý" hoặc các trạng thái chưa hoàn thành
    const itemStatus = (o["Trạng thái đặt hàng"] || "").trim();
    const currentStatus = groups[id].status.trim().toLowerCase();
    if (itemStatus.toLowerCase() === "đang chờ xử lý") {
      groups[id].status = itemStatus;
    } else if (currentStatus === "hoàn thành" && itemStatus.toLowerCase() !== "hoàn thành" && itemStatus !== "") {
      groups[id].status = itemStatus;
    }
  }
  return Object.values(groups);
}

window.renderMyOrders = renderMyOrders;
function renderMyOrders() {
  const el = document.getElementById("mine-list");
  
  let filteredOrders = myOrders;
  const filterSelect = document.getElementById("order-filter");
  if (filterSelect) {
    const filterVal = filterSelect.value;
    if (filterVal === "paid") {
      filteredOrders = myOrders.filter(o => o.thanhToan === "Đã Thanh Toán");
    } else if (filterVal === "unpaid") {
      filteredOrders = myOrders.filter(o => o.thanhToan !== "Đã Thanh Toán");
    }
  }

  if (!filteredOrders.length) {
    const noFilterMatch = myOrders.length > 0;
    el.innerHTML = `<div style="padding:36px;text-align:center;color:#999;font-size:14px">
      ${noFilterMatch ? 'Không có đơn hàng nào phù hợp với bộ lọc hiện tại.' : 'Chưa có đơn hàng nào.<br>Hãy sang tab <b>🔍 Tìm đơn hàng</b> để tìm và gán đơn về tài khoản!'}
    </div>`;
    return;
  }
  
  let grandTotalVal = 0, grandTotalDisc = 0;
  const groups = groupOrdersById(filteredOrders);

  const html = groups.map(g => {
    grandTotalVal += g.totalVal;
    grandTotalDisc += g.totalDisc;

    let titleText = g.items[0]["Tên Item"] || "Không có thông tin";
    if (g.items.length > 1) {
      titleText += ` (+ ${g.items.length - 1} sản phẩm khác)`;
    }

    const isManual = g.isManual;
    const itemIdsStr = g.items.map(o => o._id).join(',');

    const thaoTac = isManual
      ? `<div style="display:flex;gap:4px">
           <button class="btn-out" style="color: var(--blue); border-color: var(--blue); background: none; font-size:11px; padding:3px 8px; cursor: pointer;" data-id="${escapeHTML(g.orderId)}" onclick="event.stopPropagation(); searchSingleId(this.dataset.id)">🔄 Tìm Lại</button>
           <button class="btn-out" style="color: var(--red); border-color: var(--red); background: none; font-size:11px; padding:3px 8px; cursor: pointer;" data-ids="${escapeHTML(itemIdsStr)}" onclick="event.stopPropagation(); deleteMyOrder(this.dataset.ids, this)">🗑️ Xóa</button>
         </div>`
      : ``;

    const statusHtml = g.status.trim().toLowerCase() === "hoàn thành" 
      ? `<span class="tag-mine" style="font-size:11px;padding:3px 10px">${escapeHTML(g.status)}</span>`
      : `<span>${escapeHTML(g.status)}</span>`;

    const itemsListHtml = g.items.map(o => `
      <div class="detail-item-row">
        <div class="item-name-col">${escapeHTML(o["Tên Item"] || "")}</div>
        <div class="item-price-col">
          <div>Giá: ${(Number(o["Giá trị đơn hàng (₫)"]) || 0).toLocaleString("vi-VN")}đ</div>
          <div style="font-size: 11px; color: var(--green);">CK: ${calcDisc(o).toLocaleString("vi-VN")}đ</div>
        </div>
      </div>
    `).join("");

    return `
    <div class="order-group">
      <div class="order-summary" onclick="toggleOrderGroup(this)">
        <div class="order-summary-left">
          <div class="order-title" title="${escapeHTML(g.items.map(i=>i["Tên Item"] || "").join(', '))}">${escapeHTML(titleText)}</div>
          <div class="order-meta">
            ${statusHtml}
            ${paymentBadge(g.payment)}
            <span style="color:var(--green);font-weight:600">CK: ${(g.totalDisc || 0).toLocaleString("vi-VN")}đ</span>
          </div>
        </div>
        <div class="order-summary-right">
          ${thaoTac}
          <div class="order-chevron">▼</div>
        </div>
      </div>
      <div class="order-details">
        <div class="detail-grid">
          <div class="detail-item"><span class="detail-lbl">Mã đơn hàng</span><span class="detail-val">${escapeHTML(g.orderId)}</span></div>
          <div class="detail-item"><span class="detail-lbl">Thời gian đặt</span><span class="detail-val">${g.time}</span></div>
          <div class="detail-item"><span class="detail-lbl">Tổng giá trị</span><span class="detail-val">${g.totalVal.toLocaleString("vi-VN")}đ</span></div>
          <div class="detail-item"><span class="detail-lbl">Tổng chiết khấu</span><span class="detail-val">${g.totalDisc.toLocaleString("vi-VN")}đ</span></div>
        </div>
        <div class="detail-items-list">
          ${itemsListHtml}
        </div>
      </div>
    </div>
    `;
  }).join("");

  el.innerHTML = `<div class="result-wrap">${html}</div>
  <div class="mobile-summary">
    <span>📦 ${groups.length} đơn (${filteredOrders.length} SP)</span>
    <span>💰 ${grandTotalVal.toLocaleString("vi-VN")}đ</span>
    <span>🎁 CK: ${grandTotalDisc.toLocaleString("vi-VN")}đ</span>
  </div>`;
}

// ─── SEARCH ──────────────────────────────────────────────
const searchCache = new Map();

window.doSearch = async function () {
  const raw = document.getElementById("orderId").value;
  const ids = Array.from(new Set(raw.toUpperCase().split(/[\s,]+/).filter(Boolean)));
  const resultDiv = document.getElementById("search-result");
  if (!ids.length) return;

  const btn = document.getElementById("btn-search");
  btn.disabled = true; btn.textContent = "⏳ Đang tìm...";
  resultDiv.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div>Đang tìm kiếm trong hệ thống...</div>`;

  try {
    let found = [];
    let idsToQuery = [];

    // 1. Kiểm tra cache trước
    for (const id of ids) {
      if (searchCache.has(id)) {
        found.push(...searchCache.get(id));
      } else {
        idsToQuery.push(id);
      }
    }

    // 2. Fetch những ID chưa có trong cache
    if (idsToQuery.length > 0) {
      let newlyFound = [];
      for (let i = 0; i < idsToQuery.length; i += 30) {
        const chunk = idsToQuery.slice(i, i + 30);
        try {
          const snap = await getDocs(query(collection(db, "orders"), where("ID đơn hàng", "in", chunk)));
          snap.docs.forEach(d => newlyFound.push({ _id: d.id, ...d.data() }));
        } catch (qErr) {
          if (qErr.code === "permission-denied") {
            const promises = chunk.map(id => getDoc(doc(db, "orders", id)));
            const snaps = await Promise.all(promises);
            snaps.forEach(s => { if (s.exists()) newlyFound.push({ _id: s.id, ...s.data() }); });
          } else throw qErr;
        }
      }

      // 3. Cập nhật cache với những kết quả mới
      idsToQuery.forEach(id => {
        const matches = newlyFound.filter(o => (o["ID đơn hàng"] || "").toUpperCase() === id);
        searchCache.set(id, matches); // Nếu mảng rỗng (không tìm thấy) cũng lưu lại để tránh truy vấn lại
        found.push(...matches);
      });
    }

    const foundIds = new Set(found.map(o => (o["ID đơn hàng"] || "").toUpperCase()));
    const missingIds = ids.filter(id => !foundIds.has(id.toUpperCase()));

    if (found.length) {
      renderSearchResults(found, resultDiv);
    } else {
      resultDiv.innerHTML = ""; // Remove redundant global error card
    }

    const validMissingIds = missingIds.filter(id => /^\d{6}[0-9A-Z]{8}$/.test(id));
    const invalidMissingIds = missingIds.filter(id => !/^\d{6}[0-9A-Z]{8}$/.test(id));

    if (validMissingIds.length > 0 || invalidMissingIds.length > 0) {
      let missingHtml = "";
      
      if (validMissingIds.length > 0) {
        missingHtml += validMissingIds.map(id => `
        <div style="background:#fff3e0; padding: 14px 18px; border-radius: var(--radius); margin-top: 14px; border: 1px solid #ffcc80; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px;">
          <div>
            <div style="font-weight: 700; color: #e65100; margin-bottom: 4px;">❌ Không tìm thấy ID: ${escapeHTML(id)}</div>
            <div style="font-size: 13px; color: #e65100; opacity: 0.85;">Chưa có trong hệ thống, bạn có muốn lưu tạm?</div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-claim" style="padding: 8px 16px; font-size: 13px;" data-id="${escapeHTML(id)}" onclick="saveMissingOrder(this.dataset.id, this)">💾 Lưu lại đơn hàng</button>
            <button class="btn-out" style="color: var(--blue); border-color: var(--blue); background: none;" data-id="${escapeHTML(id)}" onclick="searchSingleId(this.dataset.id)">🔄 Tìm lại</button>
          </div>
        </div>
        `).join("");
      }

      if (invalidMissingIds.length > 0) {
        missingHtml += `
        <div style="background:#fff3e0; padding: 14px 18px; border-radius: var(--radius); margin-top: 14px; border: 1px solid #ffcc80; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px;">
          <div>
            <div style="font-weight: 700; color: #e65100; margin-bottom: 4px;">⚠️ Không có thông tin đơn hàng</div>
            <div style="font-size: 13px; color: #e65100; opacity: 0.85;">Hãy thử tìm lại bạn nhé.</div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-claim" style="padding: 8px 16px; font-size: 13px; background: #e65100; color: #fff; border: none; cursor: pointer;" onclick="document.getElementById('orderId').value = ''; document.getElementById('orderId').focus(); document.getElementById('search-result').innerHTML = '';">🧹 Xoá văn bản</button>
          </div>
        </div>
        `;
      }

      const missingContainer = document.createElement("div");
      missingContainer.innerHTML = missingHtml;
      resultDiv.appendChild(missingContainer);
    }
  } catch (e) {
    const hint = e.code === "permission-denied"
      ? `<br><small>💡 Lỗi quyền truy cập – liên hệ admin để cập nhật Firestore Security Rules.</small>`
      : "";
    resultDiv.innerHTML = `<div class="not-found">❌ Lỗi: ${e.message}${hint}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = "🔍 Tìm đơn hàng";
  }
};

function renderSearchResults(orders, container) {
  let grandTotalVal = 0, grandTotalDisc = 0;
  const groups = groupOrdersById(orders);

  const html = groups.map(g => {
    grandTotalVal += g.totalVal;
    grandTotalDisc += g.totalDisc;

    let titleText = g.items[0]["Tên Item"] || "Không có thông tin";
    if (g.items.length > 1) {
      titleText += ` (+ ${g.items.length - 1} sản phẩm khác)`;
    }

    const isManual = g.isManual;
    const mineCount = g.items.filter(o => o.userId === me).length;
    const claimedCount = g.items.filter(o => !!o.userId).length;
    
    let actionCell = "";
    const itemIdsStr = g.items.map(o => o._id).join(',');

    if (mineCount === g.items.length) {
      actionCell = isManual
        ? `<div style="display:flex;gap:4px">
             <button class="btn-out" style="color: var(--blue); border-color: var(--blue); background: none; padding:4px 8px; font-size:12px; cursor: pointer;" data-id="${escapeHTML(g.orderId)}" onclick="event.stopPropagation(); searchSingleId(this.dataset.id)">🔄 Tìm Lại</button>
             <button class="btn-out" style="color: var(--red); border-color: var(--red); background: none; padding:4px 8px; font-size:12px; cursor: pointer;" data-ids="${escapeHTML(itemIdsStr)}" onclick="event.stopPropagation(); deleteMyOrder(this.dataset.ids, this)">🗑️ Xóa</button>
           </div>`
        : `<span class="tag-mine">✅ Của tôi</span>`;
    } else if (claimedCount > 0 && mineCount === 0) {
      actionCell = `<span class="tag-other">🔒 Đã gán</span>`;
    } else if (claimedCount > 0 && mineCount > 0) {
      actionCell = `<span class="tag-other">🔒 Đã gán 1 phần</span>`;
    } else {
      actionCell = `<button class="btn-claim" data-ids="${escapeHTML(itemIdsStr)}" onclick="event.stopPropagation(); claimOrder(this.dataset.ids, this)">📌 Gán cho tôi</button>`;
    }

    const statusHtml = g.status.trim().toLowerCase() === "hoàn thành" 
      ? `<span class="tag-mine" style="font-size:11px;padding:3px 10px">${escapeHTML(g.status)}</span>`
      : `<span>${escapeHTML(g.status)}</span>`;

    const itemsListHtml = g.items.map(o => `
      <div class="detail-item-row">
        <div class="item-name-col">${escapeHTML(o["Tên Item"] || "")}</div>
        <div class="item-price-col">
          <div>Giá: ${(Number(o["Giá trị đơn hàng (₫)"]) || 0).toLocaleString("vi-VN")}đ</div>
          <div style="font-size: 11px; color: var(--green);">CK: ${calcDisc(o).toLocaleString("vi-VN")}đ</div>
        </div>
      </div>
    `).join("");

    return `
    <div class="order-group">
      <div class="order-summary" onclick="toggleOrderGroup(this)">
        <div class="order-summary-left">
          <div class="order-title" title="${escapeHTML(g.items.map(i=>i["Tên Item"] || "").join(', '))}">${escapeHTML(titleText)}</div>
          <div class="order-meta">
            ${statusHtml}
            ${paymentBadge(g.payment)}
            <span style="color:var(--green);font-weight:600">CK: ${(g.totalDisc || 0).toLocaleString("vi-VN")}đ</span>
          </div>
        </div>
        <div class="order-summary-right">
          ${actionCell}
          <div class="order-chevron">▼</div>
        </div>
      </div>
      <div class="order-details">
        <div class="detail-grid">
          <div class="detail-item"><span class="detail-lbl">Mã đơn hàng</span><span class="detail-val">${escapeHTML(g.orderId)}</span></div>
          <div class="detail-item"><span class="detail-lbl">Thời gian đặt</span><span class="detail-val">${g.time}</span></div>
          <div class="detail-item"><span class="detail-lbl">Tổng giá trị</span><span class="detail-val">${g.totalVal.toLocaleString("vi-VN")}đ</span></div>
          <div class="detail-item"><span class="detail-lbl">Tổng chiết khấu</span><span class="detail-val">${g.totalDisc.toLocaleString("vi-VN")}đ</span></div>
        </div>
        <div class="detail-items-list">
          ${itemsListHtml}
        </div>
      </div>
    </div>
    `;
  }).join("");

  container.innerHTML = `<div class="card" style="padding:0; background:transparent; box-shadow:none;"><div class="result-wrap">
    ${html}
  </div></div>
  <div class="mobile-summary">
    <span>📦 ${groups.length} đơn (${orders.length} SP)</span>
    <span>💰 ${grandTotalVal.toLocaleString("vi-VN")}đ</span>
    <span>🎁 CK: ${grandTotalDisc.toLocaleString("vi-VN")}đ</span>
  </div>`;
}

// ─── CLAIM ───────────────────────────────────────────────
window.claimOrder = async function (docIdsStr, btn) {
  btn.disabled = true; btn.textContent = "⏳...";
  const docIds = docIdsStr.split(',');
  try {
    const batch = writeBatch(db);
    let anySuccess = false;

    for (const docId of docIds) {
      // Dùng transaction nếu cần check `userId` chặt chẽ, nhưng để nhanh thì cập nhật hàng loạt qua batch
      // (Bỏ qua transaction ở đây để đơn giản và phù hợp xử lý nhiều ID. Có thể sẽ ghi đè nếu vừa bị gán, nhưng xác suất thấp)
      const ref = doc(db, "orders", docId);
      batch.update(ref, { userId: me, claimedAt: serverTimestamp() });
      anySuccess = true;
    }

    if (anySuccess) await batch.commit();

    btn.parentNode.innerHTML = `<span class="tag-mine">✅ Của tôi</span>`;
    await refreshMyOrders();
  } catch (err) {
    btn.disabled = false; btn.textContent = "Lưu Thông Tin Mặc Định";
    alert("❌ Lỗi lưu thông tin: " + err.message);
  }
};

// ─── ZALO OAUTH CALLBACK HANDLER ─────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const zaloCode = urlParams.get('code');
const zaloState = urlParams.get('state');

if (zaloCode && zaloState) {
  const savedState = sessionStorage.getItem('zalo_oauth_state');
  if (savedState) {
    if (zaloState === savedState) {
      sessionStorage.removeItem('zalo_oauth_state');
      window.addEventListener('DOMContentLoaded', () => {
        handleZaloOauth(zaloCode);
      });
    } else {
      console.error("❌ Zalo OAuth state mismatch! CSRF protection triggered.");
      // State không khớp -> dừng flow, không xử lý tiếp
    }
  }
}

async function handleZaloOauth(code) {
  const msgId = localStorage.getItem('zalo_msg_id') || 'login-msg';
  const msg = document.getElementById(msgId);
  if (msg) {
    msg.className = "amsg";
    msg.textContent = "⏳ Đang xác thực với Zalo...";
    msg.style.display = "block";
  }

  const tokenUrl = "/api/zalo/token";
  const codeVerifier = localStorage.getItem('zalo_code_verifier') || '';

  try {
    // PHASE 1: Exchange code for Access Token
    let tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, codeVerifier: codeVerifier })
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error("Lỗi máy chủ khi lấy Token: " + errText);
    }

    let tokenData = await tokenRes.json();
    if (!tokenData.zaloAccessToken) {
      throw new Error("Không nhận được Zalo Access Token.");
    }

    // PHASE 2: Fetch Zalo Profile from Client (IP Việt Nam)
    let profileRes = await fetch('https://graph.zalo.me/v2.0/me?fields=id,name,picture', {
      headers: { 'access_token': tokenData.zaloAccessToken }
    });

    if (!profileRes.ok) {
      throw new Error("Lỗi khi lấy thông tin cá nhân Zalo.");
    }

    let profileData = await profileRes.json();
    if (profileData.error || !profileData.id) {
      throw new Error("Zalo API Error: " + (profileData.message || "Không lấy được ID"));
    }

    const zaloId = profileData.id;
    const realName = profileData.name || "Người dùng Zalo";
    const realAvatar = profileData.picture?.data?.url || "";

    // LINK MODE: user email muốn gắn zaloId vào tài khoản hiện tại
    if (localStorage.getItem('zalo_link_mode') === '1') {
      localStorage.removeItem('zalo_link_mode');
      window.history.replaceState({}, document.title, window.location.pathname);
      if (msg) { msg.className = "amsg"; msg.textContent = "⏳ Đang liên kết..."; msg.style.display = "block"; }

      // Đợi Firebase Auth restore session (me có thể chưa được set lúc này)
      const resolvedUid = await new Promise(resolve => {
        if (me) { resolve(me); return; }
        const unsub = onAuthStateChanged(auth, user => {
          unsub();
          resolve(user ? user.uid : null);
        });
      });

      if (!resolvedUid) {
        if (msg) { msg.className = "amsg err"; msg.textContent = "❌ Bạn cần đăng nhập trước khi liên kết Zalo."; }
        return;
      }

      // Kiểm tra ZaloID này đã được liên kết với tài khoản khác chưa
      const dupSnap = await getDocs(query(collection(db, "users"), where("zaloId", "==", zaloId)));
      const alreadyLinked = dupSnap.docs.find(d => d.id !== resolvedUid);
      if (alreadyLinked) {
        if (msg) { msg.className = "amsg err"; msg.textContent = "❌ Tài khoản Zalo này đã được liên kết với một tài khoản khác."; }
        return;
      }

      await setDoc(doc(db, "users", resolvedUid), { zaloId, updatedAt: serverTimestamp() }, { merge: true });
      if (cachedUserDoc?.data) cachedUserDoc.data.zaloId = zaloId;
      else if (cachedUserDoc) cachedUserDoc.zaloId = zaloId;
      if (msg) { msg.className = "amsg ok"; msg.textContent = "✅ Liên kết Zalo thành công!"; }
      await loadMyBonus();
      return;
    }

    // PHASE 3: Mint Custom Token on Server
    let mintRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zaloId: zaloId, zaloAccessToken: tokenData.zaloAccessToken })
    });

    if (!mintRes.ok) {
      const errText = await mintRes.text();
      throw new Error("Lỗi máy chủ khi tạo phiên đăng nhập: " + errText);
    }

    let mintData = await mintRes.json();
    if (!mintData.customToken) {
      throw new Error("Không nhận được Custom Token.");
    }

    // PHASE 4: Firebase Sign In
    window.history.replaceState({}, document.title, window.location.pathname);
    const userCredential = await signInWithCustomToken(auth, mintData.customToken);
    
    // Cập nhật Profile
    await updateProfile(userCredential.user, { 
      displayName: realName,
      photoURL: realAvatar
    });
    
    // Đọc doc hiện tại để giữ createdAt nếu đã có
    const existingSnap = await getDoc(doc(db, "users", userCredential.user.uid));
    const updateData = {
      name: realName,
      avatar: realAvatar,
      role: "user",
      zaloId: zaloId,
      loginType: "zalo",
      updatedAt: serverTimestamp()
    };
    const isNewUser = !existingSnap.exists() || !existingSnap.data().createdAt;
    if (isNewUser) {
      updateData.createdAt = serverTimestamp();
    }
    await setDoc(doc(db, "users", userCredential.user.uid), updateData, { merge: true });

    // Tạo bonus code cho user Zalo mới đăng ký sau ngày launch
    if (isNewUser && new Date() >= BONUS_LAUNCH_DATE) {
      await createBonusCodeForUser(userCredential.user.uid, zaloId);
    }

    if (msg) {
      msg.className = "amsg ok";
      msg.textContent = "✅ Đăng nhập Zalo thành công!";
    }
  } catch (err) {
    if (msg) {
      msg.className = "amsg err";
      msg.textContent = "❌ Lỗi kết nối Zalo: " + err.message;
    }
    console.error("Zalo Login Error:", err);
  }
}

window.saveMissingOrder = async function (id, btn) {
  btn.disabled = true; btn.textContent = "⏳...";
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, "orders", id);
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        tx.set(ref, {
          "ID đơn hàng": id,
          "Tên Item": "Không có thông tin",
          "Giá trị đơn hàng (₫)": 0,
          "Chiết Khấu": 0,
          "Trạng thái đặt hàng": "",
          userId: me,
          claimedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        if (snap.data().userId) throw new Error("TAKEN");
        tx.update(ref, { userId: me, claimedAt: serverTimestamp() });
      }
    });
    btn.parentNode.innerHTML = `<span class="tag-mine" style="padding: 8px 16px; font-size: 13px;">✅ Đã lưu</span>`;
    await refreshMyOrders();
  } catch (e) {
    if (e.message === "TAKEN") {
      btn.parentNode.innerHTML = `<span class="tag-other" style="padding: 8px 16px; font-size: 13px;">🔒 Đã có người gán</span>`;
    } else {
      btn.disabled = false; btn.textContent = "💾 Lưu lại đơn hàng";
      alert("Lỗi: " + e.message);
    }
  }
};

window.deleteMyOrder = async function (docIdsStr, btn) {
  if (!confirm("Bạn có chắc chắn muốn xóa lưu nháp đơn hàng này không?")) return;
  const oldHtml = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = "⏳";
  const docIds = docIdsStr.split(',');
  try {
    const batch = writeBatch(db);
    for (const id of docIds) {
      batch.delete(doc(db, "orders", id));
    }
    await batch.commit();
    await refreshMyOrders();
    // Refresh search results if we are currently looking at search
    if (document.getElementById("main-search").style.display === "block" && document.getElementById("orderId").value.trim() !== "") {
      doSearch();
    }
  } catch (e) {
    btn.disabled = false; btn.innerHTML = oldHtml;
    alert("Lỗi xóa: " + e.message);
  }
};

window.searchSingleId = function (id) {
  showMainTab('search');
  document.getElementById("orderId").value = id;
  // Cuộn lên phần nhập tìm kiếm nếu cần thiết
  const card = document.getElementById("orderId").closest(".card");
  if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
  doSearch();
};

// ─── PAYMENT REQUEST ──────────────────────────────────────
window.createPaymentRequest = async function () {
  if (!myBankInfo) {
    document.getElementById("bank-info-modal").style.display = "flex";
    return;
  }

  const eligibleOrders = myOrders.filter(o =>
    String(o["Trạng thái đặt hàng"] || "").trim().toLowerCase() === "hoàn thành" &&
    (!o.thanhToan || o.thanhToan === "" || o.thanhToan === "Chưa cập nhật") &&
    o["Tên Item"] !== "Không có thông tin"
  );

  if (!eligibleOrders.length) {
    alert("❌ Không có đơn hàng nào hợp lệ để yêu cầu thanh toán.");
    return;
  }

  let totalVal = 0, totalDisc = 0;
  eligibleOrders.forEach(o => {
    totalVal += Number(o["Giá trị đơn hàng (₫)"]) || 0;
    totalDisc += calcDisc(o);
  });

  const bonusPreview = (myBonusCode && myBonusCode.status === "active") ? `\n🎁 Bonus +${myBonusCode.bonusPercent}%: +${Math.round(totalDisc * (myBonusCode.bonusPercent||10) / 100).toLocaleString("vi-VN")}đ` : "";
  const msg = `Bạn sắp tạo yêu cầu thanh toán cho ${eligibleOrders.length} đơn hàng.\nTổng chiết khấu: ${totalDisc.toLocaleString("vi-VN")}đ${bonusPreview}\n\nBạn có muốn tiếp tục?`;
  if (!confirm(msg)) return;

  const btn = document.querySelector('button[onclick="createPaymentRequest()"]');
  const oldText = btn ? btn.textContent : "💳 Yêu Cầu Thanh Toán Toàn Bộ";
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Đang tạo yêu cầu..."; }

  try {
    const reqId = "REQ_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const orderIds = eligibleOrders.map(o => o._id);

    const batch = writeBatch(db);

    // Create new payment_requests document
    // Kiểm tra bonus active
    let bonusApplied = false, bonusAmount = 0, bonusPercent = 0;
    if (myBonusCode && myBonusCode.status === "active") {
      const expireTs = myBonusCode.expireAt?.toDate ? myBonusCode.expireAt.toDate().getTime() : (myBonusCode.expireAt ? new Date(myBonusCode.expireAt).getTime() : null);
      if (!expireTs || Date.now() <= expireTs) {
        bonusApplied = true;
        bonusPercent = myBonusCode.bonusPercent || BONUS_PERCENT;
        bonusAmount = Math.round(totalDisc * bonusPercent / 100);
      }
    }
    const totalPayout = totalDisc + bonusAmount;

    const reqRef = doc(collection(db, "payment_requests"), reqId);
    batch.set(reqRef, {
      requestId: reqId,
      userId: me,
      userName: myName,
      orderIds: orderIds,
      totalCount: new Set(eligibleOrders.map(o => (o["ID đơn hàng"] || o._id).split("_")[0])).size,
      totalValue: totalDisc,
      totalOrderValue: totalVal,
      bonusApplied,
      bonusPercent: bonusApplied ? bonusPercent : 0,
      bonusAmount: bonusApplied ? bonusAmount : 0,
      totalPayout,
      status: "pending",
      createdAt: serverTimestamp()
    });

    // Update bonusCode → used
    if (bonusApplied && myBonusCode) {
      const bonusRef = doc(db, "bonusCodes", myBonusCode.id);
      batch.update(bonusRef, {
        status: "used",
        usedAt: serverTimestamp(),
        usedOnRequestId: reqId,
        bonusAmount,
      });
    }

    // Update all relevant orders
    eligibleOrders.forEach(o => {
      const orderRef = doc(db, "orders", o._id);
      batch.update(orderRef, { thanhToan: "Đang chờ xử lý", updatedAt: serverTimestamp() });
    });

    await batch.commit();
    const bonusMsg = bonusApplied ? `\n🎁 Bonus +${bonusAmount.toLocaleString("vi-VN")}đ đã được áp dụng!` : "";
    alert(`✅ Đã tạo yêu cầu thanh toán thành công!${bonusMsg}`);
    await refreshMyOrders();
    if (bonusApplied) loadMyBonus();
  } catch (e) {
    alert("❌ Lỗi: " + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText; }
  }
};

// ─── BONUS CODE ───────────────────────────────────────────
const BONUS_LAUNCH_DATE = new Date("2026-07-01T00:00:00+07:00");
const BONUS_PERCENT = 10;

function genBonusCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "SD-";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function createBonusCodeForUser(userId, zaloId) {
  try {
    // Kiểm tra đã có bonus code chưa
    const existing = await getDocs(query(
      collection(db, "bonusCodes"),
      where("userId", "==", userId),
      limit(1)
    ));
    if (!existing.empty) return; // đã có rồi

    // Sinh code unique
    let code, attempt = 0;
    do {
      code = genBonusCode();
      const snap = await getDoc(doc(db, "bonusCodes", code));
      if (!snap.exists()) break;
      attempt++;
    } while (attempt < 5);

    await setDoc(doc(db, "bonusCodes", code), {
      code,
      userId,
      zaloId,
      status: "pending",
      bonusPercent: BONUS_PERCENT,
      createdAt: serverTimestamp(),
      activatedAt: null,
      expireAt: null,
      usedAt: null,
      usedOnRequestId: null,
      bonusAmount: null,
    });
    return code;
  } catch (e) {
    console.error("createBonusCode error:", e);
  }
}

let myBonusCode = null;   // mã tốt nhất để áp dụng khi rút
let myBonusCodes = [];    // toàn bộ mã của user

async function loadMyBonus() {
  if (!me) return;
  const snap = await getDocs(query(
    collection(db, "bonusCodes"),
    where("userId", "==", me)
  ));
  myBonusCodes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Ưu tiên: active chưa hết hạn > pending > còn lại
  const now = Date.now();
  const getTs = b => b.expireAt?.toDate ? b.expireAt.toDate().getTime() : (b.expireAt ? new Date(b.expireAt).getTime() : null);
  const activeValid = myBonusCodes.filter(b => {
    if (b.status !== "active") return false;
    const ts = getTs(b);
    return !ts || now <= ts;
  });
  const pending = myBonusCodes.filter(b => b.status === "pending");
  myBonusCode = activeValid[0] || pending[0] || myBonusCodes[0] || null;

  renderBonusTab();
}

function bonusCard(borderColor, icon, title, bodyHtml) {
  return `<div class="card" style="border-top:3px solid ${borderColor};text-align:center;margin-bottom:16px">
    <div style="font-size:48px;margin-bottom:12px">${icon}</div>
    <div style="font-size:18px;font-weight:700;color:#333;margin-bottom:8px">${title}</div>
    ${bodyHtml}
  </div>`;
}

function renderBonusTab() {
  const el = document.getElementById("main-bonus-content");
  if (!el) return;
  const userData = cachedUserDoc?.data || cachedUserDoc;
  const isZalo = userData && userData.loginType === "zalo";

  if (!isZalo) {
    // Nếu user email đã liên kết zaloId rồi thì cho qua
    if (userData && userData.zaloId) {
      // có zaloId → tiếp tục render bonus bình thường
    } else {
      el.innerHTML = bonusCard("#0068ff", "🔗", "Liên kết tài khoản Zalo",
        `<div style="font-size:14px;color:#555;line-height:1.8;margin-bottom:16px">
           Liên kết Zalo để sử dụng tính năng Bonus.<br>
           <span style="font-size:12px;color:#aaa">Tài khoản email của bạn vẫn giữ nguyên.</span>
         </div>
         <button onclick="doLinkZalo('bonus-link-msg')" style="display:inline-flex;align-items:center;gap:8px;background:#0068ff;color:#fff;border:none;border-radius:12px;padding:12px 24px;font-size:15px;font-weight:600;cursor:pointer">
           <svg width="18" height="18" viewBox="0 0 460.1 436.3" fill="none"><path d="M230.1 0C103 0 0 92.5 0 206.5C0 268 30.6 323.4 82 359.8C80.2 373.1 72.8 406.8 61.3 430.7C60.2 433 62 435.6 64.5 435.1C91.5 430 139.6 414.5 168.3 395.4C188 401 208.6 404 230.1 404C357.2 404 460.1 311.5 460.1 197.5C460.1 83.5 357.2 0 230.1 0Z" fill="white"/></svg>
           Liên kết Zalo
         </button>
         <div id="bonus-link-msg" class="amsg" style="margin-top:10px"></div>`);
      updateBonusBadge(null);
      return;
    }
  }

  // ── Helper render danh sách tất cả mã (nếu > 1)
  function renderAllCodesList() {
    if (myBonusCodes.length <= 1) return "";
    const statusLabel = s => ({ pending:"⏳ Chờ kích hoạt", active:"✅ Đang hoạt động", used:"🎉 Đã dùng", expired:"⏰ Hết hạn", revoked:"🚫 Thu hồi" }[s] || s);
    const statusColor = s => ({ pending:"#EE4D2D", active:"#0abd50", used:"#0a6ebd", expired:"#999", revoked:"#999" }[s] || "#999");
    const list = myBonusCodes.map(bc => {
      const ts = bc.expireAt?.toDate ? bc.expireAt.toDate().getTime() : (bc.expireAt ? new Date(bc.expireAt).getTime() : null);
      const expStr = ts ? new Date(ts).toLocaleDateString("vi-VN") : "Không hạn";
      const isBest = bc.id === myBonusCode?.id;
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;background:${isBest?"#fff8f0":"#f9f9f9"};border:1px solid ${isBest?"#EE4D2D":"#eee"};margin-bottom:8px">
        <div style="flex:1;min-width:0">
          <div style="font-family:monospace;font-weight:700;font-size:14px;color:#333">${escapeHTML(bc.code)}${isBest?' <span style="font-size:11px;background:#EE4D2D;color:#fff;border-radius:4px;padding:1px 5px">Đang dùng</span>':''}</div>
          <div style="font-size:12px;color:#888;margin-top:2px">+${bc.bonusPercent}% · Hết hạn: ${expStr}</div>
        </div>
        <div style="font-size:12px;font-weight:600;color:${statusColor(bc.status)};white-space:nowrap">${statusLabel(bc.status)}</div>
      </div>`;
    }).join("");
    return `<div class="card" style="margin-top:4px"><div style="font-size:13px;font-weight:600;color:#555;margin-bottom:10px">📋 Tất cả mã của bạn (${myBonusCodes.length})</div>${list}</div>`;
  }

  if (!myBonusCode) {
    el.innerHTML = bonusCard("#eee", "🎁", "Chưa có ưu đãi",
      `<div style="font-size:14px;color:#777">Tài khoản của bạn chưa có mã bonus nào.</div>`);
    return;
  }

  const b = myBonusCode;
  const now = Date.now();
  const expireTs = b.expireAt?.toDate ? b.expireAt.toDate().getTime() : (b.expireAt ? new Date(b.expireAt).getTime() : null);
  const daysLeft = expireTs ? Math.max(0, Math.ceil((expireTs - now) / 86400000)) : null;
  const expireStr = expireTs ? new Date(expireTs).toLocaleDateString("vi-VN") : "";

  if (b.status === "active" && expireTs && now > expireTs) {
    el.innerHTML = bonusCard("#ccc", "⏰", "Ưu đãi đã hết hạn",
      `<div style="font-size:14px;color:#777">Bạn đã kích hoạt nhưng không sử dụng trong 30 ngày.</div>`) + renderAllCodesList();
    updateBonusBadge(null);
    return;
  }

  if (b.status === "pending") {
    const syntax = `/sandeal ${b.code}`;
    el.innerHTML = bonusCard("#EE4D2D", "🎁", "Bạn có ưu đãi chờ kích hoạt!",
      `<div style="font-size:14px;color:#555;line-height:1.6;margin-bottom:14px">Nhắn tin vào group Zalo để nhận <b style="color:#EE4D2D">+${b.bonusPercent}%</b> cho lần rút đầu tiên.</div>
       <div style="display:flex;align-items:center;gap:8px;background:#f5f5f5;border-radius:10px;padding:10px 14px;margin-bottom:8px;flex-wrap:wrap;justify-content:center">
         <span style="font-size:13px;color:#888">Cú pháp:</span>
         <span id="bonus-syntax-text" style="font-family:monospace;font-size:15px;font-weight:700;color:#EE4D2D;letter-spacing:1px">${escapeHTML(syntax)}</span>
         <button id="bonus-copy-btn" onclick="copyBonusSyntax()" style="background:#EE4D2D;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.2s">📋 Copy</button>
       </div>
       <div style="font-size:12px;color:#aaa">Gửi vào group Zalo Sandeal.io.vn</div>`) + renderAllCodesList();
    updateBonusBadge("pending");
    return;
  }

  if (b.status === "active") {
    const activatedStr = b.activatedAt?.toDate
      ? b.activatedAt.toDate().toLocaleDateString("vi-VN")
      : (b.activatedAt ? new Date(b.activatedAt).toLocaleDateString("vi-VN") : "–");
    const expireInfo = expireTs
      ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #d1fae5">
           <span style="color:#888">⏳ Hết hạn</span><b>${expireStr} (còn ${daysLeft} ngày)</b>
         </div>`
      : `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #d1fae5">
           <span style="color:#888">⏳ Hết hạn</span><b>Không giới hạn</b>
         </div>`;
    el.innerHTML = bonusCard("#0abd50", "✅", "Bonus đang hoạt động!",
      `<div style="font-size:14px;color:#555;margin-bottom:14px"><b style="color:#0abd50;font-size:18px">+${b.bonusPercent}%</b> sẽ được cộng vào lần rút đầu tiên của bạn.</div>
       <div style="background:#f0fdf4;border-radius:10px;padding:10px 14px;font-size:13px;color:#333;line-height:2">
         <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #d1fae5">
           <span style="color:#888">🎫 Mã</span><b style="font-family:monospace;letter-spacing:1px">${escapeHTML(b.code)}</b>
         </div>
         <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #d1fae5">
           <span style="color:#888">📅 Kích hoạt</span><b>${activatedStr}</b>
         </div>
         ${expireInfo}
         <div style="display:flex;justify-content:space-between;padding:6px 0">
           <span style="color:#888">💰 Bonus</span><b style="color:#0abd50">+${b.bonusPercent}% hoa hồng lần rút đầu</b>
         </div>
       </div>`) + renderAllCodesList();
    updateBonusBadge("active");
    return;
  }

  if (b.status === "used") {
    const usedDate = b.usedAt?.toDate ? b.usedAt.toDate().toLocaleDateString("vi-VN") : "";
    const bonusAmt = b.bonusAmount ? b.bonusAmount.toLocaleString("vi-VN") + "đ" : "";
    el.innerHTML = bonusCard("#0a6ebd", "🎉", "Đã sử dụng bonus!",
      `<div style="font-size:14px;color:#555">Bạn đã nhận <b style="color:#0a6ebd">+${bonusAmt}</b> bonus vào lần rút ngày ${usedDate}.</div>`) + renderAllCodesList();
    updateBonusBadge(null);
    return;
  }

  el.innerHTML = bonusCard("#ccc", "⏰", "Ưu đãi đã hết hạn",
    `<div style="font-size:14px;color:#777">Mã bonus đã hết hạn sử dụng.</div>`) + renderAllCodesList();
  updateBonusBadge(null);
}

function updateBonusBadge(status) {
  const badge = document.getElementById("nav-bonus-badge");
  if (!badge) return;
  badge.style.display = (status === "pending" || status === "active") ? "inline-block" : "none";
}

window.copyBonusSyntax = function () {
  const txt = document.getElementById("bonus-syntax-text")?.textContent || "";
  const btn = document.getElementById("bonus-copy-btn");
  navigator.clipboard.writeText(txt).then(() => {
    if (btn) {
      btn.textContent = "✅ Đã copy!";
      btn.style.background = "#22c55e";
      setTimeout(() => {
        btn.textContent = "📋 Copy";
        btn.style.background = "#EE4D2D";
      }, 2000);
    }
  }).catch(() => {
    if (btn) {
      btn.textContent = "❌ Lỗi";
      setTimeout(() => { btn.textContent = "📋 Copy"; }, 2000);
    }
  });
};

// ─── NAV TABS ─────────────────────────────────────────────
window.showMainTab = function (tab) {
  document.getElementById("main-search").style.display = tab === "search" ? "block" : "none";
  document.getElementById("main-mine").style.display = tab === "mine" ? "block" : "none";
  document.getElementById("main-bonus").style.display = tab === "bonus" ? "block" : "none";
  document.getElementById("nav-search").classList.toggle("active", tab === "search");
  document.getElementById("nav-mine").classList.toggle("active", tab === "mine");
  document.getElementById("nav-bonus").classList.toggle("active", tab === "bonus");
};

// ─── SWIPE BETWEEN TABS ───────────────────────────────────
(function () {
  let startX = 0, startY = 0;
  const THRESHOLD = 60;
  const MAX_Y = 80;
  const TABS = ["search", "mine", "bonus"];

  const container = document.getElementById("app-screen");
  if (!container) return;

  container.addEventListener("touchstart", e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  container.addEventListener("touchend", e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dy) > MAX_Y) return;
    if (Math.abs(dx) < THRESHOLD) return;

    const currentIdx = TABS.findIndex(t => {
      const el = document.getElementById("main-" + t);
      return el && el.style.display !== "none";
    });
    if (currentIdx === -1) return;
    if (dx < 0 && currentIdx < TABS.length - 1) window.showMainTab(TABS[currentIdx + 1]);
    if (dx > 0 && currentIdx > 0) window.showMainTab(TABS[currentIdx - 1]);
  }, { passive: true });
})();

window.switchTab = function (tab) {
  document.getElementById("tab-login").style.display = tab === "login" ? "block" : "none";
  document.getElementById("tab-register").style.display = tab === "register" ? "block" : "none";
  document.getElementById("tab-forgot").style.display = tab === "forgot" ? "block" : "none";
  document.querySelectorAll(".auth-tab").forEach((el, i) =>
    el.classList.toggle("active", (tab === "login" && i === 0) || (tab === "register" && i === 1))
  );
};
window.showForgotPassword = function () {
  switchTab("forgot");
};

// ─── AUTH ACTIONS ─────────────────────────────────────────
window.doLinkZalo = function (msgId = "bonus-link-msg") {
  const msg = document.getElementById(msgId);
  if (msg) { msg.className = "amsg"; msg.textContent = "⏳ Đang chuyển hướng sang Zalo..."; msg.style.display = "block"; }
  localStorage.setItem('zalo_link_mode', '1');
  localStorage.setItem('zalo_msg_id', msgId);
  const appId = '1150083649033793704';
  const redirectUrl = encodeURIComponent(window.location.origin + window.location.pathname);
  const state = crypto.randomUUID();
  sessionStorage.setItem('zalo_oauth_state', state);
  window.location.href = `https://oauth.zaloapp.com/v4/permission?app_id=${appId}&redirect_uri=${redirectUrl}&state=${state}`;
};

window.doLoginZalo = function (msgId = "login-msg") {
  const msg = document.getElementById(msgId);
  msg.className = "amsg";
  msg.textContent = "⏳ Đang chuyển hướng sang Zalo...";
  msg.style.display = "block";
  
  const appId = '1150083649033793704';
  const redirectUrl = encodeURIComponent(window.location.origin + window.location.pathname);
  const state = crypto.randomUUID(); // Sinh state ngẫu nhiên chống CSRF
  
  sessionStorage.setItem('zalo_oauth_state', state);
  
  // Lưu lại ID của message box để hiện thị lỗi sau khi redirect về
  localStorage.setItem('zalo_msg_id', msgId);
  
  window.location.href = `https://oauth.zaloapp.com/v4/permission?app_id=${appId}&redirect_uri=${redirectUrl}&state=${state}`;
};

async function handleZaloFirebaseLogin(zaloId, name, msgEl, serverPass = null) {
  const email = `${zaloId}@zalo.com`;
  
  // Nếu có serverPass (do server API trả về từ Firestore) thì giải mã base64 để dùng
  let pass = serverPass ? atob(serverPass) : null;
  
  try {
    if (pass) {
      // Đăng nhập bằng pass giải mã được
      await signInWithEmailAndPassword(auth, email, pass);
      msgEl.className = "amsg ok"; 
      msgEl.textContent = "✅ Đăng nhập thành công!";
      return;
    }
    
    // Nếu chưa có pass, thử đăng nhập bằng password default (dành cho các user cũ chưa được migrate)
    const oldPass = `ZaloAuth_${zaloId}_#`;
    await signInWithEmailAndPassword(auth, email, oldPass);
    msgEl.className = "amsg ok"; 
    msgEl.textContent = "✅ Đăng nhập thành công!";
  } catch (e) {
    // Nếu không tìm thấy user hoặc sai password, tạo mới với pass ngẫu nhiên an toàn
    if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') {
      try {
        const randomArray = new Uint8Array(16);
        crypto.getRandomValues(randomArray);
        const newPass = Array.from(randomArray).map(b => b.toString(16).padStart(2, '0')).join('');
        
        const cred = await createUserWithEmailAndPassword(auth, email, newPass);
        await updateProfile(cred.user, { displayName: name });
        await setDoc(doc(db, "users", cred.user.uid), {
          name: name,
          email: email,
          role: "user",
          createdAt: serverTimestamp(),
          zaloId: zaloId,
          zaloPass: btoa(newPass) // Mã hóa nhẹ (base64) trước khi lưu vào Firestore
        });
        
        msgEl.className = "amsg ok"; 
        msgEl.textContent = "✅ Đăng ký thành công!";
      } catch (err) {
        msgEl.className = "amsg err";
        msgEl.textContent = "❌ Lỗi tạo tài khoản: " + err.message;
      }
    } else {
      msgEl.className = "amsg err";
      msgEl.textContent = "❌ Lỗi đăng nhập: " + e.message;
    }
  }
}

window.doLogin = async function () {
  const email = document.getElementById("login-email").value.trim();
  const pass = document.getElementById("login-pass").value;
  const msg = document.getElementById("login-msg");
  msg.className = "amsg";
  if (!email || !pass) { msg.className = "amsg err"; msg.textContent = "Vui lòng nhập đầy đủ."; return; }
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    msg.className = "amsg err";
    msg.textContent = e.code === "auth/invalid-credential" ? "❌ Email hoặc mật khẩu không đúng." : "❌ " + e.message;
  }
};

window.doRegister = async function () {
  const name = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const pass = document.getElementById("reg-pass").value;
  const refEmail = document.getElementById("reg-ref").value.trim();
  const msg = document.getElementById("reg-msg");
  msg.className = "amsg";
  // Xoá lỗi cũ
  ["reg-name","reg-email","reg-pass"].forEach(id => {
    const el = document.getElementById(id);
    el.style.borderColor = "";
    const err = el.parentElement.querySelector(".field-err");
    if (err) err.remove();
  });

  let hasErr = false;
  function fieldErr(id, text) {
    const el = document.getElementById(id);
    el.style.borderColor = "#e53e3e";
    const span = document.createElement("span");
    span.className = "field-err";
    span.style.cssText = "color:#e53e3e;font-size:12px;margin-top:3px;display:block";
    span.textContent = text;
    el.parentElement.appendChild(span);
    hasErr = true;
  }

  if (!name) fieldErr("reg-name", "Vui lòng nhập họ tên");
  if (!email) fieldErr("reg-email", "Vui lòng nhập email");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErr("reg-email", "Email không hợp lệ");
  if (!pass) fieldErr("reg-pass", "Vui lòng nhập mật khẩu");
  else if (pass.length < 6) fieldErr("reg-pass", "Mật khẩu phải ít nhất 6 ký tự");
  if (hasErr) return;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "users", cred.user.uid), { name, email, role: "user", refEmail, createdAt: serverTimestamp() });
    // Cập nhật tên trực tiếp vì onAuthStateChanged đã fire trước khi updateProfile xong
    myName = name;
    cachedUserDoc = { uid: cred.user.uid, data: { name, email, role: "user", refEmail } };
    document.getElementById("header-uname").textContent = name;
    document.getElementById("welcome-name").textContent = name;
    msg.className = "amsg ok"; msg.textContent = "✅ Đăng ký thành công!";
  } catch (e) {
    msg.className = "amsg err";
    msg.textContent = e.code === "auth/email-already-in-use" ? "❌ Email đã được dùng." : "❌ " + e.message;
  }
};

window.doForgotPassword = async function () {
  const email = document.getElementById("forgot-email").value.trim();
  const msg = document.getElementById("forgot-msg");
  msg.className = "amsg";
  if (!email) { msg.className = "amsg err"; msg.textContent = "Vui lòng nhập email."; return; }
  try {
    const btn = document.querySelector('#tab-forgot .btn-main');
    btn.disabled = true; btn.textContent = "Đang gửi...";
    await sendPasswordResetEmail(auth, email);
    msg.className = "amsg ok"; msg.textContent = "✅ Đã gửi link tới email của bạn (kiểm tra cả thư rác).";
    btn.disabled = false; btn.textContent = "Gửi Lại Lần Nữa";
  } catch (e) {
    const btn = document.querySelector('#tab-forgot .btn-main');
    btn.disabled = false; btn.textContent = "Gửi Email Khôi Phục";
    msg.className = "amsg err";
    if (e.code === "auth/invalid-email") msg.textContent = "❌ Email không hợp lệ.";
    else if (e.code === "auth/user-not-found") msg.textContent = "❌ Không tìm thấy tài khoản với email này.";
    else msg.textContent = "❌ Lỗi: " + e.message;
  }
};

window.doLogout = async function () {
  await signOut(auth);
  
  const searchResult = document.getElementById("search-result");
  if (searchResult) searchResult.innerHTML = "";
  
  const orderId = document.getElementById("orderId");
  if (orderId) orderId.value = "";
  
  const bankFullname = document.getElementById("bank-fullname");
  if (bankFullname) {
    bankFullname.value = "";
    bankFullname.disabled = false;
  }
  
  const bankAccount = document.getElementById("bank-account");
  if (bankAccount) {
    bankAccount.value = "";
    bankAccount.disabled = false;
  }
  
  const bankName = document.getElementById("bank-name");
  if (bankName) bankName.disabled = false;
  
  const btnSaveBank = document.getElementById("btn-save-bank");
  if (btnSaveBank) {
    btnSaveBank.style.display = "block";
    btnSaveBank.textContent = "Lưu Thông Tin Mặc Định";
  }
  
  const bankInfoMsg = document.getElementById("bank-info-msg");
  if (bankInfoMsg) bankInfoMsg.style.display = "none";
};

// ─── BANK API ─────────────────────────────────────────────
let banksList = [];
window.loadBanksList = async function () {
  const select = document.getElementById("bank-name");
  try {
    let data;
    const r2 = await fetch("https://api.vietqr.io/v2/banks");
    data = await r2.json();
    banksList = data.data || [];
    select.innerHTML = '<option value="">-- Chọn ngân hàng --</option>' + banksList.map(b => `<option value="${escapeHTML(b.short_name || b.shortName)}">${escapeHTML(b.name)} (${b.short_name || b.shortName})</option>`).join("");
  } catch (err) {
    select.innerHTML = '<option value="">-- Lỗi tải danh sách ngân hàng --</option>';
  }
};

window.saveBankInfo = async function () {
  const fullname = document.getElementById("bank-fullname").value.trim().toUpperCase();
  const bank = document.getElementById("bank-name").value;
  const account = document.getElementById("bank-account").value.trim();

  if (!fullname || !bank || !account) {
    alert("❌ Vui lòng điền đầy đủ cả 3 thông tin!");
    return;
  }

  if (!confirm("⚠️ Chú ý: Bạn chỉ được nhập thông tin thanh toán MỘT LẦN DUY NHẤT.\n\nNếu sai sót sẽ không nhận được tiền. Bạn có chắc chắn thông tin cung cấp là CHÍNH XÁC không?")) return;

  const btn = document.getElementById("btn-save-bank");
  btn.disabled = true; btn.textContent = "⏳ Đang lưu...";
  try {
    await updateDoc(doc(db, "users", me), {
      bankFullName: fullname,
      bankName: bank,
      bankAccount: account,
      updatedAt: serverTimestamp()
    });
    myBankInfo = { bankFullName: fullname, bankName: bank, bankAccount: account };
    alert("✅ Lưu thông tin thanh toán thành công!\nBạn có thể Yêu cầu thanh toán ngay bây giờ.");
    document.getElementById("bank-info-modal").style.display = "none";
  } catch (e) {
    alert("❌ Lỗi lưu thông tin (có quyền bị giới hạn hoặc lỗi định dạng): " + e.message);
  } finally {
    btn.disabled = false; btn.textContent = "Lưu Thông Tin";
  }
};
