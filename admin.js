import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, getDocs, doc, getDoc, setDoc, updateDoc,
  deleteDoc, query, where, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const cfg = {
  apiKey: "AIzaSyCD3bS8LTPnXU-9C0xVTRC-IzYfPe428x8",
  authDomain: "shopeeafff-bfd62.firebaseapp.com",
  projectId: "shopeeafff-bfd62",
  storageBucket: "shopeeafff-bfd62.firebasestorage.app",
  messagingSenderId: "1091380862349",
  appId: "1:1091380862349:web:1c82d576edc1888e4a31c4"
};
const app  = initializeApp(cfg);
const auth = getAuth(app);
const db   = getFirestore(app);

let allUsers = [], allOrders = [];

// ─── AUTH ──────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists() && snap.data().role === "admin") {
      document.getElementById("adm-name").textContent = snap.data().name || user.email;
      document.getElementById("admin-auth").style.display  = "none";
      document.getElementById("admin-panel").style.display = "block";
      loadAll();
    } else {
      await signOut(auth);
      showAuthErr("❌ Tài khoản không có quyền admin.");
    }
  } else {
    document.getElementById("admin-auth").style.display  = "flex";
    document.getElementById("admin-panel").style.display = "none";
  }
});

async function loadAll() { await Promise.all([loadUsers(), loadOrders()]); populateUserFilter(); renderDashboard(); }

// ─── LOAD ──────────────────────────────────────────────────
async function loadUsers() {
  const snap = await getDocs(collection(db, "users"));
  allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderUsers();
}
async function loadOrders() {
  const snap = await getDocs(collection(db, "orders"));
  allOrders = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
  renderOrders();
  renderUsers();
}
window.loadOrders = loadOrders;

function getUserName(uid) {
  if (!uid) return "–";
  const u = allUsers.find(u => u.id === uid);
  return u ? (u.name || u.email) : uid.slice(0,8)+"...";
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
          <td><code>${o["ID đơn hàng"]||""}</code></td>
          <td>${getUserName(o.userId)}</td>
          <td>${(Number(o["Giá trị đơn hàng (₫)"])||0).toLocaleString("vi-VN")}</td>
          <td><button class="btn btn-outline btn-xs" onclick="resetClaim('${o._id}')">↩ Reset gán</button></td>
        </tr>`).join("")}</tbody>
      </table></div>`;
}

// ─── USERS ─────────────────────────────────────────────────
function renderUsers() {
  const tbody = document.getElementById("users-tbody");
  if (!allUsers.length) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#999">Chưa có user</td></tr>`; return; }
  tbody.innerHTML = allUsers.map(u => {
    const cnt  = allOrders.filter(o => o.userId === u.id).length;
    let date = "–";
    if (u.createdAt && typeof u.createdAt.toDate === "function") {
      date = u.createdAt.toDate().toLocaleDateString("vi-VN");
    }
    return `<tr>
      <td>${u.name || "–"}</td>
      <td>${u.email}</td>
      <td><span class="badge badge-${u.role === "admin" ? "admin" : "user"}">${u.role === "admin" ? "Admin" : "User"}</span></td>
      <td>${cnt}</td>
      <td>${date}</td>
      <td>${u.role !== "admin"
        ? `<button class="btn btn-red btn-xs" onclick="resetUserClaims('${u.id}','${u.name||u.email}')">↩ Reset đơn</button>`
        : ""}</td>
    </tr>`;
  }).join("");
}

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

// ─── ORDERS ────────────────────────────────────────────────
function populateUserFilter() {
  const opts = allUsers.filter(u => u.role !== "admin").map(u => `<option value="${u.id}">${u.name||u.email}</option>`).join("");
  document.getElementById("filter-user").innerHTML = `<option value="">-- Lọc theo user --</option>` + opts;
}

function renderOrders(list) {
  const orders = list || allOrders;
  const tbody  = document.getElementById("orders-tbody");
  if (!orders.length) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#999">Không có đơn hàng</td></tr>`; return; }
  tbody.innerHTML = orders.map(o => {
    const val     = Number(o["Giá trị đơn hàng (₫)"]) || 0;
    const claimed = !!o.userId;
    // Build payment dropdown (admin only)
    const payVal = o.thanhToan || "";
    const payClass = payVal === "Đã Thanh Toán" ? "paid" : payVal === "Chưa Thanh Toán" ? "unpaid" : "";
    const paySel = `<select class="pay-sel ${payClass}" onchange="setPayment('${o._id}', this)">
      <option value=""${payVal === "" ? " selected" : ""}>– Chưa cập nhật</option>
      <option value="Chưa Thanh Toán"${payVal === "Chưa Thanh Toán" ? " selected" : ""}>Chưa Thanh Toán</option>
      <option value="Đã Thanh Toán"${payVal === "Đã Thanh Toán" ? " selected" : ""}>Đã Thanh Toán</option>
    </select>`;
    return `<tr>
      <td><code>${o["ID đơn hàng"]||""}</code></td>
      <td>${val.toLocaleString("vi-VN")}</td>
      <td><span class="badge badge-${claimed?"claimed":"free"}">${claimed ? "✅ Đã gán" : "⏳ Chưa gán"}</span></td>
      <td>${paySel}</td>
      <td>${getUserName(o.userId)}</td>
      <td style="display:flex;gap:6px">
        ${claimed ? `<button class="btn btn-outline btn-xs" onclick="resetClaim('${o._id}')">↩ Reset</button>` : ""}
        <button class="btn btn-red btn-xs" onclick="deleteOrder('${o._id}')">&#128465;</button>
      </td>
    </tr>`;
  }).join("");
}

window.applyFilter = function() {
  const status  = document.getElementById("filter-status").value;
  const uid     = document.getElementById("filter-user").value;
  const keyword = document.getElementById("filter-id").value.toUpperCase().trim();
  let f = allOrders;
  if (status === "claimed") f = f.filter(o => !!o.userId);
  if (status === "free")    f = f.filter(o => !o.userId);
  if (uid)     f = f.filter(o => o.userId === uid);
  if (keyword) f = f.filter(o => (o["ID đơn hàng"]||"").toUpperCase().includes(keyword));
  renderOrders(f);
};

// ─── SET PAYMENT (admin only) ────────────────────────────────
window.setPayment = async function(docId, sel) {
  const val = sel.value;
  // Update class for instant visual feedback
  sel.className = "pay-sel " + (val === "Đã Thanh Toán" ? "paid" : val === "Chưa Thanh Toán" ? "unpaid" : "");
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

        // Tạo document ID duy nhất bằng: OrderID + Hash(Tên Item) để tránh ghi đè khi 1 id có nhiều sản phẩm
        const itemName = (order["Tên Item"] || "").toString().trim();
        let hash = 0;
        for (let j = 0; j < itemName.length; j++) {
          hash = ((hash << 5) - hash) + itemName.charCodeAt(j);
          hash |= 0;
        }
        const docId = `${orderId}_${Math.abs(hash).toString(16)}`;

        const ref = doc(db, "orders", docId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          // Đơn đã tồn tại: chỉ cập nhật các field đơn hàng (trạng thái, giá trị...)
          // GIỮ NGUYÊN userId & claimedAt (dùng merge)
          const { userId, claimedAt, createdAt, ...orderFields } = order;
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

// ─── TABS / AUTH ───────────────────────────────────────────
window.showTab = function(tab) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");
  document.querySelector(`[data-tab="${tab}"]`).classList.add("active");
  const titles = { dashboard: "Dashboard", orders: "Đơn hàng", users: "Users", upload: "Upload JSON" };
  document.getElementById("topbar-title").textContent = titles[tab] || tab;
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
