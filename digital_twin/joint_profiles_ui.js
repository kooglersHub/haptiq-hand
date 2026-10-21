/* Read-only live motion, saved captures and fitting overlays. */
(function profileExtension() {
  'use strict';
  const K = JointKinematics,
    P = JointPressure,
    T = TactilePoints,
    $ = (id) => document.getElementById(id),
    data = JSON.parse($('jointProfileData').textContent),
    id = 'rh56_tactile_toolkit_left',
    profile = data.reference.primary_profiles[id],
    geometry = data.tactile_geometry;
  let replay = null;
  let calibration = K.defaults(profile),
    live = false,
    packet = null,
    disconnected = false,
    demo = false,
    raw = Array(6).fill(1000),
    view = null,
    manualQueued = false;
  // Preserve previously saved Toolkit geometry without exposing editing controls.
  try {
    const saved = JSON.parse(
      localStorage.getItem('rh56-joint-calibration:' + data.reference_sha256) || 'null',
    );
    if (saved?.reference_sha256 === data.reference_sha256 && saved.profiles?.[id])
      calibration = K.clone(K.validateCalibration(profile, saved.profiles[id]));
  } catch {}
  calibration.enable_candidate_live = true;
  const assets = data.assets[id],
    traces = assets.map((a) => {
      const n = a.vertices.length / 3;
      return {
        type: 'mesh3d',
        color: a.sensor ? '#263846' : '#a4b6ca',
        x: Array(n).fill(0),
        y: Array(n).fill(0),
        z: Array(n).fill(0),
        i: a.indices.filter((_, i) => i % 3 === 0),
        j: a.indices.filter((_, i) => i % 3 === 1),
        k: a.indices.filter((_, i) => i % 3 === 2),
      };
    });
  const pointIndex = traces.length,
    centroidIndex = pointIndex + 1;
  const objectStart = centroidIndex + 1,
    objectEnd = objectStart + data.sensor_objects.length;
  let inactiveIndex = -1,
    boundaryIndex = -1,
    coordinateIndices = [];
  let estimateIndices = [],
    estimatePointIndex = -1,
    estimateActive = false;
  const boundaryData = JSON.parse($('handBoundaryData').textContent);
  traces.push(
    {
      name: 'Taxels',
      type: 'scatter3d',
      mode: 'markers',
      x: [],
      y: [],
      z: [],
      marker: { size: 3.4, rgb: [] },
    },
    {
      name: 'Contact centres',
      type: 'scatter3d',
      mode: 'markers',
      color: '#247dff',
      x: [],
      y: [],
      z: [],
      marker: { size: 8, rgb: [] },
    },
  );
  function meshPoints(a, solution) {
    const m = K.mul(solution.frames[a.link], K.rigid(a.origin_xyz_m, a.origin_rpy_rad)),
      out = [];
    for (let i = 0; i < a.vertices.length; i += 3)
      out.push(
        K.point(
          m,
          a.vertices.slice(i, i + 3).map((v, k) => v * a.scale[k]),
        ),
      );
    return out;
  }
  const displayRotation = K.rigid([0, 0, 0], [0, -Math.PI / 2, 0]),
    bounds = [
      [Infinity, Infinity, Infinity],
      [-Infinity, -Infinity, -Infinity],
    ],
    open = K.solve(profile, Array(6).fill(1000), K.defaults(profile));
  for (const a of assets)
    for (const p of meshPoints(a, open)) {
      const q = K.point(displayRotation, p);
      q.forEach((x, i) => {
        bounds[0][i] = Math.min(bounds[0][i], x);
        bounds[1][i] = Math.max(bounds[1][i], x);
      });
    }
  const center = bounds[0].map((x, i) => (x + bounds[1][i]) / 2);
  const meshOrigins = assets.map((a) => K.rigid(a.origin_xyz_m, a.origin_rpy_rad)),
    meshFrames = [];
  function updateMeshes(solution) {
    const changed = [];
    assets.forEach((a, index) => {
      const frame = solution.frames[a.link],
        old = meshFrames[index];
      if (old && frame.every((v, k) => Math.abs(v - old[k]) < 1e-12)) return;
      meshFrames[index] = frame.slice();
      changed.push(index);
      const m = K.mul(displayRotation, K.mul(frame, meshOrigins[index])),
        v = a.vertices,
        t = traces[index],
        scale = a.scale;
      for (let j = 0, i = 0; i < v.length; i += 3, j++) {
        const x = v[i] * scale[0],
          y = v[i + 1] * scale[1],
          z = v[i + 2] * scale[2];
        t.x[j] = (m[0] * x + m[1] * y + m[2] * z + m[3] - center[0]) * 1000;
        t.y[j] = (m[4] * x + m[5] * y + m[6] * z + m[7] - center[1]) * 1000 + 15;
        t.z[j] = (m[8] * x + m[9] * y + m[10] * z + m[11] - center[2]) * 1000 + 130;
      }
    });
    return changed;
  }
  function pose(values) {
    view.solution = K.solve(profile, values, calibration);
    view.raw = values.slice();
    return updateMeshes(view.solution);
  }
  let pressures = P.sample(null, false),
    signature = null,
    overlaySignature = null,
    renderedCells = [],
    lastInput = null,
    taxelPositions = [],
    poseSignature = null,
    positionSignature = null,
    publishedSignature = null,
    publishing = false,
    lastPublished = 0;
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  function present(point) {
    return K.point(displayRotation, point).map((x, i) => (x - center[i]) * 1000 + [0, 15, 130][i]);
  }
  function currentCloud() {
    if (replay) return K.clone(replay.entry.cloud);
    return T.cloud(
      geometry,
      view.solution,
      P.sample(lastInput, demo || (live && !disconnected)),
      lastInput,
      demo || (live && !disconnected),
      $('activationThreshold').value,
      calibration,
    );
  }
  function overlay(input) {
    renderedCells = T.cells(geometry, view.solution, pressures, $('activationThreshold').value);
    // Reuse the actual model cells. Export base-link metres, before camera/lift transforms.
    if (poseSignature !== signature) {
      const fromWorld = T.inverseRigid(view.solution.frames.left_base_link);
      taxelPositions = renderedCells.map((cell) => {
        const [x, y, z] = K.point(fromWorld, cell.position_world_m);
        return {
          id: cell.id,
          x,
          y,
          z,
          pressure: cell.value,
          normal: T.direction(fromWorld, cell.normal_world),
        };
      });
      poseSignature = signature;
    } else
      renderedCells.forEach((cell, i) => {
        taxelPositions[i].pressure = cell.value;
      });
    positionSignature = overlaySignature;
    renderBoundaries();
    const dots = traces[pointIndex],
      centres = traces[centroidIndex];
    dots.x = [];
    dots.y = [];
    dots.z = [];
    dots.marker.rgb = [];
    centres.x = [];
    centres.y = [];
    centres.z = [];
    centres.marker.rgb = [];
    for (const cell of renderedCells) {
      const p = present(cell.position_world_m.map((v, i) => v + 0.00035 * cell.normal_world[i]));
      ['x', 'y', 'z'].forEach((axis, i) => dots[axis].push(p[i]));
      dots.marker.rgb.push(rgb(cell.active ? '#ff766b' : '#8dd3ee'));
    }
    const cloud = currentCloud();
    if ($('showContactCentres').checked)
      for (const c of cloud.centroids) {
        const p = present(
          K.point(
            view.solution.frames.left_base_link,
            c.position_m.map((v, i) => v + 0.0008 * c.normal[i]),
          ),
        );
        ['x', 'y', 'z'].forEach((axis, i) => centres[axis].push(p[i]));
        centres.marker.rgb.push(rgb('#247dff'));
      }
    $('contactSummary').textContent = cloud.valid
      ? cloud.points.length + ' activated points · ' + cloud.centroids.length + ' contact centres'
      : 'Contact export awaits fresh, synchronized angles and pressure';
  }
  function update() {
    if (!view || replay) return;
    const desired = live
      ? !disconnected && K.freshActual(packet)
        ? packet.angles_act
        : view.raw
      : raw;
    const next = JSON.stringify(desired),
      moved = next !== signature;
    let meshChanged = [];
    if (moved) {
      signature = next;
      meshChanged = pose(desired);
    }
    lastInput = demo
      ? {
          ...P.demo(performance.now() / 1000),
          angles_act: view.raw.slice(),
          received_at: Date.now() / 1000,
          field_received_at: { angles_act: Date.now() / 1000, tactile_regions: Date.now() / 1000 },
        }
      : packet;
    pressures = P.sample(lastInput, demo || (live && !disconnected));
    const nextOverlay = JSON.stringify([
      desired,
      Object.values(pressures).map((p) => p.values),
      $('activationThreshold').value,
      $('showContactCentres').checked,
      T.synchronized(lastInput, Date.now() / 1000),
      live,
      disconnected,
      demo,
    ]);
    const overlayChanged = nextOverlay !== overlaySignature;
    if (overlayChanged) {
      overlaySignature = nextOverlay;
      overlay(lastInput);
    }
    if (view.ready && (moved || overlayChanged)) {
      const indices = [...meshChanged, pointIndex, centroidIndex, boundaryIndex];
      HandRenderer.restyle(
        view.plot,
        {
          x: indices.map((i) => traces[i].x),
          y: indices.map((i) => traces[i].y),
          z: indices.map((i) => traces[i].z),
        },
        indices,
      );
    }
    const valid = Object.values(pressures).filter((p) => p.peak !== null).length;
    $('pressureStatus').textContent =
      (demo ? 'Demo pressure · ' : live ? 'Live pressure · ' : 'Preview · ') +
      valid +
      '/17 fields · ' +
      renderedCells.filter((c) => c.value !== null).length +
      '/1,062 readings';
    for (const r of P.regions) {
      const p = pressures[r.key],
        el = $('pressure_' + r.key);
      el.textContent = r.key.replaceAll('_', ' ') + ': ' + (p.peak === null ? '—' : p.peak);
      el.style.borderLeftColor = p.color;
    }
    $('profileStatus0').textContent = demo
      ? 'Demo · simulated motion and pressure'
      : !live
        ? 'Manual preview'
        : disconnected
          ? 'Disconnected · pose held'
          : !K.freshActual(packet)
            ? 'Waiting for fresh actual angles · pose held'
            : (packet.simulated ? 'Simulation' : 'Live hand') + ' · actual angles and pressure';
    $('profileAngles0').textContent = view.solution.warnings.join('\n');
  }
  window.ProfileTwin = {
    manual(values) {
      if (!live) {
        raw = values.slice();
        if (!manualQueued) {
          manualQueued = true;
          requestAnimationFrame(() => {
            manualQueued = false;
            update();
          });
        }
      }
    },
    mode(enabled, values) {
      leaveSaved();
      live = enabled;
      demo = false;
      disconnected = false;
      if (!enabled) {
        packet = null;
        raw = values.slice();
      }
      update();
    },
    demo(enabled) {
      demo = enabled;
      update();
    },
    receive(msg) {
      packet = K.clone(msg);
      disconnected = false;
      if (live) update();
    },
    disconnect() {
      disconnected = true;
      update();
    },
    tick: update,
    snapshot() {
      return {
        replay: replay ? { name: replay.entry.name, mode: replay.mode } : null,
        live,
        demo,
        pressure: K.clone(pressures),
        taxels: K.clone(renderedCells),
        models: view
          ? {
              [id]: {
                raw: view.raw.slice(),
                q: K.clone(view.solution.q),
                frames: K.clone(view.solution.frames),
              },
            }
          : {},
      };
    },
  };
  window.getContactCloud = () => currentCloud();
  window.getContactPoints = () => currentCloud().points;
  function handBoundaries() {
    if (replay && !replay.entry.handAvailable) return [];
    return HandBoundaries.transform(boundaryData, view.solution, K, T);
  }
  function renderBoundaries() {
    if (boundaryIndex < 0) return;
    const trace = traces[boundaryIndex];
    trace.x = [];
    trace.y = [];
    trace.z = [];
    trace.marker.rgb = [];
    for (const p of handBoundaries()) {
      const q = present(
        K.point(
          view.solution.frames.left_base_link,
          [p.x, p.y, p.z].map((v, i) => v + 0.00045 * p.normal[i]),
        ),
      );
      ['x', 'y', 'z'].forEach((axis, i) => trace[axis].push(q[i]));
      trace.marker.rgb.push(rgb('#b88aff'));
    }
    trace.visible = $('showHandBoundaries').checked;
  }
  window.getHandBoundaryPoints = () => handBoundaries();
  window.getTaxelPositions = () => (replay ? [] : taxelPositions.map((point) => ({ ...point })));
  // A single in-flight request; latest displayed pose wins. Refresh held poses once/second.
  async function shareTaxels() {
    if (
      replay ||
      publishing ||
      !taxelPositions.length ||
      (publishedSignature === positionSignature && performance.now() - lastPublished < 1000)
    )
      return;
    const sentSignature = positionSignature,
      root = $('bridgeUrl').value.trim().replace(/\/$/, '');
    publishing = true;
    try {
      const response = await fetch(root + '/api/taxels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taxelPositions),
        signal: AbortSignal.timeout(1250),
      });
      if (response.ok) {
        publishedSignature = sentSignature;
        lastPublished = performance.now();
      }
    } catch {
    } finally {
      publishing = false;
    }
  }
  setInterval(shareTaxels, 200);
  $('showHandBoundaries').onchange = () => {
    renderBoundaries();
    if (view.ready)
      HandRenderer.restyle(
        view.plot,
        {
          x: [traces[boundaryIndex].x],
          y: [traces[boundaryIndex].y],
          z: [traces[boundaryIndex].z],
          visible: [traces[boundaryIndex].visible],
        },
        [boundaryIndex],
      );
  };
  $('activationThreshold').oninput = update;
  $('showContactCentres').onchange = () => (replay ? renderSaved() : update());
  $('exportContactCloud').onclick = () => {
    const cloud = currentCloud(),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(cloud, null, 2)], { type: 'application/json' }),
      ),
      a = document.createElement('a');
    a.href = url;
    a.download = 'hand_contact_cloud.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  function fit() {
    const low = [Infinity, Infinity, Infinity],
      high = [-Infinity, -Infinity, -Infinity];
    for (const trace of traces) {
      if (trace.visible === false) continue;
      for (let i = 0; i < trace.x.length; i++)
        for (let k = 0; k < 3; k++) {
          const value = trace[['x', 'y', 'z'][k]][i];
          low[k] = Math.min(low[k], value);
          high[k] = Math.max(high[k], value);
        }
    }
    if (!Number.isFinite(low[0])) return;
    const target = low.map((v, k) => (v + high[k]) / 2),
      distance = Math.max(
        replay?.mode === 'cloud' ? 80 : 440,
        (0.55 * Math.hypot(...high.map((v, k) => v - low[k]))) / Math.sin(Math.PI / 7.5),
      );
    view?.plot._renderer?.focus(target, [0.2, -1, 0.25], distance);
  }
  // Saved files are isolated from live sampling, taxel sharing, and browser calibration.
  let handModelVisible = true;
  const savedEntries = [];
  function savedControls(active) {
    for (const key of [
      'activationThreshold',
      'quickOpen',
      'quickClose',
      'animateDemo',
      'openAll',
      'closeAll',
      ...Array.from({ length: 6 }, (_, i) => 's' + i),
      ...Array.from({ length: 6 }, (_, i) => 'n' + i),
    ]) {
      if ($(key))
        $(key).disabled =
          active ||
          ((key[0] === 's' || key[0] === 'n' || key === 'openAll' || key === 'closeAll') && live);
    }
    $('sensorObjectsPanel').hidden = active;
    $('savedReturn').hidden = !active;
  }
  function savedVisibility() {
    traces[pointIndex].xray = true;
    traces[centroidIndex].xray = !!replay;
    traces.forEach((trace, i) => {
      if (estimateIndices.includes(i) || i === estimatePointIndex) {
        if (!estimateActive) trace.visible = false;
      } else if (i === boundaryIndex)
        trace.visible = $('showHandBoundaries').checked && (!replay || replay.entry.handAvailable);
      else if (i === inactiveIndex) trace.visible = !!replay && replay.entry.handAvailable;
      else if (coordinateIndices.includes(i))
        trace.visible = !!replay && $('showSavedAxes').checked;
      else if (i >= objectStart && i < objectEnd)
        trace.visible = !replay && objects.snapshot()[i - objectStart].visible;
      else trace.visible = i < pointIndex ? handModelVisible : true;
    });
  }
  function otherTaxels(entry) {
    if (!entry.solution) return [];
    if (!entry.otherTaxels) {
      const active = new Set(entry.cloud.points.map((p) => p.id)),
        baseInverse = T.inverseRigid(entry.solution.frames.left_base_link);
      entry.otherTaxels = T.cells(geometry, entry.solution, {}, entry.cloud.threshold)
        .filter((cell) => !active.has(cell.id))
        .map((cell) => ({
          id: cell.id,
          position_m: K.point(baseInverse, cell.position_world_m),
          pressure: null,
        }));
    }
    return entry.otherTaxels;
  }
  function coordinateFrame(append) {
    const length = 0.04,
      head = 0.004,
      wing = 0.0025,
      colors = ['#ff595e', '#49d17d', '#58a6ff'];
    coordinateIndices.forEach((index, axis) => {
      const trace = traces[index];
      trace.x = [];
      trace.y = [];
      trace.z = [];
      trace.marker.rgb = [];
      const origin = [0, 0, 0],
        end = origin.slice();
      end[axis] = length;
      const segment = (a, b) => {
        append(trace, a, colors[axis]);
        append(trace, b, colors[axis]);
      };
      segment(origin, end);
      for (const perpendicular of [0, 1, 2].filter((k) => k !== axis))
        for (const sign of [-1, 1]) {
          const tip = end.slice();
          tip[axis] -= head;
          tip[perpendicular] = sign * wing;
          segment(end, tip);
        }
    });
  }
  function renderSaved() {
    if (!replay || !view) return;
    const { entry, mode } = replay,
      cloud = entry.cloud;
    let meshChanged = [];
    if (entry.solution) {
      view.solution = entry.solution;
      view.raw = cloud.angles_act.slice();
      meshChanged = updateMeshes(view.solution);
    } else {
      view.solution = K.solve(profile, Array(6).fill(1000), K.defaults(profile));
      view.raw = Array(6).fill(1000);
    }
    renderBoundaries();
    savedVisibility();
    const base = view.solution.frames.left_base_link,
      dots = traces[pointIndex],
      centres = traces[centroidIndex];
    for (const trace of [dots, centres]) {
      trace.x = [];
      trace.y = [];
      trace.z = [];
      trace.marker.rgb = [];
    }
    const append = (trace, p, color) => {
      const q = present(K.point(base, p));
      ['x', 'y', 'z'].forEach((axis, i) => trace[axis].push(q[i]));
      trace.marker.rgb.push(rgb(color));
    };
    for (const point of cloud.points) append(dots, point.position_m, '#ff766b');
    const others = otherTaxels(entry),
      inactive = traces[inactiveIndex];
    inactive.x = [];
    inactive.y = [];
    inactive.z = [];
    inactive.marker.rgb = [];
    for (const point of others) append(inactive, point.position_m, '#8dd3ee');
    coordinateFrame(append);
    $('showOtherTaxels').disabled = mode !== 'cloud' || !entry.handAvailable;
    $('showSavedAxes').disabled = false;
    $('otherTaxelInfo').textContent = entry.handAvailable
      ? cloud.points.length +
        ' stored active points + ' +
        others.length +
        ' other taxels. Gray positions are reconstructed; their pressure was not stored.'
      : 'Other taxels cannot be reconstructed: ' + entry.handReason;
    if ($('showContactCentres').checked)
      for (const c of cloud.centroids || []) append(centres, c.position_m, '#247dff');
    renderedCells = cloud.points.map((p) => ({
      ...p,
      value: p.value,
      position_world_m: K.point(base, p.position_m),
    }));
    pressures = P.sample(null, false);
    if (view.ready) {
      const indices = [
        ...meshChanged,
        pointIndex,
        centroidIndex,
        inactiveIndex,
        boundaryIndex,
        ...coordinateIndices,
      ];
      HandRenderer.restyle(
        view.plot,
        {
          x: indices.map((i) => traces[i].x),
          y: indices.map((i) => traces[i].y),
          z: indices.map((i) => traces[i].z),
          visible: indices.map((i) => traces[i].visible),
        },
        indices,
      );
    }
    $('savedHand').classList.toggle('active', mode === 'hand');
    $('savedCloud').classList.toggle('active', mode === 'cloud');
    $('savedHand').disabled = !entry.handAvailable;
    $('savedCloud').disabled = false;
    const date =
      typeof cloud.received_at === 'number' && Number.isFinite(cloud.received_at)
        ? new Date(cloud.received_at * 1000).toLocaleString()
        : 'Unknown capture time';
    $('savedInfo').textContent =
      entry.name +
      ' · ' +
      date +
      ' · ' +
      cloud.points.length +
      ' saved contacts · threshold ' +
      cloud.threshold +
      (cloud.simulated ? ' · simulated' : '') +
      (entry.handReason ? ' · ' + entry.handReason : '');
    $('profileStatus0').textContent =
      'Saved capture · ' + (mode === 'hand' ? 'hand + contacts' : 'point cloud only');
    $('liveStatus').textContent = 'Viewing saved capture · live updates paused';
    $('statusDot').className = 'dot';
    $('dataSource').textContent = 'Data source: saved JSON · ' + entry.name;
    $('pressureHeading').textContent = 'Saved capture · Pressure';
    $('pressureStatus').textContent =
      'Saved contact values only · ' + cloud.points.length + ' points';
    $('contactSummary').textContent =
      cloud.points.length + ' stored points · positions preserved from JSON';
    $('profileAngles0').textContent =
      entry.handReason || 'Saved angles and calibration · ' + cloud.angles_act.join(' / ');
    for (const r of P.regions) {
      const values = cloud.points.filter((p) => p.region === r.key).map((p) => p.value),
        el = $('pressure_' + r.key);
      el.textContent =
        r.key.replaceAll('_', ' ') +
        ': ' +
        (values.length
          ? Math.max(...values) + ' peak (' + values.length + ' saved contacts)'
          : 'not stored');
      el.style.borderLeftColor = values.length ? P.color(Math.max(...values)) : P.missing;
    }
  }
  function openSaved(entry, mode, options = {}) {
    if (!entry) return;
    if (!replay) $('modeManual').click();
    replay = { entry, mode: mode === 'hand' && entry.handAvailable ? 'hand' : 'cloud' };
    savedControls(true);
    $('modeManual').classList.remove('active');
    $('modeLive').classList.remove('active');
    renderSaved();
    if (!options.preserveCamera) fit();
  }
  function leaveSaved() {
    window.HandEstimate?.clear();
    if (!replay) return;
    replay = null;
    $('showOtherTaxels').disabled = true;
    $('showSavedAxes').disabled = true;
    $('pressureHeading').textContent = 'Live hand · Pressure';
    signature = null;
    overlaySignature = null;
    poseSignature = null;
    savedControls(false);
    savedVisibility();
    if (view.ready)
      HandRenderer.restyle(
        view.plot,
        { visible: traces.map((t) => t.visible) },
        traces.map((_, i) => i),
      );
    $('savedHand').classList.remove('active');
    $('savedCloud').classList.remove('active');
    $('savedInfo').textContent = 'Saved captures remain in the list. Select one to view it again.';
  }
  window.HandHistory = {
    isReplaying() {
      return !!replay;
    },
    setPose(values) {
      if (!replay) throw Error('Load history before changing its pose.');
      if (values.every((v, k) => v === view.raw[k])) return;
      const changed = pose(values);
      replay.entry.solution = view.solution;
      replay.entry.cloud.angles_act = values.slice();
      replay.entry.cloud.joint_angles_rad = { ...view.solution.q };
      if (view.ready && changed.length)
        HandRenderer.restyle(
          view.plot,
          {
            x: changed.map((i) => traces[i].x),
            y: changed.map((i) => traces[i].y),
            z: changed.map((i) => traces[i].z),
          },
          changed,
        );
    },

    setHandVisible(visible) {
      handModelVisible = !!visible;
      for (let i = 0; i < pointIndex; i++) traces[i].visible = handModelVisible;
      if (view.ready)
        HandRenderer.restyle(
          view.plot,
          { visible: traces.map((t) => t.visible) },
          traces.map((_, i) => i),
        );
    },
    runOverlay(frame, showLimits = true, showAxes = true) {
      const base = view.solution.frames.left_base_link;
      const set = (index, points, color) => {
        const trace = traces[index];
        trace.x = [];
        trace.y = [];
        trace.z = [];
        trace.marker.rgb = [];
        for (const p of points) {
          const q = present(K.point(base, [p.x, p.y, p.z]));
          ['x', 'y', 'z'].forEach((axis, k) => trace[axis].push(q[k]));
          trace.marker.rgb.push(rgb(typeof color === 'function' ? color(p) : color));
        }
        trace.visible = true;
        trace.xray = true;
      };
      set(pointIndex, frame.points, '#ff766b');
      const limits = frame.display_boundary_points || frame.boundary_points || [];
      set(
        inactiveIndex,
        showLimits ? limits.filter((p) => p.kind !== 'hand_boundary') : [],
        '#8dd3ee',
      );
      set(
        boundaryIndex,
        showLimits ? limits.filter((p) => p.kind === 'hand_boundary') : [],
        '#b88aff',
      );
      traces[centroidIndex].visible = false;
      const append = (trace, p, color) => {
        const q = present(K.point(base, p));
        ['x', 'y', 'z'].forEach((axis, k) => trace[axis].push(q[k]));
        trace.marker.rgb.push(rgb(color));
      };
      coordinateFrame(append);
      for (const i of coordinateIndices) traces[i].visible = showAxes;
      for (let i = 0; i < pointIndex; i++) traces[i].visible = handModelVisible;
      const indices = [
        pointIndex,
        inactiveIndex,
        boundaryIndex,
        centroidIndex,
        ...coordinateIndices,
      ];
      if (view.ready)
        HandRenderer.restyle(
          view.plot,
          {
            x: indices.map((i) => traces[i].x),
            y: indices.map((i) => traces[i].y),
            z: indices.map((i) => traces[i].z),
            visible: indices.map((i) => traces[i].visible),
          },
          indices,
        );
    },
    context() {
      return K.clone({ id, profile, geometry, calibration, boundaries: boundaryData });
    },
    show(payload, name, options = {}) {
      const entry = SavedContacts.prepare(payload, {
        id,
        profile,
        referenceHash: data.reference_sha256,
        geometryHash: geometry.geometry_sha256,
      });
      if (entry.cloud.identification_points !== undefined) {
        const points = entry.cloud.identification_points,
          seen = new Set(),
          allowed = new Set(
            geometry.regions.flatMap((r) => r.cells.map((c) => r.key + ':' + c.wire_index)),
          );
        if (!Array.isArray(points) || points.length > 1062)
          throw Error('Invalid full-cell history measurements.');
        for (const p of points) {
          if (
            !p ||
            !allowed.has(p.id) ||
            seen.has(p.id) ||
            !['x', 'y', 'z'].every(
              (k) => typeof p[k] === 'number' && Number.isFinite(p[k]) && Math.abs(p[k]) <= 10,
            ) ||
            (p.pressure !== null &&
              (typeof p.pressure !== 'number' ||
                !Number.isFinite(p.pressure) ||
                p.pressure < 0 ||
                p.pressure > 4095))
          )
            throw Error('Invalid full-cell history measurements.');
          seen.add(p.id);
        }
      }
      entry.name = name;
      entry.onePage = true;
      const previous = savedEntries.findIndex((e) => e.onePage);
      if (previous >= 0) savedEntries[previous] = entry;
      else savedEntries.push(entry);
      $('savedSelect').replaceChildren(
        ...savedEntries.map((e, i) => {
          const option = document.createElement('option');
          option.value = i;
          option.textContent = e.name;
          return option;
        }),
      );
      $('savedSelect').disabled = false;
      $('savedSelect').value = savedEntries.indexOf(entry);
      openSaved(entry, 'hand', options);
    },
    telemetry(row, name, options = {}) {
      const solution = K.solve(profile, row.angles_act, calibration),
        now = Date.now() / 1000;
      const input = {
        angles_act: row.angles_act,
        tactile_regions: row.tactile_regions,
        simulated: false,
        received_at: now,
        field_received_at: { angles_act: now, tactile_regions: now },
      };
      const samples = P.sample(input, true, now),
        cloud = T.cloud(
          geometry,
          solution,
          samples,
          input,
          true,
          $('activationThreshold').value,
          calibration,
          now,
        );
      const fromWorld = T.inverseRigid(solution.frames.left_base_link);
      cloud.identification_points = T.cells(geometry, solution, samples, cloud.threshold).map(
        (cell) => {
          const [x, y, z] = K.point(fromWorld, cell.position_world_m);
          return {
            id: cell.id,
            x,
            y,
            z,
            pressure: cell.value,
            normal: T.direction(fromWorld, cell.normal_world),
          };
        },
      );
      cloud.valid = true;
      cloud.pose_only = cloud.valid_cells === 0;
      cloud.angles_act = row.angles_act.slice();
      cloud.joint_angles_rad = { ...solution.q };
      cloud.received_at = null;
      cloud.field_received_at = {};
      cloud.timestamp_basis = 'CSV row; hardware capture timestamp unavailable';
      cloud.history_source = 'csv';
      cloud.history_index = row.index;
      cloud.history_state = row.state;
      cloud.pressure_basis =
        'Recorded CSV counts; pressure offsets and failed-read validity are not supplied';
      this.show(cloud, name, options);
    },
    points() {
      if (!replay) return taxelPositions.map((p) => ({ ...p }));
      const entry = replay.entry,
        cloud = entry.cloud;
      const fromSaved = entry.handAvailable
        ? T.inverseRigid(entry.solution.frames.left_base_link)
        : null;
      const normalMap = new Map(
        entry.handAvailable
          ? T.cells(geometry, entry.solution, {}, cloud.threshold).map((c) => [
              c.id,
              T.direction(fromSaved, c.normal_world),
            ])
          : [],
      );
      if (Array.isArray(cloud.identification_points))
        return cloud.identification_points.map((p) => ({ ...p, normal: normalMap.get(p.id) }));
      const known = new Map(cloud.points.map((p) => [p.id, p]));
      if (!entry.handAvailable)
        return cloud.points.map((p) => ({
          id: p.id,
          x: p.position_m[0],
          y: p.position_m[1],
          z: p.position_m[2],
          pressure: p.value,
        }));
      const fromWorld = T.inverseRigid(entry.solution.frames.left_base_link);
      return T.cells(geometry, entry.solution, {}, cloud.threshold).map((cell) => {
        const point = known.get(cell.id),
          [x, y, z] = point ? point.position_m : K.point(fromWorld, cell.position_world_m);
        return {
          id: cell.id,
          x,
          y,
          z,
          pressure: point ? point.value : null,
          normal: T.direction(fromWorld, cell.normal_world),
        };
      });
    },
  };
  $('savedFiles').onchange = async (event) => {
    const errors = [];
    let last = null;
    for (const file of event.target.files) {
      try {
        if (file.size > 5 * 1024 * 1024) throw Error('File exceeds 5 MB.');
        const entry = SavedContacts.prepare(JSON.parse(await file.text()), {
          id,
          profile,
          referenceHash: data.reference_sha256,
          geometryHash: geometry.geometry_sha256,
        });
        entry.name = file.name;
        savedEntries.push(entry);
        last = entry;
      } catch (error) {
        errors.push(file.name + ': ' + error.message);
      }
    }
    if (last) {
      $('savedSelect').replaceChildren(
        ...savedEntries.map((entry, i) => {
          const option = document.createElement('option');
          option.value = i;
          option.textContent = entry.name + ' · ' + entry.cloud.points.length + ' contacts';
          return option;
        }),
      );
      $('savedSelect').disabled = false;
      $('savedSelect').value = savedEntries.indexOf(last);
      openSaved(last, 'hand');
    }
    if (errors.length) $('savedInfo').textContent = errors.join(' | ');
    event.target.value = '';
  };
  $('savedSelect').onchange = () =>
    openSaved(savedEntries[Number($('savedSelect').value)], replay?.mode || 'hand');
  $('savedHand').onclick = () => openSaved(savedEntries[Number($('savedSelect').value)], 'hand');
  $('savedCloud').onclick = () => openSaved(savedEntries[Number($('savedSelect').value)], 'cloud');
  $('savedReturn').onclick = () => $('modeLive').click();
  $('showOtherTaxels').onchange = () => {
    renderSaved();
    fit();
  };
  $('showSavedAxes').onchange = () => {
    renderSaved();
    fit();
  };

  $('resetView').onclick = fit;
  $('panel').insertBefore($('profileControls'), $('panel').children[2]);
  document.body.classList.add('profile-mode');
  for (const id of [
    'sensorEditor',
    'showSensors',
    'exportContacts',
    'indexAlpha',
    'thumbBend',
    'thumbRot',
    'ratio',
  ]) {
    let el = $(id);
    if (!el) continue;
    if (id !== 'sensorEditor') el = el.closest('details') || el.closest('.metrics');
    el?.remove();
  }
  for (const p of $('panel').querySelectorAll('p'))
    if (p.textContent.startsWith('Original STEP geometry')) p.remove();
  $('liveField').previousElementSibling.remove();
  $('liveField').hidden = true;
  for (const r of P.regions) {
    const el = document.createElement('div');
    el.id = 'pressure_' + r.key;
    $('pressureRegions').appendChild(el);
  }
  view = { plot: $('profileScene0'), raw: raw.slice(), ready: false };
  pose(raw);
  update();
  const objects = SensorObjects.attach({
    models: data.sensor_objects,
    traces,
    plot: view.plot,
    toDisplay: (p) => present(K.point(view.solution.frames.left_base_link, p)),
  });
  boundaryIndex = traces.length;
  traces.push({
    name: 'Hand boundary limits',
    type: 'scatter3d',
    mode: 'markers',
    x: [],
    y: [],
    z: [],
    marker: { size: 3, rgb: [] },
  });
  renderBoundaries();
  inactiveIndex = traces.length;
  traces.push({
    name: 'Other taxels (pressure not stored)',
    type: 'scatter3d',
    mode: 'markers',
    visible: false,
    x: [],
    y: [],
    z: [],
    marker: { size: 2.3, rgb: [] },
  });
  coordinateIndices = ['X', 'Y', 'Z'].map((axis) => {
    const index = traces.length;
    traces.push({
      name: 'Global ' + axis,
      type: 'scatter3d',
      mode: 'lines',
      visible: false,
      xray: true,
      x: [],
      y: [],
      z: [],
      marker: { rgb: [] },
    });
    return index;
  });
  window.getSensorObjects = () => objects.snapshot();
  // Fitted candidates have independent traces: never modify manual object poses.
  estimateIndices = data.sensor_objects.map((model, index) => {
    const trace = {
      name: 'Estimated ' + (index ? 'SENSOR_B' : 'SENSOR_A'),
      type: 'mesh3d',
      color: index ? '#d7a936' : '#18b79c',
      visible: false,
      x: model.vertices.filter((_, i) => i % 3 === 0).map((v) => v * 1000),
      y: model.vertices.filter((_, i) => i % 3 === 1).map((v) => v * 1000),
      z: model.vertices.filter((_, i) => i % 3 === 2).map((v) => v * 1000),
      i: model.indices.filter((_, i) => i % 3 === 0),
      j: model.indices.filter((_, i) => i % 3 === 1),
      k: model.indices.filter((_, i) => i % 3 === 2),
    };
    const slot = traces.length;
    traces.push(trace);
    return slot;
  });
  estimatePointIndex = traces.length;
  traces.push({
    name: 'Frozen estimate measurements',
    type: 'scatter3d',
    mode: 'markers',
    visible: false,
    xray: true,
    x: [],
    y: [],
    z: [],
    marker: { size: 4, rgb: [] },
  });
  window.HandEstimate = {
    clear() {
      estimateActive = false;
      savedVisibility();
      for (const slot of [...estimateIndices, estimatePointIndex]) traces[slot].visible = false;
      if (view.ready)
        HandRenderer.restyle(
          view.plot,
          { visible: [...estimateIndices, estimatePointIndex].map(() => false) },
          [...estimateIndices, estimatePointIndex],
        );
    },
    show(name, fit, frame, threshold = 200, options = {}) {
      this.clear();
      if (frame.frame !== 'left_base_link' || !['mm', 'm'].includes(frame.units))
        throw Error('Estimate has no matching hand coordinate frame.');
      const index = ['SENSOR_A', 'SENSOR_B'].indexOf(name),
        model = data.sensor_objects[index],
        matrix = fit.transform;
      if (
        !model ||
        !Array.isArray(matrix) ||
        matrix.length !== 4 ||
        matrix.some((row) => !Array.isArray(row) || row.length !== 4 || !row.every(Number.isFinite))
      )
        throw Error('Invalid fitted pose.');
      if (!replay?.entry.handAvailable)
        throw Error(
          'The capture has no reproducible hand pose. Use the fit report for this cloud.',
        );
      const base = view.solution.frames.left_base_link,
        trace = traces[estimateIndices[index]];
      trace.x = [];
      trace.y = [];
      trace.z = [];
      for (let i = 0; i < model.vertices.length; i += 3) {
        // Embedded display meshes are centered; fit transforms use original STL coordinates.
        const local = model.vertices
          .slice(i, i + 3)
          .map((v, k) => v * 1000 + model.source_center_mm[k]);
        const fitted = matrix
          .slice(0, 3)
          .map(
            (row) => (row[3] + row.slice(0, 3).reduce((sum, v, k) => sum + v * local[k], 0)) / 1000,
          );
        const q = present(K.point(base, fitted));
        ['x', 'y', 'z'].forEach((axis, k) => trace[axis].push(q[k]));
      }
      const dots = traces[estimatePointIndex];
      dots.x = [];
      dots.y = [];
      dots.z = [];
      dots.marker.rgb = [];
      for (const p of frame.points) {
        const scale = frame.units === 'mm' ? 0.001 : 1,
          q = present(
            K.point(
              base,
              [p.x, p.y, p.z].map((v) => v * scale),
            ),
          );
        ['x', 'y', 'z'].forEach((axis, k) => dots[axis].push(q[k]));
        dots.marker.rgb.push(
          rgb(typeof p.pressure === 'number' && p.pressure > threshold ? '#ff766b' : '#8dd3ee'),
        );
      }
      estimateActive = true;
      savedVisibility();
      trace.visible = true;
      dots.visible = true;
      if (frame.measurement_source === 'csv_run')
        window.HandHistory.runOverlay(
          frame,
          $('runShowLimits')?.checked !== false,
          $('runShowAxes')?.checked !== false,
        );
      traces[pointIndex].visible = false;
      for (let i = objectStart; i < objectEnd; i++) traces[i].visible = false;
      const slots = [estimateIndices[index], estimatePointIndex];
      HandRenderer.restyle(
        view.plot,
        {
          x: slots.map((i) => traces[i].x),
          y: slots.map((i) => traces[i].y),
          z: slots.map((i) => traces[i].z),
          visible: slots.map((i) => traces[i].visible),
        },
        slots,
      );
      if (!options.preserveCamera) fitView();
      return { candidate: name, vertices: trace.x.length };
    },
  };
  function fitView() {
    fit();
  }

  view.plot.addEventListener(
    'pointerdown',
    (event) => {
      if (replay && event.shiftKey) event.stopImmediatePropagation();
    },
    true,
  );
  HandRenderer['create']('profileScene0', traces)
    .then(() => {
      view.ready = true;
      objects.connectDrag();
      fit();
      $('modeLive').click();
    })
    .catch((e) => {
      $('profileStatus0').textContent = 'Rendering failed: ' + e.message;
    });
  setInterval(update, 200);
})();
