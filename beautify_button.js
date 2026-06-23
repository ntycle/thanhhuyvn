const fs = require('fs');

let cssHtml = fs.readFileSync('app/globals.css', 'utf8');

// Append new CSS overrides for centering stats and beautifying the button
const overrides = `
/* UI BEAUTIFICATION OVERRIDES */
.stat-item {
  align-items: center !important;
  text-align: center !important;
}
.btn-withdraw-full {
  background: linear-gradient(to bottom, #ffffff, #fdfdfd) !important;
  color: #ff5722 !important;
  font-size: 16px !important;
  padding: 16px !important;
  border-radius: 20px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), inset 0 -2px 0 rgba(0,0,0,0.05) !important;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  position: relative;
  overflow: hidden;
}
.btn-withdraw-full::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 50%;
  background: linear-gradient(to bottom, rgba(255,255,255,0.8), rgba(255,255,255,0));
  border-radius: 20px 20px 0 0;
}
.btn-withdraw-full:hover {
  transform: translateY(-3px) !important;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.15), inset 0 -2px 0 rgba(0,0,0,0.05) !important;
}
.btn-withdraw-full:active {
  transform: translateY(0) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
}
`;

fs.appendFileSync('app/globals.css', overrides);
console.log('Successfully applied UI beautification to globals.css');
