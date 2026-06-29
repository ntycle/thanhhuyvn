(function () {
  var ua = navigator.userAgent || "";
  var isFB = /FBAN|FBAV|FB_IAB|FBIOS|FB4A|Instagram/i.test(ua);
  if (!isFB) return;

  var overlay = document.getElementById("fb-webview-overlay");
  if (!overlay) return;
  overlay.style.display = "flex";

  var isAndroid = /Android/i.test(ua);
  var isIOS = /iPhone|iPad|iPod/i.test(ua);
  var url = location.href;

  var chromewrap = document.getElementById("fb-open-chrome-wrap");
  var stepsEl = document.getElementById("fb-steps-text");

  if (isAndroid) {
    var intentUrl =
      "intent://" +
      url.replace(new RegExp("^https?://"), "") +
      "#Intent;scheme=https;package=com.android.chrome;end";
    chromewrap.innerHTML =
      '<a class="fb-btn btn-chrome" href="' + intentUrl + '">🌐 Mở bằng Chrome</a>';
    stepsEl.innerHTML =
      "<b>Hoặc làm thủ công:</b><br>" +
      "1. Bấm vào <b>⋮</b> (góc trên phải)<br>" +
      '2. Chọn <b>"Open in browser"</b>';
  } else if (isIOS) {
    chromewrap.innerHTML = "";
    stepsEl.innerHTML =
      "<b>Cách mở bằng Safari:</b><br>" +
      "1. Bấm vào <b>···</b> (góc dưới phải)<br>" +
      '2. Chọn <b>"Open in external browser"</b><br><br>' +
      "<b>Cách mở bằng Chrome:</b><br>" +
      "1. Bấm nút <b>Copy link</b> bên dưới<br>" +
      "2. Mở Chrome → dán vào thanh địa chỉ";
  } else {
    chromewrap.innerHTML = "";
    stepsEl.innerHTML =
      "<b>Hướng dẫn:</b><br>" +
      "1. Bấm vào <b>⋮</b> hoặc <b>···</b><br>" +
      '2. Chọn <b>"Open in browser"</b> hoặc <b>"Mở bằng trình duyệt"</b>';
  }
})();
