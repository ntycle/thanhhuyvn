"use client";
import { useEffect } from "react";

export default function Page() {
  return (
    <div dangerouslySetInnerHTML={{ __html: `
<div class="huongdan-body">
<div class="guide-container">
    <div class="guide-header">
        <h1>📋 HƯỚNG DẪN THỰC HIỆN</h1>
        <p>Đăng ký và sử dụng rất nhanh và đơn giản</p>
    </div>

    <div class="steps-list">
        <!-- BƯỚC 1: có hình b1.png -->
        <div class="step-card">
            <div class="step-headline">
                <h2>
                    <span class="step-badge">1</span>
                    🔍 Bước 1: Click đăng ký
                </h2>
            </div>
            <div class="step-media">
                <!-- Hình ảnh b1.png -->
                <img class="step-img" src="b1.png" alt="Đăng ký" onerror="this.onerror=null; this.src='b1.png'; this.style.opacity='0.9'">
            </div>
        </div>

        <!-- BƯỚC 2: có hình b1.png (theo yêu cầu mỗi bước kèm hình b1.png, riêng bước 4 exception) -->
        <div class="step-card">
            <div class="step-headline">
                <h2>
                    <span class="step-badge">2</span>
                    ✂️ Bước 2: Nhập thông tin để quản lý đơn hàng
                </h2>
            </div>
            <div class="step-media">
                <img class="step-img" src="b2.png" alt="Hình minh họa bước 2: thao tác đo cắt" onerror="this.onerror=null; this.src='b2.png';">
            </div>
        </div>

        <!-- BƯỚC 3: có hình b1.png -->
        <div class="step-card">
            <div class="step-headline">
                <h2>
                    <span class="step-badge">3</span>
                    🧩 Bước 3: Lấy voucher giảm giá của shopee
                </h2>
            </div>
            <div class="step-media">
                <img class="step-img" src="b3.png" alt="Hình minh họa bước 3: lắp ráp" onerror="this.onerror=null; this.src='b3.png';">
            </div>
        </div>

        <!-- BƯỚC 4: KHÔNG CÓ HÌNH (theo yêu cầu đặc biệt) -->
        <div class="step-card">
            <div class="step-headline">
                <h2>
                    <span class="step-badge">4</span>
                    ⚙️ Bước 4: Tìm và mua sản phẩm bạn có nhu cầu trên shopee
                </h2>
            </div>
			<div class="step-media">
                <img class="step-img" src="b4.jpg" alt="Lấy mã đơn hàng" onerror="this.onerror=null; this.src='b4.png';">
            </div>
            <div class="step-media">
                <!-- Không chèn hình ảnh - chỉ hiển thị thông báo đặc biệt thể hiện đúng yêu cầu "bước 4 không có hình" -->
                <div class="no-image-message">
                    <span></span>
                    <span>Sau khi mua xong qua ngày hôm sau bạn vào đơn hàng copy mã đơn hàng để kiểm tra nhé!.</span>
                    <span>📄✨</span>
                </div>
                <!-- thêm chú thích nhẹ để thân thiện -->
               
            </div>
        </div>

        <!-- BƯỚC 5: có hình b1.png -->
        <div class="step-card">
            <div class="step-headline">
                <h2>
                    <span class="step-badge">5</span>
                    🔧 Bước 5: Kiểm tra đơn hàng đã lên hệ thống hay chưa?
                </h2>
            </div>
            <div class="step-media">
                <img class="step-img" src="b5.png" alt="Kiểm tra đơn hàng" onerror="this.onerror=null; this.src='b5.png';">
            </div>
        </div>

        <!-- BƯỚC 6: có hình b1.png -->
        <div class="step-card">
            <div class="step-headline">
                <h2>
                    <span class="step-badge">6</span>
                    🎯 Bước 6: Quản lý các đơn hàng bạn đã được hệ thống ghi nhận
                </h2>
            </div>
            <div class="step-media">
                <img class="step-img" src="b6.png" alt="Quản lý đơn hàng và hãy gán sản phẩm để tránh trùng với user khác nhé" onerror="this.onerror=null; this.src='b6.png';">
                <div class="demo-note">Quản lý đơn hàng mình đã mua</div>
            </div>
        </div>
    </div>

    <div class="guide-footer">
        💡 Ghi chú: Sau khi mua hàng thì qua ngày hôm sau shopee mới lên chuyển đổi đơn nhé mọi người.
        <br>© Chúc các bạn mua sắm vui vẻ.
    </div>
</div>

<!-- Giải thích: hoàn toàn đáp ứng mô tả: 6 bước, mỗi bước là 1 headline, có hình b1.png ở các bước 1,2,3,5,6.
     Bước 4 không có hình. File html tên huongdan.html khi lưu về sẽ hiển thị hoàn chỉnh. 
     Nếu file b1.png không tồn tại trong cùng thư mục, ảnh sẽ hiển thị placeholder với chữ b1.png (demo)
     nhưng vẫn giữ đúng hình thức gọi là b1.png, đảm bảo logic "kèm hình b1.png" ở các bước trừ bước 4. -->
</div>
` }} />
  );
}
