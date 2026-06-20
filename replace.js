const fs = require('fs');
let userJs = fs.readFileSync('public/user.js', 'utf8');
let adminJs = fs.readFileSync('public/admin.js', 'utf8');

// Replace hardcoded config
const cfgRegex = /const cfg = \{[\s\S]*?appId: [^\}]*\};/;
const newCfg = 'const cfg = window.ENV || {};';
userJs = userJs.replace(cfgRegex, newCfg);
adminJs = adminJs.replace(cfgRegex, newCfg);

// Replace Zalo fetch in user.js
const zaloFetchRegex = /const tokenUrl = "https:\/\/oauth\.zaloapp\.com\/v4\/access_token";[\s\S]*?body\.append\('grant_type', 'authorization_code'\);/;
const newZaloFetch = `const tokenUrl = "/api/zalo/token";\n  const body = JSON.stringify({ code: zaloCode });`;
userJs = userJs.replace(zaloFetchRegex, newZaloFetch);

// Replace headers and body in the fetch
const fetchOptionsRegex = /method: 'POST',\s*headers: \{\s*'Content-Type': 'application\/x-www-form-urlencoded',\s*'secret_key': '[^']*'\s*\},\s*body: body/g;
const newFetchOptions = `method: 'POST',\n      headers: { 'Content-Type': 'application/json' },\n      body: body`;
userJs = userJs.replace(fetchOptionsRegex, newFetchOptions);

userJs = userJs.replace(/const proxyUrl = "https:\/\/corsproxy\.io\/\?" \+ encodeURIComponent\(tokenUrl\);/g, 'const proxyUrl = tokenUrl;');

fs.writeFileSync('public/user.js', userJs);
fs.writeFileSync('public/admin.js', adminJs);
