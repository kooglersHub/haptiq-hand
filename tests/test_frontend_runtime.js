const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../src/haptiq/digital_twin/frontend');
(async () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'runtime.js'), 'utf8'), context);
  const runtime = context.HaptiqRuntime;
  let started = false;
  const consumer = runtime.ready.then((viewer) => {
    started = true;
    assert.equal(viewer.history.name, 'history');
  });
  await Promise.resolve();
  assert.equal(started, false);
  runtime.registerViewer({ history: { name: 'history' }, estimate: {}, twin: {} });
  await consumer;
  assert.equal(started, true);
  assert.throws(() => runtime.registerViewer({}), /already registered/);
  const { create } = require(path.join(root, 'api_client.js'));
  const calls = [];
  const api = create({
    base: 'http://127.0.0.1:1234',
    fetch: async (...args) => {
      calls.push(args);
      return { ok: false, status: 409, json: async () => ({ error: 'Job running' }) };
    },
  });
  await assert.rejects(api.json('/api/identification'), /Job running/);
  assert.equal(calls[0][0], 'http://127.0.0.1:1234/api/identification');
  assert.throws(() => api.fetch('//external.invalid'), /local API path/);
  console.log('PASS explicit viewer lifecycle and API transport');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
