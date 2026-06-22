import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  // Đợi params trong Next.js 15+
  const { code } = await params;

  // Shortlink của bạn đang set là 10 ký tự ngẫu nhiên
  // Kiểm tra độ dài để tránh bắt nhầm các route khác hoặc file tĩnh không tồn tại
  if (!code || code.length !== 10) {
    // Nếu không phải dạng shortlink, chuyển hướng về trang chủ
    return NextResponse.redirect(new URL('/', request.url));
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    return NextResponse.json({ error: "Thiếu cấu hình Firebase Project ID" }, { status: 500 });
  }

  // 1. Fetch url đích từ Firestore thông qua REST API (Rất nhẹ và siêu tốc độ)
  const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/shortlinks/${code}`;
  
  try {
    const res = await fetch(docUrl, { cache: 'no-store' });
    
    if (!res.ok) {
      // Nếu link không tồn tại (lỗi 404 từ Firestore), chuyển về trang chủ
      return NextResponse.redirect(new URL('/', request.url));
    }
    
    const data = await res.json();
    const targetUrl = data?.fields?.url?.stringValue;

    if (targetUrl) {
      // 2. Gửi request tăng lượt click (clicks) lên 1
      const commitUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
      
      // Chạy ngầm, không dùng await để tránh làm chậm tốc độ chuyển hướng của người dùng
      fetch(commitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          writes: [{
            transform: {
              document: `projects/${projectId}/databases/(default)/documents/shortlinks/${code}`,
              fieldTransforms: [{ fieldPath: "clicks", increment: { integerValue: "1" } }]
            }
          }]
        })
      }).catch(err => console.error("Lỗi cập nhật clicks:", err));

      // 3. Thực hiện chuyển hướng lập tức tới link gốc
      return NextResponse.redirect(targetUrl);
    }
  } catch (error) {
    console.error("Lỗi API Shortlink:", error);
  }

  // Fallback về trang chủ nếu xảy ra lỗi không xác định
  return NextResponse.redirect(new URL('/', request.url));
}
