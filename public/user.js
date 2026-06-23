import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile, sendPasswordResetEmail
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
    
    myName = uData.name || user.email;

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
    if (String(o["Trạng thái đặt hàng"] || "").trim().toLowerCase() === "hoạn thạnh" && o.thanhToan !== "Đã Thanh Toán") {
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

function getStatusBadge(status) {
  if (!status) return "";
  const s = status.trim().toLowerCase();
  
  let bgColor = "#f3f4f6";
  let color = "#4b5563";
  
  if (s === "hoàn thành") {
    bgColor = "#d1fae5";
    color = "#065f46";
  } else if (s === "đang chờ xử lý" || s === "chờ xử lý") {
    bgColor = "#fef3c7";
    color = "#92400e";
  } else if (s === "đã hủy" || s === "hủy" || s === "huỷ" || s === "đã huỷ") {
    bgColor = "#fee2e2";
    color = "#991b1b";
  } else if (s === "đang vận chuyển" || s === "đang giao") {
    bgColor = "#dbeafe";
    color = "#1e40af";
  } else if (s === "đã xác nhận" || s === "xác nhận") {
    bgColor = "#e0e7ff";
    color = "#3730a3";
  }
  
  return `<span style="display:inline-block; font-size:11px; padding:3px 10px; border-radius:12px; font-weight:600; background-color:${bgColor}; color:${color}; border: 1px solid ${color}33;">${status}</span>`;
}

function paymentBadge(val) {
  const commonStyle = 'display:inline-block; font-size:11px; padding:3px 10px; border-radius:12px; font-weight:600; border: 1px solid transparent;';
  if (val === 'Đã Thanh Toán') return `<span style="${commonStyle} background-color:#d1fae5; color:#065f46; border-color:#065f4633;">💚 Đã Thanh Toán</span>`;
  if (val === 'Đang chờ xử lý') return `<span style="${commonStyle} background-color:#fef3c7; color:#92400e; border-color:#92400e33;">⏳ Đang chờ xử lý</span>`;
  if (val === 'Chưa Thanh Toán') return `<span style="${commonStyle} background-color:#fee2e2; color:#991b1b; border-color:#991b1b33;">🟡 Chưa Thanh Toán</span>`;
  return `<span style="${commonStyle} background-color:#f3f4f6; color:#4b5563;">–</span>`;
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
    
    // Cập nhật trạng thái nhóm: ưu tiên hiển thị "Đang chờ xử lý" hoặc các trạng thái chưa hoạn thạnh
    const itemStatus = (o["Trạng thái đặt hàng"] || "").trim();
    const currentStatus = groups[id].status.trim().toLowerCase();
    if (itemStatus.toLowerCase() === "đang chờ xử lý") {
      groups[id].status = itemStatus;
    } else if (currentStatus === "hoạn thạnh" && itemStatus.toLowerCase() !== "hoạn thạnh" && itemStatus !== "") {
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
           <button class="btn-out" style="color: var(--blue); border-color: var(--blue); background: none; font-size:11px; padding:3px 8px; cursor: pointer;" onclick="event.stopPropagation(); searchSingleId('${g.orderId}')">🔄 Tìm Lỗi</button>
           <button class="btn-out" style="color: var(--red); border-color: var(--red); background: none; font-size:11px; padding:3px 8px; cursor: pointer;" onclick="event.stopPropagation(); deleteMyOrder('${itemIdsStr}', this)">🗑️ Xóa</button>
         </div>`
      : ``;

    const statusHtml = getStatusBadge(g.status);

    const itemsListHtml = g.items.map(o => `
      <div class="detail-item-row">
        <div class="item-name-col">${o["Tên Item"] || ""}</div>
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
          <div class="order-title" title="${g.items.map(i=>(i["Tên Item"] || "").replace(/"/g, '&quot;')).join(', ')}">${titleText}</div>
          <div class="order-meta">
            ${statusHtml}
            ${paymentBadge(g.payment)}
            <span>Mã: ${g.orderId}</span>
          </div>
        </div>
        <div class="order-summary-right">
          ${thaoTac}
          <div class="order-chevron">▼</div>
        </div>
      </div>
      <div class="order-details">
        <div class="detail-grid">
          <div class="detail-item"><span class="detail-lbl">Mã đơn hàng</span><span class="detail-val">${g.orderId}</span></div>
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

    const validMissingIds = missingIds.filter(id => /^[0-9A-Z]{14,15}$/.test(id));
    const invalidMissingIds = missingIds.filter(id => !/^[0-9A-Z]{14,15}$/.test(id));

    if (validMissingIds.length > 0 || invalidMissingIds.length > 0) {
      let missingHtml = "";
      
      if (validMissingIds.length > 0) {
        missingHtml += validMissingIds.map(id => `
        <div style="background:#fff3e0; padding: 14px 18px; border-radius: var(--radius); margin-top: 14px; border: 1px solid #ffcc80; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px;">
          <div>
            <div style="font-weight: 700; color: #e65100; margin-bottom: 4px;">❌ Không tìm thấy ID: ${id}</div>
            <div style="font-size: 13px; color: #e65100; opacity: 0.85;">Chưa có trong hệ thống, bạn có muốn lưu tạm?</div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-claim" style="padding: 8px 16px; font-size: 13px;" onclick="saveMissingOrder('${id}', this)">💾 Lưu lại đơn hàng</button>
            <button class="btn-out" style="color: var(--blue); border-color: var(--blue); background: none;" onclick="searchSingleId('${id}')">🔄 Tìm lại</button>
          </div>
        </div>
        `).join("");
      }

      if (invalidMissingIds.length > 0) {
        missingHtml += `
        <div style="background:#fff3e0; padding: 14px 18px; border-radius: var(--radius); margin-top: 14px; border: 1px solid #ffcc80; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px;">
          <div>
            <div style="font-weight: 700; color: #e65100; margin-bottom: 4px;">⚠️ Không có thông tin đơn hàng</div>
            <div style="font-size: 13px; color: #e65100; opacity: 0.85;">Có vẻ bạn đã nhập đoạn văn bản hoặc nội dung không hợp lệ.</div>
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
             <button class="btn-out" style="color: var(--blue); border-color: var(--blue); background: none; padding:4px 8px; font-size:12px; cursor: pointer;" onclick="event.stopPropagation(); searchSingleId('${g.orderId}')">🔄 Tìm Lỗi</button>
             <button class="btn-out" style="color: var(--red); border-color: var(--red); background: none; padding:4px 8px; font-size:12px; cursor: pointer;" onclick="event.stopPropagation(); deleteMyOrder('${itemIdsStr}', this)">🗑️ Xóa</button>
           </div>`
        : `<span class="tag-mine">✅ Của tôi</span>`;
    } else if (claimedCount > 0 && mineCount === 0) {
      actionCell = `<span class="tag-other">🔒 Đã gán</span>`;
    } else if (claimedCount > 0 && mineCount > 0) {
      actionCell = `<span class="tag-other">🔒 Đã gán 1 phần</span>`;
    } else {
      actionCell = `<button class="btn-claim" onclick="event.stopPropagation(); claimOrder('${itemIdsStr}', this)">📌 Gán cho tôi</button>`;
    }

    const statusHtml = getStatusBadge(g.status);

    const itemsListHtml = g.items.map(o => `
      <div class="detail-item-row">
        <div class="item-name-col">${o["Tên Item"] || ""}</div>
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
          <div class="order-title" title="${g.items.map(i=>(i["Tên Item"] || "").replace(/"/g, '&quot;')).join(', ')}">${titleText}</div>
          <div class="order-meta">
            ${statusHtml}
            ${paymentBadge(g.payment)}
            <span>Mã: ${g.orderId}</span>
          </div>
        </div>
        <div class="order-summary-right">
          ${actionCell}
          <div class="order-chevron">▼</div>
        </div>
      </div>
      <div class="order-details">
        <div class="detail-grid">
          <div class="detail-item"><span class="detail-lbl">Mã đơn hàng</span><span class="detail-val">${g.orderId}</span></div>
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
  // Gửi code (và code_verifier nếu có trong localStorage) lên server
  const codeVerifier = localStorage.getItem('zalo_code_verifier') || '';
  const body = JSON.stringify({ code: code, codeVerifier: codeVerifier });

  const headers = {
    'Content-Type': 'application/json'
  };

  try {
    let response = await fetch(tokenUrl, {
      method: 'POST',
      headers: headers,
      body: body
    });

    if (!response.ok) {
      throw new Error("Failed to fetch token from server");
    }

    let data = await response.json();
    if (data.access_token) {
      // Nếu server trả về pass thì ưu tiên dùng, nếu không thì get profile
      if (data.zaloPass && data.zaloId) {
         window.history.replaceState({}, document.title, window.location.pathname);
         await handleZaloFirebaseLogin(data.zaloId, data.name || "Người dùng Zalo", msg, data.zaloPass);
      } else {
         getZaloUserProfile(data.access_token, msg);
      }
    } else {
      throw new Error(data.error_name || "Lấy token thất bại");
    }
  } catch (err) {
    if (msg) {
      msg.className = "amsg err";
      msg.textContent = "❌ Lỗi kết nối Zalo: " + err.message;
    }
  }
}

async function getZaloUserProfile(accessToken, msgEl) {
  try {
    const res = await fetch(`/api/zalo/profile?access_token=${accessToken}`);
    const data = await res.json();
    if (data.id) {
      window.history.replaceState({}, document.title, window.location.pathname);
      await handleZaloFirebaseLogin(data.id, data.name || "Người dùng Zalo", msgEl || document.createElement('div'));
    } else {
      throw new Error("Không lấy được profile: " + JSON.stringify(data));
    }
  } catch (err) {
    if (msgEl) {
      msgEl.className = "amsg err";
      msgEl.textContent = "❌ Lỗi lấy thông tin Zalo: " + err.message;
    }
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
    String(o["Trạng thái đặt hàng"] || "").trim().toLowerCase() === "hoạn thạnh" &&
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

  const msg = `Bạn sắp tạo yêu cầu thanh toán cho ${eligibleOrders.length} đơn hàng.\nTổng giá trị: ${totalVal.toLocaleString("vi-VN")}đ\nTổng chiết khấu: ${totalDisc.toLocaleString("vi-VN")}đ\n\nBạn có muốn tiếp tục?`;
  if (!confirm(msg)) return;

  const btn = document.querySelector('button[onclick="createPaymentRequest()"]');
  const oldText = btn ? btn.textContent : "💳 Yêu Cầu Thanh Toán Toàn Bộ";
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Đang tạo yêu cầu..."; }

  try {
    const reqId = "REQ_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const orderIds = eligibleOrders.map(o => o._id);

    const batch = writeBatch(db);

    // Create new payment_requests document
    const reqRef = doc(collection(db, "payment_requests"), reqId);
    batch.set(reqRef, {
      requestId: reqId,
      userId: me,
      userName: myName,
      orderIds: orderIds,
      totalCount: eligibleOrders.length,
      totalValue: totalDisc,
      totalOrderValue: totalVal,
      status: "pending",
      createdAt: serverTimestamp()
    });

    // Update all relevant orders
    eligibleOrders.forEach(o => {
      const orderRef = doc(db, "orders", o._id);
      batch.update(orderRef, { thanhToan: "Đang chờ xử lý", updatedAt: serverTimestamp() });
    });

    await batch.commit();
    alert("✅ Đã tạo yêu cầu thanh toán thành công!");
    await refreshMyOrders();
  } catch (e) {
    alert("❌ Lỗi: " + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText; }
  }
};

// ─── NAV TABS ─────────────────────────────────────────────
window.showMainTab = function (tab) {
  document.getElementById("main-search").style.display = tab === "search" ? "block" : "none";
  document.getElementById("main-mine").style.display = tab === "mine" ? "block" : "none";
  document.getElementById("nav-search").classList.toggle("active", tab === "search");
  document.getElementById("nav-mine").classList.toggle("active", tab === "mine");
};

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
  if (!name || !email || !pass) { msg.className = "amsg err"; msg.textContent = "Vui lòng nhập đầy đủ."; return; }
  if (pass.length < 6) { msg.className = "amsg err"; msg.textContent = "Mật khẩu phải ít nhất 6 ký tự."; return; }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "users", cred.user.uid), { name, email, role: "user", refEmail, createdAt: serverTimestamp() });
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
    btn.disabled = false; btn.textContent = "Gửi Lỗi Lần Nữa";
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
    select.innerHTML = '<option value="">-- Chọn ngân hàng --</option>' + banksList.map(b => `<option value="${b.short_name || b.shortName}">${b.name} (${b.short_name || b.shortName})</option>`).join("");
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
