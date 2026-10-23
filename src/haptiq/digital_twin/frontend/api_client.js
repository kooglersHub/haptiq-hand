/* Local HTTP transport shared by application controllers. */
(function (root) {
  function create({ base, fetch: transport } = {}) {
    base = base || (location.protocol === 'file:' ? 'http://127.0.0.1:18765' : location.origin);
    transport = transport || root.fetch.bind(root);
    return Object.freeze({
      base,
      fetch(path, options = {}) {
        if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//'))
          throw Error('Expected a local API path');
        return transport(base + path, { signal: AbortSignal.timeout(10000), ...options });
      },
      async json(path, options = {}) {
        const response = await this.fetch(path, options);
        const data = await response.json();
        if (!response.ok) throw Error(data.error || 'Request failed (' + response.status + ')');
        return data;
      },
    });
  }
  root.HaptiqApi = { create };
  if (typeof module !== 'undefined') module.exports = root.HaptiqApi;
})(globalThis);
