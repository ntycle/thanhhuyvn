import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { url, secret } = body;

    // 1. Kiểm tra Secret Key để bảo mật API (tránh người lạ tự tạo link rác)
    if (secret !== process.env.API_SECRET_KEY) {
      return NextResponse.json({ error: "Sai mã Secret Key bảo mật" }, { status: 401 });
    }

    if (!url || !url.startsWith("http")) {
      return NextResponse.json({ error: "URL không hợp lệ, phải bắt đầu bằng http:// hoặc https://" }, { status: 400 });
    }

    // 2. Tạo mã ngẫu nhiên 10 ký tự
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let code = "";
    for (let i = 0; i < 10; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

    // 3. Xin cấp Token Admin thông qua Firebase Auth REST API
    // Chúng ta cần Token này để vượt qua Firestore Rule "allow create: if isAdmin()"
    const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
    const authRes = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
        returnSecureToken: true
      })
    });

    const authData = await authRes.json();
    if (!authRes.ok) {
      return NextResponse.json({ error: "Không thể xác thực Admin Firebase", details: authData }, { status: 500 });
    }
    const idToken = authData.idToken;

    // 4. Lưu Shortlink vào Firestore
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/shortlinks?documentId=${code}`;
    
    const saveRes = await fetch(firestoreUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}` // Kèm Token Admin
      },
      body: JSON.stringify({
        fields: {
          url: { stringValue: url },
          clicks: { integerValue: 0 },
          createdAt: { timestampValue: new Date().toISOString() }
        }
      })
    });

    if (!saveRes.ok) {
      const saveData = await saveRes.json();
      return NextResponse.json({ error: "Lỗi lưu vào Firestore", details: saveData }, { status: 500 });
    }

    // 5. Trả về kết quả thành công
    // Lấy domain gốc (ví dụ: http://localhost:3000 hoặc https://domain.com)
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
