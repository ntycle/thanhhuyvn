import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs,
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

// ─── AUTH STATE ───────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (user) {
    me = user.uid;
    const snap = await getDoc(doc(db, "users", user.uid));
    const uData = snap.exists() ? snap.data() : {};
    myName = uData.name || user.email;

    document.getElementById("header-uname").textContent = myName;
    document.getElementById("welcome-name").textContent = myName;
    document.getElementById("auth-screen").style.display = "none";
    document.getElementById("app-screen").style.display = "block";

    // Check bank info
    if (uData.bankAccount) {
      myBankInfo = { bankFullName: uData.bankFullName, bankName: uData.bankName, bankAccount: uData.bankAccount };
    } else {
      myBankInfo = null;
      window.loadBanksList();
    }

    await refreshMyOrders();
  } else {
    me = null;
    document.getElementById("auth-screen").style.display = "flex";
    document.getElementById("app-screen").style.display = "none";
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
  const q = query(collection(db, "orders"), where("userId", "==", me));
  const snap = await getDocs(q);
  myOrders = snap.docs.map(d => ({ _id: d.id, ...d.data() }));

  // Bước 1: Dọn trùng ID trong myOrders
  const cleaned = await cleanupDuplicateDrafts(myOrders);

  // Bước 2: Với mỗi nháp còn lại, chủ động tìm đơn thật trong Firestore
  //         → xóa nháp + tự gán đơn thật về user (không cần search thủ công)
  const autoClaimed = await autoClaimRealOrders(
    cleaned
      ? (await getDocs(query(collection(db, "orders"), where("userId", "==", me)))).docs.map(d => ({ _id: d.id, ...d.data() }))
      : myOrders
  );

  // Reload lần cuối nếu có bất kỳ thay đổi nào
  if (cleaned || autoClaimed) {
    const snap2 = await getDocs(query(collection(db, "orders"), where("userId", "==", me)));
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
  document.getElementById("sum-value").textContent = (totalVal / 1e6).toFixed(2) + "M₫";
  document.getElementById("sum-disc").textContent = totalDisc.toLocaleString("vi-VN") + "₫";
  const elTotalAvailable = document.getElementById("sum-avail");
  if (elTotalAvailable) elTotalAvailable.textContent = totalAvailable.toLocaleString("vi-VN") + "₫";

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
  return hh === 0 ? 0 : Math.min(ck, 40000);
}

// Render một cell theo field name — thứ tự cố định bởi COL_ORDER
function renderCell(h, o, val, disc) {
  if (h === "Giá trị đơn hàng (₫)") return `<td data-label="Giá trị">${val.toLocaleString("vi-VN")}</td>`;
  if (h === "Chiết Khấu") return `<td data-label="Chiết khấu">${disc.toLocaleString("vi-VN")}</td>`;
  if (h === "Tên Item") {
    const full = String(o[h] || "");
    const short = full.length > 50 ? full.slice(0, 50) + "\u2026" : full;
    return `<td class="col-name" data-label="Tên sản phẩm"><span title="${full.replace(/"/g, '&quot;')}">${short}</span></td>`;
  }
  if (h === "Trạng thái đặt hàng") {
    const st = o[h] || "";
    if (st.trim().toLowerCase() === "hoàn thành") {
      return `<td data-label="Trạng thái"><span class="tag-mine" style="font-size:11px;padding:3px 10px">${st}</span></td>`;
    }
    return `<td data-label="Trạng thái">${st}</td>`;
  }
  if (h === "ID đơn hàng") return `<td data-label="Mã đơn">${o[h] || ""}</td>`;
  if (h === "Thời Gian Đặt Hàng") return `<td data-label="Ngày đặt">${o[h] || ""}</td>`;
  return `<td data-label="${h}">${o[h] || ""}</td>`;
}

function renderMyOrders() {
  const el = document.getElementById("mine-list");
  if (!myOrders.length) {
    el.innerHTML = `<div style="padding:36px;text-align:center;color:#999;font-size:14px">
      Chưa có đơn hàng nào.<br>Hãy sang tab <b>🔍 Tìm đơn hàng</b> để tìm và gán đơn về tài khoản!
    </div>`;
    return;
  }
  let totalVal = 0, totalDisc = 0;

  const theadRow = COL_ORDER.map(h => `<th>${h}</th>`).join("") + `<th>Thanh toán</th><th>Thao tác</th>`;

  const rows = myOrders.map(o => {
    const val = Number(o["Giá trị đơn hàng (₫)"]) || 0;
    const disc = calcDisc(o);
    totalVal += val; totalDisc += disc;
    const dataCells = COL_ORDER.map(h => renderCell(h, o, val, disc)).join("");

    const isManual = o["Tên Item"] === "Không có thông tin";
    const thaoTac = isManual
      ? `<div style="display:flex;gap:4px">
           <button class="btn-out" style="color: var(--blue); border-color: var(--blue); background: none; font-size:11px; padding:3px 8px; cursor: pointer;" onclick="searchSingleId('${o["ID đơn hàng"]}')">🔄 Tìm Lại</button>
           <button class="btn-out" style="color: var(--red); border-color: var(--red); background: none; font-size:11px; padding:3px 8px; cursor: pointer;" onclick="deleteMyOrder('${o._id}', this)">🗑️ Xóa</button>
         </div>`
      : `<span class="tag-mine" style="font-size:11px;padding:3px 10px">✅ Đã gán</span>`;

    return `<tr>${dataCells}<td data-label="Thanh toán">${paymentBadge(o.thanhToan)}</td><td data-label="Thao tác">${thaoTac}</td></tr>`;
  }).join("");

  const tfootRow = COL_ORDER.map(h => {
    if (h === "Giá trị đơn hàng (₫)") return `<td>${totalVal.toLocaleString("vi-VN")}</td>`;
    if (h === "Chiết Khấu") return `<td>${totalDisc.toLocaleString("vi-VN")}</td>`;
    return `<td>${h === COL_ORDER[0] ? "TỔNG" : ""}</td>`;
  }).join("") + `<td></td><td></td>`;

  el.innerHTML = `<div class="result-wrap"><table>
    <thead><tr>${theadRow}</tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>${tfootRow}</tr></tfoot>
  </table></div>
  <div class="mobile-summary">
    <span>📦 Tổng: ${myOrders.length} đơn</span>
    <span>💰 ${totalVal.toLocaleString("vi-VN")}₫</span>
    <span>🎁 CK: ${totalDisc.toLocaleString("vi-VN")}₫</span>
  </div>`;
}

// ─── SEARCH ──────────────────────────────────────────────
window.doSearch = async function () {
  const raw = document.getElementById("orderId").value;
  const ids = raw.toUpperCase().split(/[\s,]+/).filter(Boolean);
  const resultDiv = document.getElementById("search-result");
  if (!ids.length) return;

  const btn = document.getElementById("btn-search");
  btn.disabled = true; btn.textContent = "⏳ Đang tìm...";
  resultDiv.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div>Đang tìm kiếm trong hệ thống...</div>`;

  try {
    let found = [];
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30);
      try {
        const snap = await getDocs(query(collection(db, "orders"), where("ID đơn hàng", "in", chunk)));
        snap.docs.forEach(d => found.push({ _id: d.id, ...d.data() }));
      } catch (qErr) {
        if (qErr.code === "permission-denied") {
          const promises = chunk.map(id => getDoc(doc(db, "orders", id)));
          const snaps = await Promise.all(promises);
          snaps.forEach(s => { if (s.exists()) found.push({ _id: s.id, ...s.data() }); });
        } else throw qErr;
      }
    }

    const foundIds = new Set(found.map(o => (o["ID đơn hàng"] || "").toUpperCase()));
    const missingIds = ids.filter(id => !foundIds.has(id.toUpperCase()));

    if (found.length) {
      renderSearchResults(found, resultDiv);
    } else {
      resultDiv.innerHTML = `<div class="not-found" style="margin-bottom: 16px;">❌ Không tìm thấy đơn hàng nào có sẵn trong hệ thống.</div>`;
    }

    if (missingIds.length) {
      const missingHtml = missingIds.map(id => {
        const isValidId = /^[0-9A-Z]{14,15}$/.test(id);
        return `
        <div style="background:#fff3e0; padding: 14px 18px; border-radius: var(--radius); margin-top: 14px; border: 1px solid #ffcc80; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px;">
          <div>
            <div style="font-weight: 700; color: #e65100; margin-bottom: 4px;">ID: ${id}</div>
            <div style="font-size: 13px; color: #e65100; opacity: 0.85;">Chưa có trong hệ thống</div>
          </div>
          <div style="display: flex; gap: 8px;">
            ${isValidId ? `<button class="btn-claim" style="padding: 8px 16px; font-size: 13px;" onclick="saveMissingOrder('${id}', this)">💾 Lưu lại đơn hàng</button>` : `<span style="font-size: 12px; color: #c00; font-weight: bold; align-self: center; padding: 0 10px;">Không có thông tin đơn hàng</span>`}
            <button class="btn-out" style="color: var(--blue); border-color: var(--blue); background: none;" onclick="searchSingleId('${id}')">🔄 Tìm lại</button>
          </div>
        </div>
      `}).join("");

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
  let totalVal = 0, totalDisc = 0;

  const theadRow = COL_ORDER.map(h => `<th>${h}</th>`).join("") + `<th>Thanh toán</th><th>Trạng thái</th>`;

  const rows = orders.map(o => {
    const val = Number(o["Giá trị đơn hàng (₫)"]) || 0;
    const disc = calcDisc(o);
    totalVal += val; totalDisc += disc;

    const isManual = o["Tên Item"] === "Không có thông tin";
    const isMine = o.userId === me;
    const isClaimed = !!o.userId;

    let actionCell = "";
    if (isMine) {
      actionCell = isManual
        ? `<td data-label="Thao tác"><div style="display:flex;gap:4px">
             <button class="btn-out" style="color: var(--blue); border-color: var(--blue); background: none; padding:4px 8px; font-size:12px; cursor: pointer;" onclick="searchSingleId('${o["ID đơn hàng"]}')">🔄 Tìm Lại</button>
             <button class="btn-out" style="color: var(--red); border-color: var(--red); background: none; padding:4px 8px; font-size:12px; cursor: pointer;" onclick="deleteMyOrder('${o._id}', this)">🗑️ Xóa</button>
           </div></td>`
        : `<td data-label="Trạng thái"><span class="tag-mine">✅ Của tôi</span></td>`;
    } else if (isClaimed) {
      actionCell = `<td data-label="Trạng thái"><span class="tag-other">🔒 Đã gán</span></td>`;
    } else {
      actionCell = `<td data-label="Thao tác"><button class="btn-claim" onclick="claimOrder('${o._id}', this)">📌 Gán cho tôi</button></td>`;
    }

    const dataCells = COL_ORDER.map(h => renderCell(h, o, val, disc)).join("");
    return `<tr>${dataCells}<td data-label="Thanh toán">${paymentBadge(o.thanhToan)}</td>${actionCell}</tr>`;
  }).join("");

  const tfootRow = COL_ORDER.map(h => {
    if (h === "Giá trị đơn hàng (₫)") return `<td>${totalVal.toLocaleString("vi-VN")}</td>`;
    if (h === "Chiết Khấu") return `<td>${totalDisc.toLocaleString("vi-VN")}</td>`;
    return `<td>${h === COL_ORDER[0] ? "TỔNG" : ""}</td>`;
  }).join("") + `<td></td><td></td>`;

  container.innerHTML = `<div class="card" style="padding:0"><div class="result-wrap"><table>
    <thead><tr>${theadRow}</tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>${tfootRow}</tr></tfoot>
  </table></div></div>
  <div class="mobile-summary">
    <span>📦 ${orders.length} đơn</span>
    <span>💰 ${totalVal.toLocaleString("vi-VN")}₫</span>
    <span>🎁 CK: ${totalDisc.toLocaleString("vi-VN")}₫</span>
  </div>`;
}

// ─── CLAIM ───────────────────────────────────────────────
window.claimOrder = async function (docId, btn) {
  btn.disabled = true; btn.textContent = "⏳...";
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, "orders", docId);
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        tx.set(ref, {
          "ID đơn hàng": docId,
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
    btn.closest("td").innerHTML = `<span class="tag-mine">✅ Của tôi</span>`;
    await refreshMyOrders();
  } catch (e) {
    if (e.message === "TAKEN") {
      btn.closest("td").innerHTML = `<span class="tag-other">🔒 Đã gán</span>`;
    } else {
      btn.disabled = false; btn.textContent = "📌 Gán cho tôi";
      alert("Lỗi: " + e.message);
    }
  }
};

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

window.deleteMyOrder = async function (id, btn) {
  if (!confirm("Bạn có chắc chắn muốn xóa lưu nháp đơn hàng này không?")) return;
  const oldHtml = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = "⏳";
  try {
    await deleteDoc(doc(db, "orders", id));
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

  const msg = `Bạn sắp tạo yêu cầu thanh toán cho ${eligibleOrders.length} đơn hàng.\nTổng giá trị: ${totalVal.toLocaleString("vi-VN")}₫\nTổng chiết khấu: ${totalDisc.toLocaleString("vi-VN")}₫\n\nBạn có muốn tiếp tục?`;
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
  document.getElementById("search-result").innerHTML = "";
  document.getElementById("orderId").value = "";
  document.getElementById("bank-fullname").value = "";
  document.getElementById("bank-account").value = "";
  document.getElementById("bank-fullname").disabled = false;
  document.getElementById("bank-name").disabled = false;
  document.getElementById("bank-account").disabled = false;
  document.getElementById("btn-save-bank").style.display = "block";
  document.getElementById("bank-info-msg").style.display = "none";
  document.getElementById("btn-save-bank").textContent = "Lưu Thông Tin Mặc Định";
};

// ─── BANK API ─────────────────────────────────────────────
let banksList = [];
window.loadBanksList = async function () {
  const select = document.getElementById("bank-name");
  try {
    let data;
    try {
      const r = await fetch("banks.json");
      if (!r.ok) throw new Error();
      data = await r.json();
    } catch (e) {
      const r2 = await fetch("https://api.vietqr.io/v2/banks");
      data = await r2.json();
    }
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
