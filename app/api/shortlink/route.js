import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

// 1. Khởi tạo và cache Firebase Admin instance
function getFirebaseAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Xử lý ký tự xuống dòng bị escape trong biến môi trường
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      })
    });
  }
  return admin;
}

// In-memory Rate Limiting (15 requests/minute)
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, firstRequest: now });
    return true;
  }
  
  const data = rateLimitMap.get(ip);
  if (now - data.firstRequest > RATE_LIMIT_WINDOW_MS) {
    // Reset window
    rateLimitMap.set(ip, { count: 1, firstRequest: now });
    return true;
  }
  
  if (data.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  data.count++;
  return true;
}

export async function POST(request) {
  try {
    // Kiểm tra Rate Limit theo IP
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: "Quá nhiều yêu cầu, vui lòng thử lại sau" }, { status: 429 });
    }

    const body = await request.json();
    const { url, secret } = body;

    // 2. Kiểm tra Secret Key để bảo mật API
    if (secret !== process.env.API_SECRET_KEY) {
      return NextResponse.json({ error: "Sai mã Secret Key bảo mật" }, { status: 401 });
    }

    if (!url || !url.startsWith("http")) {
      return NextResponse.json({ error: "URL không hợp lệ, phải bắt đầu bằng http:// hoặc https://" }, { status: 400 });
    }

    // Giới hạn độ dài URL
    if (url.length > 2000) {
      return NextResponse.json({ error: "URL quá dài, tối đa 2000 ký tự" }, { status: 400 });
    }

    // 3. Tạo mã ngẫu nhiên 10 ký tự an toàn bằng Web Crypto API
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const randomArray = new Uint8Array(10);
    crypto.getRandomValues(randomArray);
    
    let code = "";
    for (let i = 0; i < 10; i++) {
      code += chars[randomArray[i] % chars.length];
    }

    // 4. Lưu Shortlink vào Firestore bằng Admin SDK
    const adminApp = getFirebaseAdmin();
    const db = adminApp.firestore();
    
    await db.collection('shortlinks').doc(code).set({
      url: url,
      clicks: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 5. Trả về kết quả thành công
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const shortUrl = `${protocol}://${host}/${code}`;

    return NextResponse.json({ 
      success: true, 
      code: code, 
      shortUrl: shortUrl,
      targetUrl: url 
    });

  } catch (error) {
    console.error("Lỗi hệ thống API:", error);
    return NextResponse.json({ error: "Lỗi Server", details: error.message }, { status: 500 });
  }
}

