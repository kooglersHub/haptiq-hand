/* Native Node unit suites; browser integrations run separately. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const suites = fs
  .readdirSync(path.join(root, 'tests'))
  .filter((file) => /^test_.*\.js$/.test(file) && !file.includes('_browser'))
  .sort();

let failures = 0;
for (const suite of suites) {
  const result = spawnSync(process.execPath, [path.join(root, 'tests', suite)], {
    cwd: root,
    stdio: 'inherit',
    timeout: 90000,
  });
  if (result.status !== 0) {
    failures += 1;
    console.error(`FAIL ${suite}: ${result.error?.message || result.signal || result.status}`);
  }
}
console.log(`${suites.length} Node unit suites, ${failures} failures`);
process.exitCode = failures ? 1 : 0;
