/* ESTIMATE_FEEDBACK_COMPONENT */
/* Estimate feedback; formatters are pure so malformed/missing metrics are safe. */
(function (root) {
  'use strict';
  const escape = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const elapsed = (start, end) => {
    if (!Number.isFinite(start)) return '';
    const seconds = Math.max(0, Math.floor(end - start));
    return seconds < 60
      ? seconds + 's'
      : Math.floor(seconds / 60) + 'm ' + String(seconds % 60).padStart(2, '0') + 's';
  };
  const sensorName = (name, context = {}) =>
    root.HaptiqCandidates.model(context.models, name)?.name || root.HaptiqCandidates.label(name);
  // STL bounding-box center transformed into the observation frame (millimetres).
  function sensorPose(fit, model) {
    const t = fit?.transform,
      c = model?.source_center_mm;
    if (
      !Array.isArray(t) ||
      t.length !== 4 ||
      t.some((row) => !Array.isArray(row) || row.length !== 4 || !row.every(Number.isFinite)) ||
      !Array.isArray(c) ||
      c.length !== 3 ||
      !c.every(Number.isFinite)
    )
      return null;
    const center = t
      .slice(0, 3)
      .map((row) => row[3] + c.reduce((sum, v, k) => sum + row[k] * v, 0));
    // R = Rz(yaw) Ry(pitch) Rx(roll); choose roll=0 at gimbal lock.
    const horizontal = Math.hypot(t[0][0], t[1][0]),
      pitch = Math.atan2(-t[2][0], horizontal);
    const roll = horizontal > 1e-8 ? Math.atan2(t[2][1], t[2][2]) : 0;
    const yaw = horizontal > 1e-8 ? Math.atan2(t[1][0], t[0][0]) : Math.atan2(-t[0][1], t[1][1]);
    return {
      center,
      pitch: (pitch * 180) / Math.PI,
      yaw: (yaw * 180) / Math.PI,
      roll: (roll * 180) / Math.PI,
    };
  }
  function render(state, explanation = '', now = Date.now() / 1000, context = {}) {
    if (state.status === 'idle') return '';
    const result = state.result || {},
      fits = result.fits || {},
      running = state.status === 'running';
    const unresolved = !!result.candidate_comparison;
    const candidate = running
      ? state.progress?.candidate || state.first_guess?.candidate
      : context.candidate ||
        (!unresolved &&
          (result.placement_candidate ||
            result.best_candidate ||
            Object.keys(fits).find((name) => fits[name]?.compatible === true) ||
            Object.keys(fits)[0]));
    const model = root.HaptiqCandidates.model(context.models, candidate);
    const pose = sensorPose(fits[candidate], model);
    const currentStages = {
      screening_axial_roll: 'Checking shaft rotation (360°)',
      refining_known_placement: 'Refining usual placement',
      visible_surface_refining: 'Fitting contact surfaces',
      queued: 'Starting',
      loading_models: 'Loading sensors',
      preparing: 'Checking data',
      thumb_first_guess: 'Choosing sensor',
      standard_placement: 'Positioning',
      adjusting_angle: 'Adjusting angle',
      moving_to_thumb: 'Moving to thumb',
      palm_initialization: 'Positioning',
      alignment: 'Matching surfaces',
      refining: 'Refining position',
      checking_limits: 'Checking fit',
      candidate_checked: 'Fit checked',
      writing_report: 'Finishing',
    };
    const status = running
      ? currentStages[state.progress?.stage] || 'Estimating'
      : state.status === 'connection_error'
        ? 'Connection lost'
        : state.status === 'error'
          ? 'Estimate failed'
          : unresolved
            ? candidate
              ? 'Comparison only · size unresolved'
              : 'Sensor size unresolved'
            : !candidate
              ? 'No position found'
              : fits[candidate]?.placement_usable === true
                ? fits[candidate]?.placement_quality === 'partial_contact_support'
                  ? 'Partial placement'
                  : 'Provisional placement'
                : fits[candidate]?.compatible !== true
                  ? 'Rejected fit'
                  : result.classification === candidate
                    ? 'Identified'
                    : 'Provisional fit';
    const metric = (label, value, unit) =>
      '<div><dt>' +
      label +
      '</dt><dd>' +
      (Number.isFinite(value)
        ? escape((Math.abs(value) < 0.005 ? 0 : value).toFixed(2) + ' ' + unit)
        : '—') +
      '</dd></div>';
    return (
      '<h3>' +
      escape(candidate ? sensorName(candidate, context) : 'Sensor') +
      '</h3><p class="current-state" role="status">' +
      escape(status) +
      '</p><dl class="current-pose">' +
      ['X', 'Y', 'Z'].map((axis, k) => metric(axis, pose?.center[k], 'mm')).join('') +
      ['pitch', 'yaw', 'roll']
        .map((axis) => metric(axis[0].toUpperCase() + axis.slice(1), pose?.[axis], '°'))
        .join('') +
      '</dl>' +
      (Number.isFinite(fits[candidate]?.visible_surface_inlier_fraction)
        ? '<p class="fit-small">Contacts within tolerance: ' +
          Math.round(fits[candidate].visible_surface_inlier_fraction * 100) +
          '% of contacts. ' +
          (fits[candidate]?.pose_evidence === 'known_placement_finite_cad'
            ? 'Near usual insertion; open hand links and sampled collision coverage remain unverified.'
            : 'Inspection preview.') +
          '</p>'
        : '') +
      (fits[candidate]?.weak_contact_regions?.length
        ? '<p class="fit-small">Poorly matched areas: ' +
          escape(fits[candidate].weak_contact_regions.join(', ')) +
          '.</p>'
        : '') +
      (unresolved
        ? '<p class="fit-small">Both sensor sizes fit the contacts similarly. ' +
          (result.candidate_comparison.missing_thumb_contacts
            ? 'No measured thumb contacts distinguish the head size. '
            : '') +
          'Choose a fitted candidate to compare; no sensor selected automatically.</p>'
        : '') +
      (state.status === 'connection_error' ? '<button id="retryEstimateStatus">Retry</button>' : '')
    );
  }
  root.EstimateFeedback = { render, elapsed, sensorPose };
  if (typeof module !== 'undefined') module.exports = root.EstimateFeedback;
})(typeof globalThis === 'undefined' ? this : globalThis);
