import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc,
  collection, query, where, getDocs,
  serverTimestamp, runTransaction
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

let me = null, myName = "", myOrders = [];

// ─── AUTH STATE ───────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (user) {
    me = user.uid;
    const snap = await getDoc(doc(db, "users", user.uid));
    myName = snap.exists() ? snap.data().name : user.email;
    document.getElementById("header-uname").textContent = myName;
    document.getElementById("welcome-name").textContent = myName;
    document.getElementById("auth-screen").style.display = "none";
    document.getElementById("app-screen").style.display  = "block";
    await refreshMyOrders();
  } else {
    me = null;
    document.getElementById("auth-screen").style.display = "flex";
    document.getElementById("app-screen").style.display  = "none";
  }
});

// ─── MY ORDERS ────────────────────────────────────────────
async function refreshMyOrders() {
  const q    = query(collection(db, "orders"), where("userId", "==", me));
  const snap = await getDocs(q);
  myOrders   = snap.docs.map(d => ({ _id: d.id, ...d.data() }));

  const count = myOrders.length;
  document.getElementById("mine-badge").textContent = count > 0 ? `(${count})` : "";

  let totalVal = 0, totalDisc = 0;
  myOrders.forEach(o => {
    totalVal  += Number(o["Giá trị đơn hàng (₫)"]) || 0;
    totalDisc += calcDisc(o);
  });
  document.getElementById("sum-count").textContent = count;
  document.getElementById("sum-value").textContent = (totalVal / 1e6).toFixed(2) + "M₫";
  document.getElementById("sum-disc").textContent  = totalDisc.toLocaleString("vi-VN") + "₫";

  renderMyOrders();
}

function paymentBadge(val) {
  if (val === "Đã Thanh Toán")   return `<span class="tag-paid">💚 Đã Thanh Toán</span>`;
  if (val === "Chưa Thanh Toán") return `<span class="tag-unpaid">🟡 Chưa Thanh Toán</span>`;
  return `<span class="tag-nopay">–</span>`;
}

function calcDisc(o) {
  const hh = Number((o["Hoa hồng Shopee trên sản phẩm(₫)"] || "0").toString().replace(/\./g, "")) || 0;
  const ck = Number(o["Chiết Khấu"]) || Number(o["Chiết Khấu 2%"]) || 0;
  return hh === 0 ? 0 : Math.min(ck, 20000);
}

// Render một cell theo field name — thứ tự cố định bởi COL_ORDER
function renderCell(h, o, val, disc) {
  if (h === "Giá trị đơn hàng (₫)") return `<td>${val.toLocaleString("vi-VN")}</td>`;
  if (h === "Chiết Khấu")           return `<td>${disc.toLocaleString("vi-VN")}</td>`;
  if (h === "Tên Item") {
    const full  = String(o[h] || "");
    const short = full.length > 50 ? full.slice(0, 50) + "\u2026" : full;
    return `<td class="col-name"><span title="${full.replace(/"/g, '&quot;')}">${short}</span></td>`;
  }
  return `<td>${o[h] || ""}</td>`;
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
    const val  = Number(o["Giá trị đơn hàng (₫)"]) || 0;
    const disc = calcDisc(o);
    totalVal += val; totalDisc += disc;
    const dataCells = COL_ORDER.map(h => renderCell(h, o, val, disc)).join("");
    return `<tr>${dataCells}<td>${paymentBadge(o.thanhToan)}</td><td><span class="tag-mine" style="font-size:11px;padding:3px 10px">✅ Đã gán</span></td></tr>`;
  }).join("");

  const tfootRow = COL_ORDER.map(h => {
    if (h === "Giá trị đơn hàng (₫)") return `<td>${totalVal.toLocaleString("vi-VN")}</td>`;
    if (h === "Chiết Khấu")           return `<td>${totalDisc.toLocaleString("vi-VN")}</td>`;
    return `<td>${h === COL_ORDER[0] ? "TỔNG" : ""}</td>`;
  }).join("") + `<td></td><td></td>`;

  el.innerHTML = `<div class="result-wrap"><table>
    <thead><tr>${theadRow}</tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>${tfootRow}</tr></tfoot>
  </table></div>`;
}

// ─── SEARCH ──────────────────────────────────────────────
window.doSearch = async function() {
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
          const snaps    = await Promise.all(promises);
          snaps.forEach(s => { if (s.exists()) found.push({ _id: s.id, ...s.data() }); });
        } else throw qErr;
      }
    }

    if (!found.length) {
      resultDiv.innerHTML = `<div class="not-found">❌ Không tìm thấy đơn hàng nào khớp với: <b>${ids.join(", ")}</b></div>`;
      return;
    }
    renderSearchResults(found, resultDiv);
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
    const val  = Number(o["Giá trị đơn hàng (₫)"]) || 0;
    const disc = calcDisc(o);
    totalVal += val; totalDisc += disc;

    const isMine    = o.userId === me;
    const isClaimed = !!o.userId;
    const actionCell = isMine
      ? `<td><span class="tag-mine">✅ Của tôi</span></td>`
      : isClaimed
        ? `<td><span class="tag-other">🔒 Đã gán</span></td>`
        : `<td><button class="btn-claim" onclick="claimOrder('${o._id}', this)">📌 Gán cho tôi</button></td>`;

    const dataCells = COL_ORDER.map(h => renderCell(h, o, val, disc)).join("");
    return `<tr>${dataCells}<td>${paymentBadge(o.thanhToan)}</td>${actionCell}</tr>`;
  }).join("");

  const tfootRow = COL_ORDER.map(h => {
    if (h === "Giá trị đơn hàng (₫)") return `<td>${totalVal.toLocaleString("vi-VN")}</td>`;
    if (h === "Chiết Khấu")           return `<td>${totalDisc.toLocaleString("vi-VN")}</td>`;
    return `<td>${h === COL_ORDER[0] ? "TỔNG" : ""}</td>`;
  }).join("") + `<td></td><td></td>`;

  container.innerHTML = `<div class="card" style="padding:0"><div class="result-wrap"><table>
    <thead><tr>${theadRow}</tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>${tfootRow}</tr></tfoot>
  </table></div></div>`;
}

// ─── CLAIM ───────────────────────────────────────────────
window.claimOrder = async function(docId, btn) {
  btn.disabled = true; btn.textContent = "⏳...";
  try {
    await runTransaction(db, async (tx) => {
      const ref  = doc(db, "orders", docId);
      const snap = await tx.get(ref);
      if (!snap.exists())      throw new Error("Đơn hàng không tồn tại.");
      if (snap.data().userId)  throw new Error("TAKEN");
      tx.update(ref, { userId: me, claimedAt: serverTimestamp() });
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

// ─── NAV TABS ─────────────────────────────────────────────
window.showMainTab = function(tab) {
  document.getElementById("main-search").style.display = tab === "search" ? "block" : "none";
  document.getElementById("main-mine").style.display   = tab === "mine"   ? "block" : "none";
  document.getElementById("nav-search").classList.toggle("active", tab === "search");
  document.getElementById("nav-mine").classList.toggle("active",   tab === "mine");
};

window.switchTab = function(tab) {
  document.getElementById("tab-login").style.display    = tab === "login"    ? "block" : "none";
  document.getElementById("tab-register").style.display = tab === "register" ? "block" : "none";
  document.querySelectorAll(".auth-tab").forEach((el, i) =>
    el.classList.toggle("active", (tab === "login" && i === 0) || (tab === "register" && i === 1))
  );
};

// ─── AUTH ACTIONS ─────────────────────────────────────────
window.doLogin = async function() {
  const email = document.getElementById("login-email").value.trim();
  const pass  = document.getElementById("login-pass").value;
  const msg   = document.getElementById("login-msg");
  msg.className = "amsg";
  if (!email || !pass) { msg.className = "amsg err"; msg.textContent = "Vui lòng nhập đầy đủ."; return; }
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    msg.className = "amsg err";
    msg.textContent = e.code === "auth/invalid-credential" ? "❌ Email hoặc mật khẩu không đúng." : "❌ " + e.message;
  }
};

window.doRegister = async function() {
  const name  = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const pass  = document.getElementById("reg-pass").value;
  const msg   = document.getElementById("reg-msg");
  msg.className = "amsg";
  if (!name || !email || !pass) { msg.className = "amsg err"; msg.textContent = "Vui lòng nhập đầy đủ."; return; }
  if (pass.length < 6)          { msg.className = "amsg err"; msg.textContent = "Mật khẩu phải ít nhất 6 ký tự."; return; }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "users", cred.user.uid), { name, email, role: "user", createdAt: serverTimestamp() });
    msg.className = "amsg ok"; msg.textContent = "✅ Đăng ký thành công!";
  } catch (e) {
    msg.className = "amsg err";
    msg.textContent = e.code === "auth/email-already-in-use" ? "❌ Email đã được dùng." : "❌ " + e.message;
  }
};

window.doLogout = async function() {
  await signOut(auth);
  document.getElementById("search-result").innerHTML = "";
  document.getElementById("orderId").value = "";
};
