const fs = require('fs');

function extractHtml(filename, outJsx, addClientJs) {
  const html = fs.readFileSync(filename, 'utf8');
  let bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
  if (bodyMatch) {
    let rawHtml = bodyMatch[1];
    let jsx = `"use client";\nimport { useEffect } from "react";\n`;
    if (addClientJs) {
      jsx += `import "${addClientJs}";\n`;
    }
    jsx += `\nexport default function Page() {\n  return (\n    <div dangerouslySetInnerHTML={{ __html: \`` + rawHtml.replace(/`/g, '\\`').replace(/\$/g, '\\$') + `\` }} />\n  );\n}\n`;
    fs.writeFileSync(outJsx, jsx);
  }
}

// Extract globals.css
const html = fs.readFileSync('legacy/index.html', 'utf8');
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
if (styleMatch) {
  // Let's add tailwind imports at the top
  const globalsCss = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n` + styleMatch[1];
  fs.writeFileSync('app/globals.css', globalsCss);
}

extractHtml('legacy/index.html', 'app/page.js', './user.js');
extractHtml('legacy/admin.html', 'app/admin/page.js', './admin.js');
extractHtml('legacy/huongdan.html', 'app/huongdan/page.js', '');

// Copy client JS files directly for now, we will modify them to import from firebase.js
fs.copyFileSync('legacy/user.js', 'app/user.js');
fs.copyFileSync('legacy/admin.js', 'app/admin/admin.js');

// Ensure admin dir exists
if (!fs.existsSync('app/admin')) {
  fs.mkdirSync('app/admin');
}
extractHtml('legacy/admin.html', 'app/admin/page.js', './admin.js');
fs.copyFileSync('legacy/admin.js', 'app/admin/admin.js');

if (!fs.existsSync('app/huongdan')) {
  fs.mkdirSync('app/huongdan');
}
extractHtml('legacy/huongdan.html', 'app/huongdan/page.js', '');
