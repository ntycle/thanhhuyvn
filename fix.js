const fs = require('fs');

function fixPage(file, scriptName) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(`import "./${scriptName}";\n`, '');
  
  const envInjection = `<script dangerouslySetInnerHTML={{ __html: \`window.ENV = {
      firebaseApiKey: '\\\${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}',
      authDomain: '\\\${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}',
      projectId: '\\\${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}',
      storageBucket: '\\\${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}',
      messagingSenderId: '\\\${process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID}',
      appId: '\\\${process.env.NEXT_PUBLIC_FIREBASE_APP_ID}'
    };\` }} />\n      <script type="module" src="/${scriptName}"></script>`;

  content = content.replace('return (\n', 'return (\n    <>\n      ' + envInjection + '\n');
  content = content.replace('  );\n}', '  </>\n  );\n}');
  fs.writeFileSync(file, content);
}

fixPage('app/page.js', 'user.js');
fixPage('app/admin/page.js', 'admin.js');
