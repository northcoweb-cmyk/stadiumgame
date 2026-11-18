const { chromium } = require('playwright');
const fs = require('fs');
const THREE_JS = fs.readFileSync(__dirname + '/node_modules/three/build/three.min.js');
async function open(b, vp, extra = {}) {
  const p = await b.newPage({ viewport: vp, ...extra });
  p.errs = [];
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') p.errs.push(m.type() + ' ' + m.text()); });
  await p.route('**/three.min.js', r => r.fulfill({ body: THREE_JS, contentType: 'application/javascript' }));
  await p.goto('file:///home/user/stadiumgame/index.html');
  await p.waitForTimeout(4000);
  return p;
}
module.exports = { open };
if (require.main === module) (async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await open(b, { width: 1280, height: 760 });
  await p.screenshot({ path: 'shots/3d-menu.png' });
  console.log(p.errs.slice(0, 15).join('\n') || 'no errors');
  await b.close();
})();
