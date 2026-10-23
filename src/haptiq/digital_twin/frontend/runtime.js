/* Explicit viewer lifecycle; consumers register once and never poll the DOM. */
(function (root) {
  let resolve,
    reject,
    registered = false;
  const ready = new Promise((success, failure) => {
    resolve = success;
    reject = failure;
  });
  root.HaptiqRuntime = {
    ready,
    registerViewer(viewer) {
      if (registered) throw Error('Viewer already registered');
      for (const name of ['history', 'estimate', 'twin'])
        if (!viewer[name]) throw Error('Missing viewer interface: ' + name);
      registered = true;
      resolve(Object.freeze(viewer));
    },
    fail(error) {
      reject(error);
    },
  };
})(globalThis);
