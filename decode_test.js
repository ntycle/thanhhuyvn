const fs = require('fs');
let txt = fs.readFileSync('app/user.js', 'utf8');

const cp1252ToByte = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
  0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
  0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
  0x017E: 0x9E, 0x0178: 0x9F
};

// We will scan the string for sequences of characters that match the double-encoded UTF-8 pattern.
// Specifically, characters between 0xC2 and 0xF4 followed by other characters in 0x80-0xBF (mapped by cp1252).
// Wait, if it's already a string, we can just map each char to its byte, and then decode the whole buffer!
// BUT we have some characters that were "fixed" by me, e.g. "đ" (U+0111).
// If we just convert "đ" to byte 0x111, it's > 255.
// So we can detect double-encoding!

let outBytes = [];
for (let i = 0; i < txt.length; i++) {
  let c = txt.charCodeAt(i);
  if (c > 255) {
    if (cp1252ToByte[c] !== undefined) {
      outBytes.push(cp1252ToByte[c]);
    } else {
      // This is a character I fixed or a valid unicode char that was NOT double encoded.
      // But wait! If it's a fixed character, it should be encoded as UTF-8 bytes to be preserved!
      let utf8Bytes = Buffer.from(txt[i], 'utf8');
      for (let j = 0; j < utf8Bytes.length; j++) outBytes.push(utf8Bytes[j]);
    }
  } else {
    // 0x00 - 0xFF (mostly 1-to-1 with cp1252 except the holes)
    outBytes.push(c);
  }
}

let recovered = Buffer.from(outBytes).toString('utf8');
console.log(recovered.substring(200, 500));
console.log("-------------------");
console.log(recovered.substring(1000, 1300));
fs.writeFileSync('app/user_recovered.js', recovered, 'utf8');
