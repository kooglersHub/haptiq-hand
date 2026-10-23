/* Candidate names and model lookup use the same catalog as Python. */
(function (root) {
  const catalog =
    typeof module !== 'undefined' && module.exports
      ? require('../../assets/models/catalog.json')
      : JSON.parse(document.getElementById('candidateCatalog').textContent);
  const find = (id) => catalog.find((candidate) => candidate.id === id);
  root.HaptiqCandidates = Object.freeze({
    all: () => catalog.map((candidate) => ({ ...candidate })),
    label: (id) => find(id)?.name || id,
    model: (models, id) =>
      models?.find((model) => model.candidate_id === id || model.id === find(id)?.viewer_id),
  });
  if (typeof module !== 'undefined') module.exports = root.HaptiqCandidates;
})(globalThis);
