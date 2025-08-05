let data = [];

fetch("data.json")
  .then(response => response.json())
  .then(json => {
    data = json;
  })
  .catch(error => {
    document.getElementById("result").innerHTML = "<p class='not-found'>❌ Không tải được dữ liệu.</p>";
    console.error("Lỗi khi tải JSON:", error);
  });

function search() {
  const rawInput = document.getElementById("orderId").value;
  const ids = rawInput.toUpperCase().split(/[\s,]+/).filter(Boolean);

  const matches = data.filter(item => ids.includes(item["ID đơn hàng"].toUpperCase()));
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = "";

  if (matches.length === 0) {
    resultDiv.innerHTML = `<p class="not-found">❌ Không tìm thấy đơn hàng nào khớp với: <b>${ids.join(", ")}</b></p>`;
    return;
  }

  const table = document.createElement("table");
  const headers = Object.keys(matches[0]).filter(h => h !== "Hoa hồng Shopee trên sản phẩm(₫)");

  const thead = table.insertRow();
  headers.forEach(h => {
    const th = document.createElement("th");
    th.innerText = h;
    thead.appendChild(th);
  });

  let totalValue = 0;
  let totalDiscount = 0;

matches.forEach(row => {
  const tr = table.insertRow();
  headers.forEach(h => {
    const td = tr.insertCell();

    // Nếu là cột Chiết Khấu 2%, thì giới hạn hiển thị là 20.000
    if (h === "Chiết Khấu 2%") {
      const value = Math.min(Number(row[h]) || 0, 20000);
      td.innerText = value.toLocaleString("vi-VN");
      totalDiscount += value;
    }
    // Các cột khác xử lý bình thường
    else if (h === "Giá trị đơn hàng (₫)") {
      const value = Number(row[h]) || 0;
      td.innerText = value.toLocaleString("vi-VN");
      totalValue += value;
    }
    else {
      td.innerText = row[h];
    }
  });
});

  const tfoot = table.createTFoot();
  const trFoot = tfoot.insertRow();
  headers.forEach(h => {
    const td = trFoot.insertCell();
    if (h === "Giá trị đơn hàng (₫)") {
      td.innerText = totalValue.toLocaleString("vi-VN");
    } else if (h === "Chiết Khấu 2%") {
      td.innerText = totalDiscount.toLocaleString("vi-VN");
    } else {
      td.innerText = "";
    }
  });

  resultDiv.appendChild(table);
}
