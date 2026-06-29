import { NextResponse } from 'next/server';

async function getFirestore() {
  const { getApps, initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getFirestore();
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { senderZaloId, code } = body;

    if (!senderZaloId || !code) {
      return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 });
    }

    const db = await getFirestore();
    const codeStr = code.trim().toUpperCase();

    // Tìm bonusCode
    const snap = await db.collection('bonusCodes').doc(codeStr).get();
    if (!snap.exists) {
      return NextResponse.json({ success: false, message: 'Mã không tồn tại.' });
    }

    const data = snap.data();

    // Kiểm tra trạng thái
    if (data.status === 'active') {
      return NextResponse.json({ success: false, message: 'Mã đã được kích hoạt rồi.' });
    }
    if (data.status === 'used') {
      return NextResponse.json({ success: false, message: 'Mã đã được sử dụng rồi.' });
    }
    if (data.status === 'expired') {
      return NextResponse.json({ success: false, message: 'Mã đã hết hạn.' });
    }
    if (data.status !== 'pending') {
      return NextResponse.json({ success: false, message: 'Mã không hợp lệ.' });
    }

    // Ghi lại senderZaloId để biết ai đã kích hoạt (không dùng để verify)
    // Không check zaloId vì Zalo App ID và OA ID có thể khác nhau cho cùng 1 user

    // Kích hoạt: expireAt = now + 30 ngày
    const now = new Date();
    const expireAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await snap.ref.update({
      status: 'active',
      activatedAt: now,
      expireAt: expireAt,
      activatedByZaloId: senderZaloId,
    });

    return NextResponse.json({
      success: true,
      message: `✅ Kích hoạt thành công! Bonus +${data.bonusPercent}% cho lần rút đầu tiên. Hết hạn: ${expireAt.toLocaleDateString('vi-VN')}`,
      bonusPercent: data.bonusPercent,
      expireAt: expireAt.toISOString(),
    });

  } catch (err) {
    return NextResponse.json({ error: 'Server Error', details: err.message }, { status: 500 });
  }
}
