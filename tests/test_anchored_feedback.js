const assert = require('node:assert/strict'),
  fs = require('node:fs'),
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
const transform = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];
const fit = {
  transform,
  compatible: false,
  placement_usable: true,
  pose_evidence: 'known_placement_finite_cad',
  visible_surface_inlier_fraction: 0.74,
};
const rendered = context.module.exports.render({
  status: 'complete',
  result: { classification: 'AMBIGUOUS', fits: { SENSOR_B: fit } },
});
assert.ok(rendered.includes('Provisional placement'));
assert.ok(rendered.includes('74%'));
assert.ok(rendered.includes('unverified'));
assert.ok(!rendered.includes('Identified'));
fit.placement_usable = false;
assert.ok(
  context.module.exports
    .render({ status: 'complete', result: { fits: { SENSOR_B: fit } } })
    .includes('Rejected fit'),
);
fit.placement_usable = true;
fit.placement_quality = 'partial_contact_support';
fit.weak_contact_regions = ['thumb', 'palm'];
const partial = context.module.exports.render({
  status: 'complete',
  result: { fits: { SENSOR_B: fit } },
});
assert.ok(partial.includes('Partial placement'));
assert.ok(partial.includes('Poorly matched areas: thumb, palm'));
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
console.log(
  'PASS provisional placement, explicit coverage, rejected alternative and protocol revision',
);

const ambiguous = {
  classification: 'AMBIGUOUS',
  candidate_comparison: { missing_thumb_contacts: true },
  fits: { SENSOR_A: fit, SENSOR_B: fit },
};
const unresolved = context.module.exports.render({ status: 'complete', result: ambiguous });
assert.ok(unresolved.includes('Sensor size unresolved'));
assert.ok(unresolved.includes('No measured thumb contacts'));
assert.ok(!unresolved.includes('<h3>VEGABAR'));
const comparison = context.module.exports.render({ status: 'complete', result: ambiguous }, '', 0, {
  candidate: 'SENSOR_A',
});
assert.ok(comparison.includes('Comparison only'));
assert.ok(comparison.includes('VEGABAR 29'));
