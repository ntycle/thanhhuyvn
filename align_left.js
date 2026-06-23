const fs = require('fs');

let pageHtml = fs.readFileSync('app/page.js', 'utf8');

// Replace flex-end with flex-start for wallet-left-info
pageHtml = pageHtml.replace(
  /<div class="wallet-left-info" style="display: flex; flex-direction: column; justify-content: center; align-items: flex-end;">/g,
  '<div class="wallet-left-info" style="display: flex; flex-direction: column; justify-content: center; align-items: flex-start;">'
);

fs.writeFileSync('app/page.js', pageHtml);
console.log('Successfully aligned balance to the left.');

// Also update the media query in globals.css if needed, wait, I added an override in globals.css:
// .wallet-left-info { align-items: flex-end !important; }
let cssHtml = fs.readFileSync('app/globals.css', 'utf8');
cssHtml = cssHtml.replace(
  /align-items: flex-end !important;/g,
  'align-items: flex-start !important;'
);
fs.writeFileSync('app/globals.css', cssHtml);
console.log('Successfully updated globals.css media queries.');
