const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm');
const source = fs.readFileSync(
  path.join(__dirname, '../src/haptiq/digital_twin/frontend/estimate_feedback.js'),
  'utf8',
);
const context = {
  module: { exports: {} },
  Date,
  HaptiqCandidates: require('../src/haptiq/digital_twin/frontend/candidates.js'),
};
vm.runInNewContext(source, context);
const { render, elapsed } = context.module.exports;
assert.equal(elapsed(10, 71), '1m 01s');
const running = render({
  status: 'running',
  progress: { stage: 'alignment', candidate: 'SENSOR_A' },
});
assert.ok(running.includes('VEGABAR 29'));
assert.ok(running.includes('Matching surfaces'));
const transform = [
  [1, 0, 0, 10],
  [0, 1, 0, 20],
  [0, 0, 1, 30],
  [0, 0, 0, 1],
];
for (const [compatible, status] of [
  [false, 'Rejected fit'],
  [true, 'Provisional fit'],
]) {
  const html = render(
    { status: 'complete', result: { fits: { SENSOR_A: { compatible, transform } } } },
    '',
    0,
    { models: [{ name: '<bad>', candidate_id: 'SENSOR_A', source_center_mm: [0, 0, 0] }] },
  );
  assert.ok(html.includes(status));
  assert.ok(html.includes('10.00 mm'));
  assert.ok(html.includes('30.00 mm'));
  assert.ok(html.includes('&lt;bad&gt;'));
  assert.ok(!html.includes('<bad>'));
}
assert.ok(render({ status: 'connection_error' }).includes('Retry'));
assert.ok(render({ status: 'complete', result: { fits: {} } }).includes('No position found'));
assert.doesNotThrow(() => render({ status: 'complete', result: { fits: { SENSOR_A: {} } } }));
console.log(
  'PASS compact status, pose values, provisional/rejected distinction, escaping and retry',
);
const appSource = fs.readFileSync(
  path.join(__dirname, '../src/haptiq/digital_twin/frontend/application.js'),
  'utf8',
);
assert.equal(
  [
    ...appSource.matchAll(
      /(?:state|backend)\.estimator_revision\s*!==\s*appConfig\.estimator_revision/g,
    ),
  ].length,
  2,
);
assert(!appSource.includes('small_sensor_axial_start_v'));
console.log('PASS frontend estimator checks match backend revision');
