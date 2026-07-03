const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/);

if (!script) throw new Error('script missing');
new Function(script[1]);

for (const id of ['home', 'approvals', 'notices', 'settings', 'statusSheet', 'personalSheet', 'voiceSheet']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`missing ${id}`);
}

console.log('HTML structure: OK');
console.log('JavaScript syntax: OK');
console.log('Required boss screens: OK');
