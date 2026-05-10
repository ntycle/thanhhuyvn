import re
import sys

def deobfuscate(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the string array
    match = re.search(r"const _0x2858b2=\[([\s\S]+?)\];", content)
    if not match:
        print("Array not found")
        return
        
    arr_str = match.group(1)
    
    # Simple split (warning: doesn't handle escaped quotes perfectly but should be ok for this file)
    # The array seems to have '...' strings separated by commas
    parts = []
    current = ""
    in_str = False
    for char in arr_str:
        if char == "'" and not (len(current) > 0 and current[-1] == '\\'):
            in_str = not in_str
            if not in_str:
                parts.append(current)
                current = ""
        elif in_str:
            current += char

    print(f"Found {len(parts)} strings")
    
    # We need to emulate _0x140671(_0x33f7d6)
    # _0x4131(offset) = parts[offset - 0x190]
    
    def replacer(m):
        func_name = m.group(1)
        # some calls use _0x140671 or similar aliases
        arg = int(m.group(2), 16)
        idx = arg - 0x190
        
        # In the obfuscated code, there's `while(!![]) ... push(shift())`
        # Let's see the offset logic
        return m.group(0)

    # Actually, dynamic analysis via node is better for shift!
    node_script = """
    const fs = require('fs');
    let code = fs.readFileSync(process.argv[2], 'utf8');
    
    // We can evaluate the setup part (the IIFE that shifts the array and the getter function)
    let setupMatch = code.match(/const _0x140671=_0x4131;\\((function\\(_0x4b83fb,_0x2b4568\\)[\\s\\S]+?)\\(_0x5e55,0x[0-9a-f]+\\)\\);/);
    if (!setupMatch) {
       console.log("Setup not found");
       process.exit(1);
    }
    
    let arrMatch = code.match(/function _0x5e55\\(\\)\\{const _0x2858b2=(\\[[\\s\\S]+?\\]);/);
    if (!arrMatch) {
       console.log("Array not found");
       process.exit(1);
    }
    
    // Evaluate the array and the shift logic + getter
    let evalStr = `
        function _0x5e55() { return ${arrMatch[1]}; }
        function _0x4131(_0x33f7d6,_0x5ef107){_0x33f7d6=_0x33f7d6-0x190;const _0x5e553c=_0x5e55();return _0x5e553c[_0x33f7d6];}
        const _0x140671 = _0x4131;
        ${setupMatch[0]}
        
        // Expose a global mapping func
        global.getString = function(val) { return _0x140671(val); }
    `;
    
    eval(evalStr);
    
    // Now replace all _0x140671(0x...) or similar aliases
    // Find aliases
    let aliases = ['_0x140671', 'getString'];
    // In code there are \`const _0x1a7fed=_0x140671;\` etc
    let aliasRegex = /const ([_0-9a-zA-Z]+)=_0x140671[,;]/g;
    let match;
    while((match = aliasRegex.exec(code)) !== null) {
        aliases.push(match[1]);
    }
    
    // Replace calls
    for (let alias of aliases) {
        let callRegex = new RegExp(alias + '\\\\s*\\\\(\\\\s*(0x[0-9a-fA-F]+)\\\\s*\\\\)', 'g');
        code = code.replace(callRegex, (m, hexVal) => {
            let str = _0x140671(parseInt(hexVal, 16));
            return JSON.stringify(str); // quote it properly
        });
        
        // Also bracket access: obj[alias(0x...)] -> obj["..."]
        // The above replacement handles alias(0x...) directly
    }
    
    fs.writeFileSync('deobf_' + process.argv[2], code);
    console.log("Done");
    """
    
    with open('deobf.js', 'w', encoding='utf-8') as f:
        f.write(node_script)

deobfuscate(sys.argv[1])
