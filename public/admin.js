import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, getDocs, doc, getDoc, setDoc, updateDoc,
  deleteDoc, query, where, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const cfg = window.ENV || {};
const app  = initializeApp(cfg);
const auth = getAuth(app);
const db   = getFirestore(app);

function escapeHTML(str) {
  if (typeof str !== 'string' && typeof str !== 'number') return '';
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

let allUsers = [], allOrders = [], allShortLinks = [], allPaymentRequests = [];

// ─── AUTH ──────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (user) {
    if (user.uid !== "tMxGRweSVAT2j4kDvJVWw6osRYL2") {
      showAuthErr("❌ Tài khoản không có quyền admin.");
      return;
    }
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists() && snap.data().role === "admin") {
      document.getElementById("adm-name").textContent = snap.data().name || user.email;
      document.getElementById("admin-auth").style.display  = "none";
      document.getElementById("admin-panel").style.display = "block";
      loadAll();
    } else {
      // Bỏ `await signOut(auth);` để không kick văng user đang đăng nhập ở tab khác
      showAuthErr("❌ Tài khoản không có quyền admin.");
    }
  } else {
    document.getElementById("admin-auth").style.display  = "flex";
    document.getElementById("admin-panel").style.display = "none";
  }
});

async function loadAll() { await Promise.all([loadUsers(), loadOrders(), loadShortLinks(), loadPaymentRequests()]); populateUserFilter(); renderDashboard(); }

// ─── LOAD ──────────────────────────────────────────────────
async function loadUsers() {
  const snap = await getDocs(collection(db, "users"));
  allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  allUsers.sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
  renderUsers();
}
async function loadOrders() {
  const snap = await getDocs(collection(db, "orders"));
  allOrders = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
  allOrders.sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
  renderOrders();
  renderUsers();
}

async function loadShortLinks() {
  try {
    const snap = await getDocs(collection(db, "shortlinks"));
    allShortLinks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    allShortLinks.sort((a, b) => {
      let tA = a.createdAt?.seconds || 0;
      let tB = b.createdAt?.seconds || 0;
      return tB - tA;
    });
  } catch (e) {
    console.error("Error loading shortlinks", e);
    allShortLinks = [];
  }
  renderShortLinks();
}

window.loadOrders = loadOrders;

function getUserName(uid) {
  if (!uid) return "–";
  const u = allUsers.find(u => u.id === uid);
  return escapeHTML(u ? (u.name || u.email) : uid.slice(0,8)+"...");
}

// ─── DASHBOARD ─────────────────────────────────────────────
function renderDashboard() {
  const claimed = allOrders.filter(o => !!o.userId);
  const free    = allOrders.filter(o => !o.userId);
  document.getElementById("s-total").textContent   = allOrders.length;
  document.getElementById("s-claimed").textContent = claimed.length;
  document.getElementById("s-free").textContent    = free.length;
  document.getElementById("s-users").textContent   = allUsers.filter(u => u.role !== "admin").length;

  const recent = [...claimed].sort((a, b) => {
    const tA = (a.claimedAt && a.claimedAt.seconds) ? a.claimedAt.seconds : 0;
    const tB = (b.claimedAt && b.claimedAt.seconds) ? b.claimedAt.seconds : 0;
    return tB - tA;
  }).slice(0, 10);
  document.getElementById("dash-recent").innerHTML = recent.length === 0
    ? "<p style='color:#999;text-align:center'>Chưa có đơn nào được gán</p>"
    : `<div style="overflow-x:auto"><table>
        <thead><tr><th>ID Đơn hàng</th><th>Người gán</th><th>Giá trị (₫)</th><th>Thao tác</th></tr></thead>
        <tbody>${recent.map(o => `<tr>
          <td><code>${escapeHTML(o["ID đơn hàng"]||"")}</code></td>
          <td>${getUserName(o.userId)}</td>
          <td>${(Number(o["Giá trị đơn hàng (₫)"])||0).toLocaleString("vi-VN")}</td>
          <td><button class="btn btn-outline btn-xs" onclick="resetClaim('${escapeHTML(o._id)}')">↩ Reset gán</button></td>
        </tr>`).join("")}</tbody>
      </table></div>`;
}

// ─── USERS ─────────────────────────────────────────────────
function renderUsers() {
  const tbody = document.getElementById("users-tbody");
  if (!allUsers.length) { tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#999">Chưa có user</td></tr>`; return; }

  const kw = (document.getElementById("filter-user-search")?.value || "").toLowerCase().trim();
  const filtered = allUsers.filter(u => {
    if (!kw) return true;
    return (u.name || "").toLowerCase().includes(kw) || (u.email || "").toLowerCase().includes(kw);
  });
  
  if (!filtered.length) { tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#999">Không tìm thấy user nào</td></tr>`; return; }

  tbody.innerHTML = filtered.map(u => {
    const cnt  = allOrders.filter(o => o.userId === u.id).length;
    let date = "–";
    if (u.createdAt && typeof u.createdAt.toDate === "function") {
      date = u.createdAt.toDate().toLocaleDateString("vi-VN");
    }
    
    // Check if bank info exists
    const bankStatus = u.bankAccount ? `<span class="badge badge-paid">✅ Đã điền</span>` : `<span class="badge badge-unpaid">Chưa có</span>`;
    
    return `<tr>
      <td>${escapeHTML(u.name || "–")}</td>
      <td>${escapeHTML(u.email)}</td>
      <td><span class="badge badge-${u.role === "admin" ? "admin" : "user"}">${u.role === "admin" ? "Admin" : "User"}</span></td>
      <td>${cnt}</td>
      <td>${bankStatus}</td>
      <td>${date}</td>
      <td>${escapeHTML(u.refEmail || "–")}</td>
      <td style="display:flex;gap:4px;">${u.role !== "admin"
        ? `<button class="btn btn-outline btn-xs" style="color:var(--orange);border-color:var(--orange)" onclick="editUserBank('${escapeHTML(u.id)}')">💳 Bank</button>
           <button class="btn btn-outline btn-xs" style="color:var(--blue);border-color:var(--blue)" data-email="${escapeHTML(u.email)}" onclick="sendResetEmailToUser(this.dataset.email, this)">🔑 Đổi MK</button>
           <button class="btn btn-red btn-xs" data-uid="${escapeHTML(u.id)}" data-name="${escapeHTML(u.name||u.email)}" onclick="resetUserClaims(this.dataset.uid, this.dataset.name)">↩ Reset đơn</button>`
        : ""}</td>
    </tr>`;
  }).join("");
}
window.renderUsers = renderUsers;

// ─── USER BANK ADMIN EDIT ──────────────────────────────────
window.editUserBank = function(uid) {
  const u = allUsers.find(x => x.id === uid);
  if (!u) return;
  document.getElementById("eb-uid").value = uid;
  document.getElementById("eb-name").value = u.bankFullName || "";
  document.getElementById("eb-bank").value = u.bankName || "";
  document.getElementById("eb-account").value = u.bankAccount || "";
  document.getElementById("edit-bank-modal").style.display = "flex";
};

window.saveUserBank = async function() {
  const uid = document.getElementById("eb-uid").value;
  const name = document.getElementById("eb-name").value.trim().toUpperCase();
  const bank = document.getElementById("eb-bank").value.trim();
  const acc = document.getElementById("eb-account").value.trim();
  
  if (!uid) return;
  
  const btn = document.querySelector("#edit-bank-modal .btn-green");
  const oldText = btn.textContent;
  btn.disabled = true; btn.textContent = "⏳...";
  
  try {
    await updateDoc(doc(db, "users", uid), {
      bankFullName: name,
      bankName: bank,
      bankAccount: acc,
      updatedAt: serverTimestamp()
    });
    alert("✅ Cập nhật thông tin ngân hàng thành công!");
    document.getElementById("edit-bank-modal").style.display = "none";
    await loadUsers();
    renderDashboard();
  } catch(e) {
    alert("❌ Lỗi: " + e.message);
  } finally {
    btn.disabled = false; btn.textContent = oldText;
  }
};

window.openAddUser = function() {
  const p = document.getElementById("add-user-panel");
  p.style.display = p.style.display === "none" ? "block" : "none";
};

window.createUser = async function() {
  const name  = document.getElementById("nu-name").value.trim();
  const email = document.getElementById("nu-email").value.trim();
  const pass  = document.getElementById("nu-pass").value;
  const msgEl = document.getElementById("nu-msg");
  msgEl.innerHTML = "";
  if (!name||!email||!pass) { msgEl.innerHTML = `<div class="msg msg-err">Vui lòng nhập đầy đủ.</div>`; return; }
  try {
    const { initializeApp: ia2 } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const { getAuth: ga2, createUserWithEmailAndPassword: cup } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
    const app2  = ia2({ ...cfg }, "secondary-" + Date.now());
    const auth2 = ga2(app2);
    const cred  = await cup(auth2, email, pass);
    await auth2.signOut();
    await setDoc(doc(db, "users", cred.user.uid), { name, email, role: "user", createdAt: serverTimestamp() });
    msgEl.innerHTML = `<div class="msg msg-ok">✅ Tạo user thành công!</div>`;
    await loadUsers(); populateUserFilter(); renderDashboard();
    setTimeout(() => { document.getElementById("add-user-panel").style.display = "none"; }, 1500);
  } catch(e) {
    msgEl.innerHTML = `<div class="msg msg-err">❌ ${e.code === "auth/email-already-in-use" ? "Email đã tồn tại." : e.message}</div>`;
  }
};

window.sendResetEmailToUser = async function(email, btn) {
  if (!confirm(`Bạn có chắc muốn gửi email yêu cầu đổi mật khẩu tới:\n${email} ?`)) return;
  const oldText = btn.textContent;
  btn.disabled = true; btn.textContent = "⏳...";
  try {
    await sendPasswordResetEmail(auth, email);
    alert(`✅ Đã gửi email đổi mật khẩu tới ${email} thành công!`);
  } catch(e) {
    alert("❌ Lỗi gửi email: " + e.message);
  } finally {
    btn.disabled = false; btn.textContent = oldText;
  }
};

// ─── ORDERS ────────────────────────────────────────────────
function populateUserFilter() {
  const opts = allUsers.filter(u => u.role !== "admin").map(u => `<option value="${escapeHTML(u.id)}">${escapeHTML(u.name||u.email)}</option>`).join("");
  document.getElementById("filter-user").innerHTML = `<option value="">-- Lọc theo user --</option>` + opts;
}

function renderOrders(list) {
  const orders = list || allOrders;
  const tbody  = document.getElementById("orders-tbody");
  
  let totalCK = 0;
  let totalHH = 0;
  let totalPaid = 0;

  orders.forEach(o => {
    let ck = Number(o["Chiết Khấu"]);
    if (isNaN(ck)) ck = Number((o["Chiết Khấu"]||"").toString().replace(/[^\d-]/g, ''));
    if (isNaN(ck) || ck === 0) {
      let ck2 = Number(o["Chiết Khấu 2%"]);
      if (isNaN(ck2)) ck2 = Number((o["Chiết Khấu 2%"]||"").toString().replace(/[^\d-]/g, ''));
      ck = ck2 || 0;
    }
    const hh = Number((o["Hoa hồng Shopee trên sản phẩm(₫)"] || "0").toString().replace(/[^\d-]/g, "")) || 0;
    
    totalCK += ck;
    totalHH += hh;
    if (o.thanhToan === "Đã Thanh Toán") totalPaid += ck;
  });

  const elTotal = document.getElementById("os-total");
  const elCK = document.getElementById("os-ck");
  const elHH = document.getElementById("os-hh");
  const elPaid = document.getElementById("os-paid");
  const elProfit = document.getElementById("os-profit");
  
  const profit = totalHH - totalPaid;
  
  if (elTotal) elTotal.textContent = orders.length.toLocaleString("vi-VN");
  if (elCK) elCK.textContent = totalCK.toLocaleString("vi-VN") + " đ";
  if (elHH) elHH.textContent = totalHH.toLocaleString("vi-VN") + " đ";
  if (elPaid) elPaid.textContent = totalPaid.toLocaleString("vi-VN") + " đ";
  if (elProfit) elProfit.textContent = profit.toLocaleString("vi-VN") + " đ";

  if (!orders.length) { tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:24px;color:#999">Không có đơn hàng</td></tr>`; return; }
  
  // Xoá check all khi render lại
  const chkAll = document.getElementById("chk-all-orders");
  if (chkAll) chkAll.checked = false;
  if (window.updateDeleteSelectedButton) window.updateDeleteSelectedButton();
  
  tbody.innerHTML = orders.map(o => {
    const val     = Number((o["Giá trị đơn hàng (₫)"]||"0").toString().replace(/[^\d-]/g, "")) || 0;
    let ck = Number(o["Chiết Khấu"]);
    if (isNaN(ck)) ck = Number((o["Chiết Khấu"]||"").toString().replace(/[^\d-]/g, ''));
    if (isNaN(ck) || ck === 0) {
      let ck2 = Number(o["Chiết Khấu 2%"]);
      if (isNaN(ck2)) ck2 = Number((o["Chiết Khấu 2%"]||"").toString().replace(/[^\d-]/g, ''));
      ck = ck2 || 0;
    }
    const hh = Number((o["Hoa hồng Shopee trên sản phẩm(₫)"] || "0").toString().replace(/[^\d-]/g, "")) || 0;
    const claimed = !!o.userId;
    // Build payment dropdown (admin only)
    const payVal = o.thanhToan || "";
    const payClass = payVal === "Đã Thanh Toán" ? "paid" : payVal === "Chưa Thanh Toán" || payVal === "Đang chờ xử lý" ? "unpaid" : "";
    const paySel = `<select class="pay-sel ${payClass}" onchange="setPayment('${escapeHTML(o._id)}', this)">
      <option value=""${payVal === "" ? " selected" : ""}>– Chưa cập nhật</option>
      <option value="Đang chờ xử lý"${payVal === "Đang chờ xử lý" ? " selected" : ""}>Đang chờ xử lý</option>
      <option value="Chưa Thanh Toán"${payVal === "Chưa Thanh Toán" ? " selected" : ""}>Chưa Thanh Toán</option>
      <option value="Đã Thanh Toán"${payVal === "Đã Thanh Toán" ? " selected" : ""}>Đã Thanh Toán</option>
    </select>`;
    return `<tr>
      <td style="text-align: center;"><input type="checkbox" class="chk-order" value="${escapeHTML(o._id)}" onchange="toggleOrderCheckbox()"></td>
      <td><code>${escapeHTML(o["ID đơn hàng"]||"")}</code></td>
      <td>${val.toLocaleString("vi-VN")}</td>
      <td style="color:var(--orange);font-weight:600">
        ${ck.toLocaleString("vi-VN")} đ
        <button class="btn btn-outline btn-xs" style="margin-left:4px;font-size:10px;padding:1px 5px" onclick="editCK('${escapeHTML(o._id)}', ${ck})">✏️</button>
      </td>
      <td style="color:var(--green);font-weight:600">${hh.toLocaleString("vi-VN")} đ</td>
      <td>${escapeHTML(o["Trạng thái đặt hàng"] || "–")}</td>
      <td><span class="badge badge-${claimed?"claimed":"free"}">${claimed ? "✅ Đã gán" : "⏳ Chưa gán"}</span></td>
      <td>${paySel}</td>
      <td>${getUserName(o.userId)}</td>
      <td style="display:flex;gap:6px">
        ${claimed ? `<button class="btn btn-outline btn-xs" onclick="resetClaim('${escapeHTML(o._id)}')">↩ Reset</button>` : ""}
        <button class="btn btn-red btn-xs" onclick="deleteOrder('${escapeHTML(o._id)}')">&#128465;</button>
      </td>
    </tr>`;
  }).join("");
}

let currentFilteredOrders = [];

window.applyFilter = function() {
  const status  = document.getElementById("filter-status").value;
  const uid     = document.getElementById("filter-user").value;
  const keyword = document.getElementById("filter-id").value.toUpperCase().trim();
  const dateFrom = document.getElementById("filter-date-from")?.value;
  const dateTo = document.getElementById("filter-date-to")?.value;

  let f = allOrders;
  if (status === "claimed") f = f.filter(o => !!o.userId);
  if (status === "free")    f = f.filter(o => !o.userId);
  if (uid)     f = f.filter(o => o.userId === uid);
  if (keyword) f = f.filter(o => (o["ID đơn hàng"]||"").toUpperCase().includes(keyword));
  
  if (dateFrom || dateTo) {
    const dFrom = dateFrom ? new Date(dateFrom) : null;
    if (dFrom) dFrom.setHours(0, 0, 0, 0);
    const dTo = dateTo ? new Date(dateTo) : null;
    if (dTo) dTo.setHours(23, 59, 59, 999);

    f = f.filter(o => {
      const idStr = (o["ID đơn hàng"] || "").toString();
      if (!idStr || idStr.length < 6) return true; // Include if we can't parse
      const yy = parseInt(idStr.substring(0, 2), 10);
      const mm = parseInt(idStr.substring(2, 4), 10);
      const dd = parseInt(idStr.substring(4, 6), 10);
      
      if (isNaN(yy) || isNaN(mm) || isNaN(dd)) return true;
      
      const year = 2000 + yy;
      const month = mm - 1;
      const oDate = new Date(year, month, dd);
      
      if (dFrom && oDate < dFrom) return false;
      if (dTo && oDate > dTo) return false;
      return true;
    });
  }
  
  currentFilteredOrders = f;
  
  const btnCopy = document.getElementById("btn-copy-orders");
  if (btnCopy) {
    if (uid && f.length > 0) {
      btnCopy.style.display = "inline-block";
    } else {
      btnCopy.style.display = "none";
    }
  }
  
  renderOrders(f);
};

window.copyFilteredOrders = function() {
  if (!currentFilteredOrders || currentFilteredOrders.length === 0) return;
  
  const orderIds = currentFilteredOrders.map(o => o["ID đơn hàng"] || "").filter(Boolean);
  const uniqueOrderIds = [...new Set(orderIds)];
  
  if (uniqueOrderIds.length === 0) {
    alert("Không có mã đơn hàng nào để copy");
    return;
  }
  
  const textToCopy = uniqueOrderIds.join("\n");
  navigator.clipboard.writeText(textToCopy).then(() => {
    const btnCopy = document.getElementById("btn-copy-orders");
    const oldText = btnCopy.textContent;
    btnCopy.textContent = "✅ Đã copy " + uniqueOrderIds.length + " đơn";
    setTimeout(() => {
      btnCopy.textContent = "📋 Copy đơn hàng";
    }, 2000);
  }).catch(err => {
    console.error("Lỗi copy", err);
    alert("Không thể copy. Hãy thử lại!");
  });
};

// ─── SỬA CHIẾT KHẤU (admin only) ────────────────────────────
window.editCK = async function(docId, currentCK) {
  const input = prompt(`Nhập số tiền Chiết Khấu mới (hiện tại: ${Number(currentCK).toLocaleString("vi-VN")} đ):`, currentCK);
  if (input === null) return;
  const newCK = Number(input.toString().replace(/[^\d.-]/g, ''));
  if (isNaN(newCK) || newCK < 0) { alert("❌ Số tiền không hợp lệ."); return; }
  try {
    await updateDoc(doc(db, "orders", docId), { "Chiết Khấu": newCK, updatedAt: serverTimestamp() });
    const o = allOrders.find(o => o._id === docId);
    if (o) o["Chiết Khấu"] = newCK;
    await loadOrders(); renderDashboard();
  } catch(e) {
    alert("❌ Lỗi cập nhật chiết khấu: " + e.message);
  }
};

// ─── DỌN DATA SAI: draft + real order bị tách đôi ───────────
window.fixDraftData = async function() {
  const input = prompt(
    "Nhập mã đơn hàng cần dọn (VD: 2506021234567).\n\nĐể trống và nhấn OK nếu muốn quét TOÀN BỘ database (không khuyến khích):"
  );
  if (input === null) return;

  const msgEl = document.getElementById("upload-msg");
  msgEl.innerHTML = `<div class="msg msg-info"><span class="spinner"></span> Đang xử lý...</div>`;

  try {
    let drafts = [];

    if (input.trim()) {
      const targetId = input.trim();
      const snap = await getDocs(
        query(collection(db, "orders"),
          where("ID đơn hàng", "==", targetId),
          where("Tên Item", "==", "Không có thông tin")
        )
      );
      drafts = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
      if (!drafts.length) {
        msgEl.innerHTML = `<div class="msg msg-ok">✅ Không tìm thấy đơn nháp nào cho mã: <strong>${targetId}</strong></div>`;
        return;
      }
    } else {
      if (!confirm("⚠️ Xác nhận quét TOÀN BỘ database?")) return;
      const snap = await getDocs(
        query(collection(db, "orders"), where("Tên Item", "==", "Không có thông tin"))
      );
      drafts = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
      if (!drafts.length) {
        msgEl.innerHTML = `<div class="msg msg-ok">✅ Không có đơn nháp nào cần dọn.</div>`;
        return;
      }
    }

    let fixed = 0, skipped = 0;
    const batch = writeBatch(db);

    for (const draft of drafts) {
      const orderId = (draft["ID đơn hàng"] || "").trim();
      if (!orderId) { skipped++; continue; }

      const realSnap = await getDocs(
        query(collection(db, "orders"), where("ID đơn hàng", "==", orderId))
      );
      const reals = realSnap.docs
        .map(d => ({ _id: d.id, ...d.data() }))
        .filter(o => o._id !== draft._id && o["Tên Item"] !== "Không có thông tin");

      if (!reals.length) {
        msgEl.innerHTML += `<div class="msg msg-err" style="margin-top:6px">⚠️ Chưa có real order cho mã: <strong>${orderId}</strong> — bỏ qua.</div>`;
        skipped++; continue;
      }

      for (const real of reals) {
        if (!real.userId && draft.userId) {
          batch.update(doc(db, "orders", real._id), {
            userId: draft.userId,
            claimedAt: draft.claimedAt || serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      }

      batch.delete(doc(db, "orders", draft._id));
      fixed++;
    }

    await batch.commit();
    await loadOrders(); renderDashboard();
    msgEl.innerHTML = `<div class="msg msg-ok">✅ Hoàn tất! Đã dọn <strong>${fixed}</strong> đơn. Bỏ qua: <strong>${skipped}</strong>.</div>`;
  } catch(e) {
    msgEl.innerHTML = `<div class="msg msg-err">❌ Lỗi: ${e.message}</div>`;
  }
};

// ─── SET PAYMENT (admin only) ────────────────────────────────
window.setPayment = async function(docId, sel) {
  const val = sel.value;
  // Update class for instant visual feedback
  sel.className = "pay-sel " + (val === "Đã Thanh Toán" ? "paid" : val === "Chưa Thanh Toán" || val === "Đang chờ xử lý" ? "unpaid" : "");
  try {
    await updateDoc(doc(db, "orders", docId), { thanhToan: val || null });
    // Update local cache
    const o = allOrders.find(o => o._id === docId);
    if (o) o.thanhToan = val || null;
  } catch(e) {
    alert("❌ Lỗi cập nhật thanh toán: " + e.message);
    // Revert select
    sel.value = allOrders.find(o => o._id === docId)?.thanhToan || "";
  }
};

// Reset claim on single order
window.resetClaim = async function(docId) {
  if (!confirm("Reset gán đơn hàng này? Đơn sẽ trở về pool chung.")) return;
  await updateDoc(doc(db, "orders", docId), { userId: null, claimedAt: null });
  await loadOrders(); renderDashboard();
};

// Reset all claims for a user
window.resetUserClaims = async function(uid, name) {
  if (!confirm(`Reset tất cả đơn hàng của "${name}"? Chúng sẽ trở về pool chung.`)) return;
  const q    = query(collection(db, "orders"), where("userId", "==", uid));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.update(d.ref, { userId: null, claimedAt: null }));
  await batch.commit();
  await loadOrders(); renderDashboard();
};

window.deleteOrder = async function(docId) {
  if (!confirm("Xóa đơn hàng này?")) return;
  await deleteDoc(doc(db, "orders", docId));
  await loadOrders(); renderDashboard();
};

window.toggleAllOrders = function(source) {
  const checkboxes = document.querySelectorAll('.chk-order');
  checkboxes.forEach(cb => {
    cb.checked = source.checked;
  });
  updateDeleteSelectedButton();
};

window.toggleOrderCheckbox = function() {
  updateDeleteSelectedButton();
  const checkboxes = document.querySelectorAll('.chk-order');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  const chkAll = document.getElementById('chk-all-orders');
  if (chkAll) chkAll.checked = checkboxes.length > 0 && allChecked;
};

window.updateDeleteSelectedButton = function() {
  const checkedBoxes = document.querySelectorAll('.chk-order:checked');
  const btn = document.getElementById('btn-delete-selected');
  if (btn) {
    if (checkedBoxes.length > 0) {
      btn.style.display = 'inline-block';
      btn.textContent = `🗑️ Xóa đã chọn (${checkedBoxes.length})`;
    } else {
      btn.style.display = 'none';
    }
  }
};

window.deleteSelectedOrders = async function() {
  const checkedBoxes = document.querySelectorAll('.chk-order:checked');
  if (checkedBoxes.length === 0) return;
  if (!confirm(`Xóa ${checkedBoxes.length} đơn hàng đã chọn?`)) return;
  
  const CHUNK = 400;
  const idsToDelete = Array.from(checkedBoxes).map(cb => cb.value);
  
  const btn = document.getElementById('btn-delete-selected');
  const oldText = btn.textContent;
  btn.textContent = "⏳ Đang xoá...";
  btn.disabled = true;

  try {
    for (let i = 0; i < idsToDelete.length; i += CHUNK) {
      const batch = writeBatch(db);
      idsToDelete.slice(i, i + CHUNK).forEach(id => {
        batch.delete(doc(db, "orders", id));
      });
      await batch.commit();
    }
    await loadOrders(); 
    renderDashboard();
  } catch (error) {
    alert("❌ Lỗi khi xoá: " + error.message);
  } finally {
    btn.textContent = oldText;
    btn.disabled = false;
  }
};

window.clearAllOrders = async function() {
  if (!confirm("⚠️ Xóa TOÀN BỘ đơn hàng? Thao tác này không thể hoàn tác!")) return;
  if (!confirm("Xác nhận lần 2: Xóa tất cả đơn hàng?")) return;
  const snap  = await getDocs(collection(db, "orders"));
  const CHUNK = 400;
  for (let i = 0; i < snap.docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i+CHUNK).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  await loadOrders(); renderDashboard();
};

// ─── UPLOAD ────────────────────────────────────────────────
let pendingData = null;

window.handleDrop = function(e) {
  e.preventDefault();
  document.getElementById("upload-area").classList.remove("dragover");
  if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
};
window.handleFile = function(file) { if (file) processFile(file); };

function processFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error("File JSON phải là mảng []");
      pendingData = data;
      document.getElementById("upload-preview").innerHTML = `
        <div class="msg msg-info">✅ Đọc được <strong>${data.length}</strong> đơn hàng từ <strong>${file.name}</strong></div>
        <button class="btn btn-green" style="margin-top:12px" onclick="confirmUpload()">📤 Import vào Firestore</button>
      `;
      document.getElementById("upload-msg").innerHTML = "";
    } catch(err) {
      document.getElementById("upload-preview").innerHTML = `<div class="msg msg-err">❌ ${err.message}</div>`;
    }
  };
  reader.readAsText(file);
}

window.confirmUpload = async function() {
  if (!pendingData) return;
  const msgEl = document.getElementById("upload-msg");
  msgEl.innerHTML = `<div class="msg msg-info"><span class="spinner"></span>Đang import ${pendingData.length} đơn hàng...</div>`;
  try {
    const CHUNK = 400;
    let countNew = 0, countUpdated = 0;

    let idCounter = {};
    let usedDocIds = new Set();

    for (let i = 0; i < pendingData.length; i += CHUNK) {
      const batch = writeBatch(db);
      const slice = pendingData.slice(i, i + CHUNK);

      // Check existing docs to distinguish new vs update
      await Promise.all(slice.map(async order => {
        const orderId = (order["ID đơn hàng"] || "").toString().trim();
        if (!orderId) {
          // No order ID — create with auto ID (fallback)
          const ref = doc(collection(db, "orders"));
          batch.set(ref, { ...order, userId: null, claimedAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
          countNew++;
          return;
        }

        const itemId = (order["Item ID"] || order["itemID"] || order["itemId"] || "").toString().trim();
        const itemName = (order["Tên Item"] || "").toString().trim();

        // 1. Tìm các đơn cùng orderId trong bộ nhớ đệm
        const existingDocs = allOrders.filter(o => o["ID đơn hàng"] == orderId);
        let matchedDoc = null;

        // Ưu tiên tìm theo Item ID
        if (itemId) {
            matchedDoc = existingDocs.find(d => 
               (d["Item ID"] == itemId || d["itemID"] == itemId || d["itemId"] == itemId) 
               && !usedDocIds.has(d._id)
            );
        }
        
        // Nếu không thấy (đơn cũ trước khi có Item ID hoặc JSON không có Item ID)
        // Lấy 1 đơn cùng ID đơn hàng mà chưa được match ở lần duyệt này.
        if (!matchedDoc) {
            matchedDoc = existingDocs.find(d => !usedDocIds.has(d._id));
        }

        // Đơn hàng ĐÃ CÓ trong database (đơn cũ), nhưng dư item trong JSON (không còn doc nào chưa dùng)
        // Theo yêu cầu: không được thêm mới cho những id đơn hàng đã có. Bỏ qua tạo mới.
        if (!matchedDoc && existingDocs.length > 0) {
            return; // Skip (tương đương continue)
        }

        let docId = "";
        let isExisting = false;

        if (matchedDoc) {
            // Đã tồn tại (dù là ID cũ hay mới)
            docId = matchedDoc._id;
            usedDocIds.add(docId);
            isExisting = true;
        } else {
            // Hoàn toàn mới
            let baseId = "";
            if (itemId) {
                baseId = `${orderId}_${itemId}`;
            } else {
                let hash = 0;
                for (let j = 0; j < itemName.length; j++) {
                  hash = ((hash << 5) - hash) + itemName.charCodeAt(j);
                  hash |= 0;
                }
                baseId = `${orderId}_${Math.abs(hash).toString(16)}`;
            }
            idCounter[baseId] = (idCounter[baseId] || 0) + 1;
            docId = idCounter[baseId] > 1 ? `${baseId}_${idCounter[baseId]}` : baseId;
            usedDocIds.add(docId);
        }

        const ref = doc(db, "orders", docId);

        if (isExisting) {
          // Đơn đã tồn tại: áp dụng logic State Machine cho cột Chiết Khấu
          const oldData = matchedDoc;
          const oldStatus = (oldData["Trạng thái đặt hàng"] || "").toString().trim();
          const newStatus = (order["Trạng thái đặt hàng"] || "").toString().trim();

          const { userId, claimedAt, createdAt, ...orderFields } = order;

          const isCancelled = newStatus === "Đã huỷ" || newStatus === "Đã hủy" || newStatus === "Hủy";
          
          if (isCancelled) {
            // 1. Đơn huỷ -> Chiết khấu = 0
            orderFields["Chiết Khấu"] = 0;
            if (orderFields["Chiết Khấu 2%"] !== undefined) orderFields["Chiết Khấu 2%"] = 0;
          } else if (oldStatus === "Chưa thanh toán" && newStatus === "Đang chờ xử lý") {
            // 2. Chưa thanh toán -> Đang chờ xử lý -> Lấy từ JSON mới (không làm gì thêm vì orderFields đã chứa giá trị mới)
          } else {
            // 3. Các trường hợp khác -> Khoá cột Chiết Khấu (Giữ nguyên giá trị trên Database)
            if (oldData["Chiết Khấu"] !== undefined) {
              orderFields["Chiết Khấu"] = oldData["Chiết Khấu"];
            }
            if (oldData["Chiết Khấu 2%"] !== undefined) {
              orderFields["Chiết Khấu 2%"] = oldData["Chiết Khấu 2%"];
            }
          }

          batch.set(ref, { ...orderFields, updatedAt: serverTimestamp() }, { merge: true });
          countUpdated++;
        } else {
          // Đơn mới: tạo với userId = null (chưa gán)
          batch.set(ref, { ...order, userId: null, claimedAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
          countNew++;
        }
      }));

      await batch.commit();
    }

    msgEl.innerHTML = `<div class="msg msg-ok">
      ✅ Import thành công <strong>${pendingData.length}</strong> đơn hàng!
      <br><small>🆕 Thêm mới: <strong>${countNew}</strong> &nbsp;|  🔄 Cập nhật trạng thái: <strong>${countUpdated}</strong></small>
    </div>`;
    document.getElementById("upload-preview").innerHTML = "";
    pendingData = null;
    await loadOrders(); renderDashboard();
  } catch(e) {
    msgEl.innerHTML = `<div class="msg msg-err">❌ ${e.message}</div>`;
  }
};

// ─── PAYMENTS ──────────────────────────────────────────────
async function loadPaymentRequests() {
  try {
    const snap = await getDocs(collection(db, "payment_requests"));
    allPaymentRequests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    allPaymentRequests.sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
  } catch (e) {
    console.error("Error loading payment requests", e);
    allPaymentRequests = [];
  }
  
  const pendingCount = allPaymentRequests.filter(r => r.status === "pending").length;
  const badge = document.getElementById("payment-badge");
  if (badge) {
    badge.textContent = pendingCount > 0 ? `(${pendingCount})` : "";
  }

  renderPaymentRequests();
}
window.loadPaymentRequests = loadPaymentRequests;

function renderPaymentRequests() {
  const tbody = document.getElementById("payments-tbody");
  if (!allPaymentRequests.length) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#999">Không có yêu cầu nào</td></tr>`; return; }
  
  const stFilter = document.getElementById("filter-pay-status")?.value || "";
  const txtFilter = (document.getElementById("filter-pay-search")?.value || "").toLowerCase();

  const filtered = allPaymentRequests.filter(r => {
    if (stFilter && r.status !== stFilter) return false;
    if (txtFilter) {
      const q = txtFilter;
      const uid = (r.requestId || "").toLowerCase();
      const uname = (r.userName || getUserName(r.userId) || "").toLowerCase();
      if (!uid.includes(q) && !uname.includes(q)) return false;
    }
    return true;
  });

  if (!filtered.length) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#999">Không tìm thấy yêu cầu nào</td></tr>`; return; }

  tbody.innerHTML = filtered.map(r => {
    let date = "–";
    if (r.createdAt && typeof r.createdAt.toDate === "function") {
      date = r.createdAt.toDate().toLocaleString("vi-VN");
    }
    
    let stBadge = r.status === "approved" ? `<span class="badge badge-paid">✅ Đã duyệt</span>` : `<span class="badge badge-unpaid">⏳ Đang chờ</span>`;
    
    const uInfo = allUsers.find(x => x.id === r.userId) || {};
    const bankAcc = uInfo.bankAccount || "";
    const bankName = uInfo.bankName || "";
    const amount = r.totalValue || 0;
    const userName = (r.userName || "USER").trim();
    // Thay thế dấu gạch ngang/underscore bằng khoảng trắng vì VietQR xoá kí tự đặc biệt làm dính chữ
    const neatId = (r.requestId || "").replace(/_/g, ' '); 
    const desc = encodeURIComponent(`SANDEAL THANH TOAN ${neatId}`);
    const qrUrl = (bankAcc && bankName) ? `https://qr.sepay.vn/img?acc=${bankAcc}&bank=${bankName}&amount=${amount}&des=${desc}&template=compact` : '';
    
    
    
    let qrBtn = qrUrl ? `<button class="btn btn-outline btn-xs" style="color:var(--orange); border-color:var(--orange); margin-right:4px;" data-url="${escapeHTML(qrUrl)}" data-name="${escapeHTML(userName)}" data-bfull="${escapeHTML(uInfo.bankFullName || '')}" data-bname="${escapeHTML(bankName)}" data-bacc="${escapeHTML(bankAcc)}" onclick="showQR(this.dataset.url, this.dataset.name, this.dataset.bfull, this.dataset.bname, this.dataset.bacc)">📷 Lấy QR</button>` : '';

    let actionBtn = r.status === "pending" ? 
      `${qrBtn}<button class="btn btn-green btn-xs" onclick="approvePayment('${escapeHTML(r.id)}')">✅ Duyệt thanh toán</button>
       <button class="btn btn-red btn-xs" onclick="deletePayment('${escapeHTML(r.id)}')" style="margin-left:4px;">🗑️ Xoá</button>` : 
      `<span style="color:#aaa;font-size:12px;font-style:italic">Đã xử lý</span>
       <button class="btn btn-red btn-xs" onclick="deletePayment('${escapeHTML(r.id)}')" style="margin-left:4px;">🗑️ Xoá</button>`;
      
    const orderCodes = (r.orderIds || []).map(id => id.split('_')[0]);
    const uniqueCodes = [...new Set(orderCodes)].filter(Boolean);
      
    return `<tr>
      <td><code>${escapeHTML(r.requestId)}</code></td>
      <td>${escapeHTML(r.userName || getUserName(r.userId))}</td>
      <td>
        <div style="font-weight: 600;">${r.totalCount} đơn</div>
        <div style="font-size: 11px; color: #666; max-width: 200px; white-space: normal; line-height: 1.5; margin-top: 4px;">
          ${uniqueCodes.map(id => `<code>${escapeHTML(id)}</code>`).join(", ")}
        </div>
      </td>
      <td style="font-weight:600;color:var(--orange)">${(r.totalValue||0).toLocaleString("vi-VN")} đ</td>
      <td>${date}</td>
      <td>${stBadge}</td>
      <td>${actionBtn}</td>
    </tr>`;
  }).join("");
}

window.approvePayment = async function(reqId) {
  if (!confirm("Xác nhận đã thanh toán cho yêu cầu này?\\nThao tác này sẽ tự động chuyển tất cả đơn hàng trong yêu cầu sang trạng thái 'Đã Thanh Toán'.")) return;
  
  const req = allPaymentRequests.find(r => r.id === reqId);
  if (!req || !req.orderIds || !req.orderIds.length) return;
  
  try {
    const batch = writeBatch(db);
    
    // Update request
    const reqRef = doc(db, "payment_requests", reqId);
    batch.update(reqRef, { status: "approved", updatedAt: serverTimestamp() });
    
    // Update orders
    req.orderIds.forEach(orderId => {
      const orderRef = doc(db, "orders", orderId);
      batch.update(orderRef, { thanhToan: "Đã Thanh Toán", updatedAt: serverTimestamp() });
    });
    
    await batch.commit();
    alert("✅ Đã duyệt yêu cầu thành công!");
    await Promise.all([loadPaymentRequests(), loadOrders()]);
  } catch (e) {
    alert("❌ Lỗi duyệt yêu cầu: " + e.message);
  }
};

// ─── SHORTLINKS ────────────────────────────────────────────
function renderShortLinks() {
  const tbody = document.getElementById("shortlinks-tbody");
  if (!allShortLinks.length) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:#999">Chưa có link nào</td></tr>`; return; }
  
  const domain = window.location.origin + "/";
  tbody.innerHTML = allShortLinks.map(s => {
    const fullLink = domain + s.id;
    let date = "–";
    if (s.createdAt && typeof s.createdAt.toDate === "function") {
      date = s.createdAt.toDate().toLocaleDateString("vi-VN");
    }
    
    return `<tr>
      <td><a href="${fullLink}" target="_blank" style="color:var(--blue);font-weight:600;text-decoration:none">${fullLink}</a></td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHTML(s.url)}">${escapeHTML(s.url)}</td>
      <td>${date}</td>
      <td>${s.clicks || 0}</td>
      <td style="display:flex;gap:4px;">
        <button class="btn btn-outline btn-xs" onclick="data-link="${escapeHTML(fullLink)}" onclick="copyToClipboard(this.dataset.link, this)"">📋 Copy</button>
        <button class="btn btn-red btn-xs" onclick="deleteShortLink('${escapeHTML(s.id)}')">🗑️</button>
      </td>
    </tr>`;
  }).join("");
}

window.copyToClipboard = function(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const old = btn.innerHTML;
    btn.innerHTML = "✅ Copied";
    setTimeout(() => btn.innerHTML = old, 1500);
  });
};

window.deleteShortLink = async function(id) {
  if (!confirm("Xóa link rút gọn này?")) return;
  await deleteDoc(doc(db, "shortlinks", id));
  await loadShortLinks();
};

window.createShortLink = async function() {
  const url = document.getElementById("sl-url").value.trim();
  const msg = document.getElementById("sl-msg");
  msg.innerHTML = "";
  if (!url) { msg.innerHTML = `<div class="msg msg-err">Vui lòng nhập link gốc.</div>`; return; }
  if (!url.startsWith("http")) { msg.innerHTML = `<div class="msg msg-err">Link phải có dạng http:// hoặc https://</div>`; return; }
  
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let shortCode = '';
  for (let i = 0; i < 10; i++) {
    shortCode += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  msg.innerHTML = `<div class="msg msg-info"><span class="spinner"></span> Đang tạo...</div>`;
  try {
    await setDoc(doc(db, "shortlinks", shortCode), {
      url: url,
      clicks: 0,
      createdAt: serverTimestamp()
    });
    
    msg.innerHTML = `<div class="msg msg-ok">✅ Rút gọn thành công! Link đã được thêm vào danh sách.</div>`;
    document.getElementById("sl-url").value = "";
    await loadShortLinks();
  } catch (e) {
    msg.innerHTML = `<div class="msg msg-err">❌ Lỗi: ${e.message}</div>`;
  }
};

// ─── TABS / AUTH ───────────────────────────────────────────
window.showTab = function(tab) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");
  document.querySelector(`[data-tab="${tab}"]`).classList.add("active");
  const titles = { dashboard: "Dashboard", orders: "Đơn hàng", users: "Users", payments: "Yêu Cầu Thanh Toán", upload: "Upload JSON", shortlinks: "Rút gọn Link" };
  document.getElementById("topbar-title").textContent = titles[tab] || tab;
  const sidebar = document.querySelector(".sidebar");
  if (sidebar && sidebar.classList.contains("show")) sidebar.classList.remove("show");
};

window.adminLogin = async function() {
  const email = document.getElementById("adm-email").value.trim();
  const pass  = document.getElementById("adm-pass").value;
  try { await signInWithEmailAndPassword(auth, email, pass); }
  catch(e) { showAuthErr("❌ Email hoặc mật khẩu không đúng."); }
};
window.adminLogout = async function() { await signOut(auth); };

function showAuthErr(text) {
  const m = document.getElementById("adm-msg");
  m.className = "amsg err"; m.textContent = text;
}

window.showQR = function(url, uname, bFullName, bName, bAcc) {
  document.getElementById("qr-img-preview").src = url;
  if(document.getElementById("qr-username")) {
    document.getElementById("qr-username").textContent = uname || "Không có";
    document.getElementById("qr-bank-fullname").textContent = bFullName || "Không có";
    document.getElementById("qr-bank-name").textContent = bName || "Không có";
    document.getElementById("qr-bank-account").textContent = bAcc || "Không có";
  }
  document.getElementById("qr-modal").style.display = "flex";
};

window.deletePayment = async function(reqId) {
  if (!confirm("⚠️ CẢNH BÁO: Bạn có chắc chắn muốn XOÁ yêu cầu thanh toán này không?\\n\\nLưu ý: Thao tác này chỉ xoá phiếu yêu cầu trên hệ thống. Các đơn hàng bên trong yêu cầu sẽ KHÔNG bị mất, chúng vẫn ở trạng thái hiện tại (Đang chờ xử lý).")) return;
  
  try {
    const { deleteDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await deleteDoc(doc(db, "payment_requests", reqId));
    alert("✅ Đã xoá yêu cầu thanh toán thành công!");
    await loadPaymentRequests();
  } catch(e) {
    alert("❌ Lỗi khi xoá: " + e.message);
  }
};
