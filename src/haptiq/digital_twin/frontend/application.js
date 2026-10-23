/* Application orchestration: sources, frozen snapshots and estimation jobs. */
(() => {
  HaptiqRuntime.ready.then(start).catch((error) => {
    console.error(error);
    const status = document.getElementById('profileStatus0');
    if (status) status.textContent = 'Application startup failed: ' + error.message;
  });

  function start({ history, estimate, twin }) {
    const $ = (id) => document.getElementById(id);
    const { estimateView } = HaptiqLayout.mount({ history });
    const appConfig = JSON.parse($('applicationConfig').textContent);
    let runFrame = null,
      buildVersion = 0;
    const api = HaptiqApi.create();
    const base = api.base;

    let mode = 'manual',
      switching = false,
      historyValid = false,
      csvRows = null,
      csvName = '',
      job = null,
      pollTimer = null,
      running = false,
      loading = false,
      historyFrame = null,
      loadVersion = 0;
    let restoringEstimate = true;

    const status = $('estimateStatus');
    const poseModels = JSON.parse($('jointProfileData').textContent).sensor_objects;
    let feedbackState = null;
    function paintFeedback(state) {
      feedbackState = state;
      const host = $('estimateFeedback');
      host.hidden = state.status === 'idle';
      host.innerHTML = EstimateFeedback.render(
        state,
        reasons[state.result?.reason] || state.result?.reason || '',
        Date.now() / 1000,
        {
          models: poseModels,
          frame: fittedFrame?.frame,
          candidate: fittedResult === state.result ? $('estimateCandidate').value : null,
        },
      );
      const retry = $('retryEstimateStatus');
      if (retry) retry.onclick = refresh;
    }
    setInterval(() => {
      if (feedbackState?.status === 'running') {
        const clock = $('estimateFeedback').querySelector('.fit-time');
        if (clock)
          clock.textContent = EstimateFeedback.elapsed(feedbackState.started_at, Date.now() / 1000);
      }
    }, 1000);

    let fittedFrame = null,
      fittedResult = null,
      fittedThreshold = 200;

    let previewHistory = [],
      previewSequence = null,
      previewHandReady = false;
    function showPreviewPose(pose) {
      if (!pose || !fittedFrame?.hand_snapshot) return;
      try {
        if (!previewHandReady) {
          history.show(fittedFrame.hand_snapshot, 'Estimation: frozen hand');
          previewHandReady = true;
        }
        estimateView.hidden = true;

        estimate.show(pose.candidate, { transform: pose.transform }, fittedFrame, fittedThreshold, {
          preserveCamera: true,
        });
        const index = poseModels.findIndex((model) => model.candidate_id === pose.candidate),
          name = poseModels[index]?.name || pose.candidate;
        $('estimatePreviewStatus').textContent =
          name +
          ' · ' +
          pose.stage.replaceAll('_', ' ') +
          ' · ' +
          Number(pose.elapsed_seconds || 0).toFixed(1) +
          ' s · trial pose';
        $('estimatePoseWarning').hidden = true;
        previewSequence = pose.sequence;
      } catch (error) {
        $('estimatePreviewStatus').textContent = 'Preview unavailable: ' + error.message;
      }
    }
    function updatePreview(state) {
      if (!fittedFrame || !Array.isArray(state.pose_history) || !state.pose_history.length) return;
      const selected = previewHistory[Number($('estimatePoseStep').value)]?.sequence;
      previewHistory = state.pose_history;
      $('estimatePreview').hidden = false;
      $('estimatePoseStep').max = previewHistory.length - 1;
      if ($('estimateFollow').checked && state.status === 'running') {
        $('estimatePoseStep').value = previewHistory.length - 1;
        const latest = previewHistory.at(-1);
        if (latest.sequence !== previewSequence) showPreviewPose(latest);
      } else if (selected != null) {
        const index = previewHistory.findIndex((p) => p.sequence === selected);
        $('estimatePoseStep').value = Math.max(0, index);
      }
    }
    $('estimatePoseStep').oninput = () => {
      $('estimateFollow').checked = false;
      showPreviewPose(previewHistory[Number($('estimatePoseStep').value)]);
    };
    $('estimateFollow').onchange = () => {
      if ($('estimateFollow').checked && previewHistory.length) {
        $('estimatePoseStep').value = previewHistory.length - 1;
        showPreviewPose(previewHistory.at(-1));
      }
    };

    function clearEstimate() {
      previewHistory = [];
      previewSequence = null;
      previewHandReady = false;
      $('estimatePreview').hidden = true;
      $('estimateFollow').checked = true;
      estimate?.clear();
      fittedFrame = null;
      fittedResult = null;
      $('estimatePoseWarning').hidden = true;
      $('showEstimate').disabled = true;
      $('showFitReport').disabled = true;
      $('estimateCandidateLabel').hidden = true;
    }

    function placeEstimate() {
      if (!fittedFrame || !fittedResult) return;

      estimateView.hidden = true;

      const candidate = $('estimateCandidate').value;
      if (!candidate) {
        estimate?.clear();
        return;
      }
      $('estimatePoseWarning').hidden = fittedResult.fits[candidate]?.compatible === true;
      $('estimatePoseWarning').textContent = fittedResult.candidate_comparison
        ? 'Model comparison only; sensor size is unresolved.'
        : fittedResult.fits[candidate]?.placement_usable
          ? 'Provisional placement: identity, open hand links and continuous collision clearance are unverified.'
          : 'Rejected fit: contact or finite hand penetration limits exceeded.';

      try {
        if (!fittedFrame.hand_snapshot)
          throw Error(
            'This cloud has no saved hand pose. Open Fit report to inspect its alignment.',
          );

        history.show(fittedFrame.hand_snapshot, 'Estimate snapshot');

        historyFrame = fittedFrame;
        historyValid = true;
        layoutMode('history');

        estimate.show(candidate, fittedResult.fits[candidate], fittedFrame, fittedThreshold);
      } catch (error) {
        estimate?.clear();
        status.textContent += ' ' + error.message;
      }
    }

    $('estimateCandidate').onchange = () => {
      placeEstimate();
      if (feedbackState) paintFeedback(feedbackState);
    };

    function updateReady() {
      $('estimateButton').disabled = running || loading || (mode === 'history' && !historyValid);

      $('showCloud').disabled = mode !== 'history' || !historyValid;

      $('buildRun').disabled = loading || !csvRows;

      $('downloadRun').hidden = !runFrame || !historyValid;

      $('runLayers').hidden = !runFrame || !historyValid;
    }

    function invalidateHistory(message) {
      clearEstimate();
      historyValid = false;
      historyFrame = null;
      estimateView.hidden = true;

      runFrame = null;

      $('historyStatus').textContent = message;
      updateReady();
    }

    function previewReady() {
      clearEstimate();

      runFrame = null;

      const frame = window.getIdentificationFrame();

      if (!frame.valid || !frame.points.length)
        throw Error('This file does not contain a usable point cloud.');

      historyFrame = JSON.parse(JSON.stringify(frame));
      historyValid = true;

      $('selectedHistory').textContent = frame.saved_name || 'Saved capture';

      status.textContent =
        'Preview ready · ' +
        frame.points.length +
        ' points. Inspect the hand or point cloud, then press Estimate.';

      updateReady();
    }

    $('chooseHistory').onclick = () => $('historyFiles').click();

    function layoutMode(next) {
      next = next === 'manual' ? 'live' : next;
      $('receivedRuns').hidden = next === 'history';
      $('receivedRuns').parentElement.hidden = next === 'history';
      $('manualData').hidden = next === 'history';
      $('historyTimeline').hidden = next !== 'history' || !csvRows;
      mode = next;
      for (const key of ['live', 'history']) {
        $(key + 'Data').hidden = key !== mode;
        const tab = $('data' + key[0].toUpperCase() + key.slice(1));
        tab.classList.toggle('active', key === mode);
        tab.setAttribute('aria-selected', String(key === mode));
      }

      $('sourceInfo').textContent =
        mode === 'manual'
          ? 'Set the angles yourself. Pressure is unknown; angles alone cannot identify an object.'
          : mode === 'live'
            ? 'Current actual angles and pressure from the connected hand.'
            : 'Historical data only. Live updates are paused.';

      updateReady();
    }

    function selectMode(next) {
      // A pending live-capture load must not replace the file selected in History.
      if (next === 'history' && receiverLoading) {
        buildVersion++;
        loading = false;
      }

      clearEstimate();

      switching = true;
      try {
        if (next === 'manual') $('modeManual').click();

        if (next === 'live') $($('followTelemetry').checked ? 'modeLive' : 'modeManual').click();

        if (next === 'history') {
          if (!history.isReplaying()) $('modeManual').click();

          if (historyValid && runFrame) {
            historyFrame = runFrame;
            history.show(runFrame.hand_snapshot, runFrame.saved_name);
          } else if (historyValid && !$('savedSelect').disabled) {
            $('savedSelect').onchange();
            previewReady();
          }
        }

        layoutMode(next);
        estimateView.hidden = true;

        if (next === 'history' && runFrame) drawRun();
      } finally {
        switching = false;
      }
    }

    for (const key of ['live', 'history'])
      $('data' + key[0].toUpperCase() + key.slice(1)).onclick = () => selectMode(key);

    $('followTelemetry').onchange = () => selectMode('live');
    $('modeManual').addEventListener('click', () => {
      if (!switching) layoutMode('manual');
    });

    $('modeLive').addEventListener('click', () => {
      if (!switching) layoutMode('live');
    });

    $('savedSelect').addEventListener('change', () => {
      try {
        layoutMode('history');
        estimateView.hidden = true;
        previewReady();
      } catch (e) {
        invalidateHistory(e.message);
      }
    });

    function showHistory(payload, name) {
      switching = true;
      try {
        history.show(payload, name);
        layoutMode('history');
        estimateView.hidden = true;
        previewReady();
      } finally {
        switching = false;
      }
    }

    let historySteps = [];
    function timelineLabel(step) {
      const item = historySteps[step - 1];
      if (!item) return;
      const state = csvRows[item.row - 1].state;
      $('historyTimeLabel').textContent =
        'Pose ' +
        step +
        ' / ' +
        historySteps.length +
        ' · row ' +
        item.row +
        ' / ' +
        csvRows.length +
        (state ? ' · ' + state : '');
      $('historyTimeLabel').parentElement.title = 'History ' + $('historyTimeLabel').textContent;
      $('historyTime').setAttribute(
        'aria-valuetext',
        'Pose ' + step + ' of ' + historySteps.length + ', CSV row ' + item.row,
      );
    }
    function configureTimeline() {
      const visible = mode === 'history' && !!csvRows;
      $('historyTimeline').hidden = !visible;
      historySteps = [];
      if (!visible) return;
      const selected = IdentificationRuns.select(csvRows, $('historyRun').value).run;
      // Collapse held poses by the six actual angles. Pressure/state changes
      // do not add a pose; returning to a pose after moving remains navigable.
      let previous = null;
      for (let i = selected.start; i <= selected.end; i++) {
        const angles = IdentificationHistory.actualAngles(csvRows[i]);
        if (!previous || angles.some((value, k) => value !== previous[k]))
          historySteps.push({ row: i + 1, angles });
        previous = angles;
      }
      $('historyTime').min = 1;
      $('historyTime').max = historySteps.length;
      const poseRow = runFrame?.hand_snapshot?.pose_source_row ?? selected.end + 1;
      let step = 1;
      historySteps.forEach((item, i) => {
        if (item.row <= poseRow) step = i + 1;
      });
      $('historyTime').value = step;
      timelineLabel(step);
    }
    let scrubQueued = false,
      pendingHistoryStep = null;
    function scrubHistory() {
      if (!csvRows || !runFrame || mode !== 'history') return;
      const step = Number($('historyTime').value);
      if (!historySteps[step - 1]) return;
      pendingHistoryStep = historySteps[step - 1];
      timelineLabel(step);
      if (scrubQueued) return;
      scrubQueued = true;
      const currentRun = runFrame;
      requestAnimationFrame(() => {
        scrubQueued = false;
        if (!csvRows || runFrame !== currentRun || mode !== 'history') return;
        history.setPose(pendingHistoryStep.angles);
      });
    }
    $('historyTime').oninput = scrubHistory;
    for (const [id, delta] of [
      ['timelinePrev', -1],
      ['timelineNext', 1],
    ])
      $(id).onclick = () => {
        const slider = $('historyTime');
        slider.value = Math.max(
          Number(slider.min),
          Math.min(Number(slider.max), Number(slider.value) + delta),
        );
        scrubHistory();
      };

    function showCSV() {
      if (!csvRows) return;

      runFrame = null;

      const row = Number($('historyRow').value);
      if (!Number.isInteger(row) || row < 1 || row > csvRows.length)
        throw Error('Choose a row from 1 to ' + csvRows.length + '.');

      const packet = IdentificationHistory.telemetry(csvRows[row - 1], JointPressure.regions);

      switching = true;
      try {
        history.telemetry(packet, csvName + ' · row ' + row);
        layoutMode('history');
        previewReady();
      } finally {
        switching = false;
      }

      $('historyRowInfo').textContent =
        'Row ' +
        row +
        ' / ' +
        csvRows.length +
        ' · index ' +
        packet.index +
        (packet.state ? ' · ' + packet.state : '');

      $('historyStatus').textContent =
        'CSV uses the saved angles and recorded counts. Offsets and failed-read validity are not supplied.';

      estimateView.hidden = true;
    }

    async function drawRun() {
      if (!runFrame) return;
      estimateView.hidden = true;

      if (runFrame.hand_snapshot && !history.isReplaying())
        history.show(runFrame.hand_snapshot, runFrame.saved_name);
      history.runOverlay(runFrame, $('runShowLimits').checked, $('runShowAxes').checked);
    }

    $('runShowLimits').onchange = () => {
      if (runFrame) drawRun();
    };
    $('runShowAxes').onchange = () => {
      if (runFrame) drawRun();
    };

    async function acceptRun(frame) {
      clearEstimate();
      runFrame = IdentificationRuns.validateFrame(frame);
      historyFrame = runFrame;
      historyValid = true;

      layoutMode('history');
      $('selectedHistory').textContent = frame.saved_name;

      const a = frame.accumulation;

      status.textContent =
        frame.points.length +
        ' active contacts · ' +
        (frame.boundary_points?.length || 0) +
        ' hand-space limits' +
        (a
          ? ' from ' + (a.frames_reconstructed ?? a.frames_used) + ' selected angle poses.'
          : '.') +
        (frame.points.length
          ? ' Press Estimate to fit with these limits.'
          : ' No contacts: the hand sweep constrains space, but does not uniquely locate the object.');

      $('historyStatus').textContent =
        'Constraints include poses without activation. Inactive readings do not certify empty space beyond the local hand surface.';

      updateReady();
      if (frame.hand_snapshot) {
        switching = true;
        try {
          history.show(frame.hand_snapshot, frame.saved_name);
        } finally {
          switching = false;
        }
      }
      configureTimeline();
      await drawRun();
    }

    let selectedFileCapture = null;
    async function buildRun() {
      if (!csvRows) return;

      const version = ++buildVersion;
      invalidateHistory('Building run contacts…');
      loading = true;
      updateReady();

      try {
        const selected = IdentificationRuns.select(csvRows, $('historyRun').value);

        const frame = await IdentificationRuns.buildAsync(selected.rows, history.context(), {
          run_key: selected.run.key,
          name:
            csvName +
            ' · ' +
            selected.run.label +
            ' · ' +
            selected.run.first_index +
            '–' +
            selected.run.last_index,

          threshold: Number($('estimateThreshold').value),
          voxel_mm: Number($('runVoxel').value),
          thumb_limit_selection: 'peak',
          thumb_only: $('runRegions').value === 'thumb',

          cancelled: () => version !== buildVersion,

          progress: (n, total) => {
            $('historyStatus').textContent = 'Building run: ' + n + ' / ' + total + ' samples';
          },
        });

        const capture =
          selectedFileCapture?.id === selected.run.explicit
            ? selectedFileCapture
            : receivedMetadata.get(selected.run.explicit);
        if (capture) frame.accumulation.received_capture = capture;
        if (version === buildVersion) await acceptRun(frame);
      } catch (e) {
        if (version === buildVersion)
          invalidateHistory(
            e.message.startsWith('No valid ')
              ? 'CSV loaded. ' +
                  e.message +
                  ' Choose All hand regions for finger contacts, or select a run with thumb contact.'
              : e.message,
          );
      } finally {
        if (version === buildVersion) {
          loading = false;
          updateReady();
        }
      }
    }

    function chooseScope() {
      buildVersion++;
      loading = false;

      const whole = true;
      $('runControls').hidden = !whole;
      $('rowControls').hidden = whole;

      if (whole) {
        invalidateHistory('Choose a run, then build its point cloud.');
        $('historyRowInfo').textContent =
          'Runs remain separate; no registration across grasps is assumed.';
      } else
        try {
          showCSV();
        } catch (e) {
          invalidateHistory(e.message);
        }
    }

    $('buildRun').onclick = buildRun;

    for (const id of ['historyRun', 'runRegions', 'runVoxel']) $(id).onchange = () => buildRun();

    $('estimateThreshold').onchange = () => {
      if (runFrame) {
        buildVersion++;
        invalidateHistory('Threshold changed. Build the run point cloud again.');
      }
    };

    $('downloadRun').onclick = () => {
      if (!runFrame) return;
      const url = URL.createObjectURL(
          new Blob([JSON.stringify(runFrame, null, 2)], { type: 'application/json' }),
        ),
        a = document.createElement('a');

      a.href = url;
      a.download = 'thumb_run_cloud.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    $('historyFiles').onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const version = ++loadVersion;
      loading = true;

      buildVersion++;

      invalidateHistory('Loading ' + file.name + '…');

      $('selectedHistory').textContent = file.name;

      csvRows = null;
      selectedFileCapture = null;
      $('csvControls').hidden = true;

      try {
        if (file.size > 256 * 1024 * 1024)
          throw Error(
            'History files must be at most 256 MB; use individual run CSVs for larger recordings.',
          );

        const text = await file.text();
        if (version !== loadVersion) return;

        const isCSV = file.name.toLowerCase().endsWith('.csv');
        const payload = isCSV ? null : JSON.parse(text);
        const capture =
          payload &&
          typeof payload.id === 'string' &&
          /^\d{8}T\d{6}Z_[a-f0-9]{12}$/.test(payload.id) &&
          ['recording', 'complete', 'interrupted'].includes(payload.status) &&
          Number.isInteger(payload.samples);
        let csvText = text;
        if (capture) {
          if (payload.status === 'recording')
            throw Error('This run is still recording. Finish it before loading.');
          const response = await api.fetch('/api/probing-runs/' + encodeURIComponent(payload.id), {
            signal: AbortSignal.timeout(15000),
          });
          if (version !== loadVersion) return;
          if (!response.ok)
            throw Error(
              'The matching recording is unavailable on this receiver. Choose ' +
                payload.id +
                '.csv from the same folder.',
            );
          csvText = await response.text();
          if (version !== loadVersion) return;
          selectedFileCapture = payload;
        }
        if (isCSV || capture) {
          csvRows = IdentificationHistory.records(csvText);
          csvName = capture ? payload.id + '.csv' : file.name;

          const runs = IdentificationRuns.groups(csvRows);

          if (!runs.length) throw Error('CSV contains no non-idle run samples.');

          $('historyRun').replaceChildren(
            ...runs.map((run) => {
              const o = document.createElement('option');
              o.value = run.key;
              o.textContent =
                run.label +
                ' · ' +
                run.first_index +
                '–' +
                run.last_index +
                ' · ' +
                run.count +
                ' samples';
              return o;
            }),
          );

          $('csvControls').hidden = false;
          $('historyRow').max = csvRows.length;
          $('historyRow').value = 1;
          chooseScope();

          await buildRun();
        } else {
          if (payload.measurement_source === 'csv_run') await acceptRun(payload);
          else {
            showHistory(payload, file.name);
            $('historyStatus').textContent = 'Loaded JSON coordinates and pressure.';
          }
        }
      } catch (error) {
        if (version === loadVersion)
          invalidateHistory(
            file.name + ': ' + error.message + ' Choose a valid file before estimating.',
          );
      } finally {
        if (version === loadVersion) {
          loading = false;
          updateReady();
          event.target.value = '';
        }
      }
    };

    $('historyRow').onchange = () => {
      try {
        showCSV();
      } catch (e) {
        invalidateHistory(e.message);
      }
    };

    $('historyPrev').onclick = () => {
      if (Number($('historyRow').value) > 1) {
        $('historyRow').value = Number($('historyRow').value) - 1;
        $('historyRow').onchange();
      }
    };

    $('historyNext').onclick = () => {
      if (csvRows && Number($('historyRow').value) < csvRows.length) {
        $('historyRow').value = Number($('historyRow').value) + 1;
        $('historyRow').onchange();
      }
    };

    $('showHand').hidden = true;

    $('showCloud').onclick = () => {
      if (mode === 'history' && historyValid) {
        if (runFrame) drawRun();
        else {
          estimateView.hidden = true;
          $('savedCloud').click();
        }
      }
    };

    $('showEstimate').onclick = placeEstimate;

    $('showFitReport').onclick = () => {
      const report = estimateView.querySelector('iframe');
      if (report.dataset.reportUrl && report.getAttribute('src') !== report.dataset.reportUrl)
        report.src = report.dataset.reportUrl;
      estimateView.hidden = false;
    };

    const reasons = {
      sensor_size_unresolved: 'Both sensor sizes fit similarly; compare both models',
      known_placement_provisional: 'Provisional fit near usual insertion; identity unconfirmed',
      quick_placement: 'Quick approximate placement from sampled sensor surfaces.',
      space_constraints_only:
        'Hand sweep constrains space; object pose is unanchored without contacts.',
      both_candidates_compatible: 'Both shapes fit.',
      neither_candidate_compatible_within_search:
        'Neither shape fits sufficiently within this search.',
      insufficient_contacts: 'Not enough valid contact pressure.',
      insufficient_spatial_coverage: 'Contacts cover too little of the object.',
      calibration_unverified: 'Geometry needs calibration before a confident label.',
      score_margin_too_small: 'The score difference is too small.',
      alignment_search_unstable: 'Alignment did not settle reliably.',
      invalid_or_stale_frame: 'No valid synchronized snapshot.',
      one_candidate_clearly_more_consistent: 'One shape fits clearly better.',
    };

    function display(state) {
      if (state.estimator_revision !== appConfig.estimator_revision)
        throw Error(
          'Restart the simulation launcher to load the updated estimator, then reload this page.',
        );
      paintFeedback(state);
      updatePreview(state);

      running = state.status === 'running';
      updateReady();
      clearTimeout(pollTimer);

      if (state.status === 'running') {
        status.textContent =
          'Estimating frozen snapshot: ' +
          (state.input_label || mode) +
          '. You can keep inspecting the hand.';

        job = state.job_id;
        pollTimer = setTimeout(refresh, 400);
      } else if (state.status === 'complete') {
        $('estimatePreview').hidden = true;
        $('estimateFollow').checked = false;

        const result = state.result,
          errors = Object.entries(result.fits || {})
            .map(
              ([name, fit]) =>
                name.replace('SENSOR_', '') +
                ': ' +
                (fit.placement_usable
                  ? 'provisional'
                  : fit.compatible
                    ? fit.quick_preview
                      ? 'approximate'
                      : 'valid'
                    : 'rejected') +
                ' (max contact ' +
                (fit.max_error_mm ?? fit.rmse_mm).toFixed(2) +
                ' mm, hand ' +
                (fit.hand_limit_max_mm ?? 0).toFixed(2) +
                ' mm)',
            )
            .join(' · ');

        status.textContent = 'Estimate complete · ' + (reasons[result.reason] || result.reason);

        estimateView.querySelector('iframe').dataset.reportUrl =
          base + state.report_url + '?job=' + state.job_id;

        estimateView.hidden = true;

        $('showFitReport').disabled = false;

        fittedResult = result;

        const candidates = Object.entries(result.fits || {})

          .filter(([, fit]) => Number.isFinite(fit.score) && Array.isArray(fit.transform))

          .sort((a, b) => {
            if (a[0] === result.placement_candidate) return -1;
            if (b[0] === result.placement_candidate) return 1;
            if (a[1].compatible !== b[1].compatible) return a[1].compatible ? -1 : 1;

            return a[1].score - b[1].score;
          });

        $('estimateCandidate').replaceChildren(
          ...candidates.map(([name]) => {
            const option = document.createElement('option');
            option.textContent =
              (poseModels.find((model) => model.candidate_id === name)?.name || name) +
              (result.fits[name].placement_usable
                ? result.fits[name].placement_quality === 'partial_contact_support'
                  ? ' · partial placement'
                  : ' · provisional placement'
                : result.fits[name].compatible
                  ? result.fits[name].quick_preview
                    ? ' · approximate placement'
                    : ' · compatible'
                  : ' · REJECTED fit');
            option.value = name;
            return option;
          }),
        );

        if (result.candidate_comparison) {
          const choice = document.createElement('option');
          choice.value = '';
          choice.textContent = 'Choose model to compare · size unresolved';
          $('estimateCandidate').prepend(choice);
          $('estimateCandidate').value = '';
        }
        $('estimateCandidateLabel').hidden = candidates.length < 2;

        $('showEstimate').disabled = !candidates.length || !fittedFrame?.hand_snapshot;

        if (result.candidate_comparison) {
          estimate?.clear();
          $('estimatePoseWarning').hidden = true;
          status.textContent +=
            ' Sensor size unresolved. Choose either fitted candidate for comparison.';
        } else if (
          candidates.length &&
          (result.fits[candidates[0][0]].compatible ||
            result.fits[candidates[0][0]].placement_usable) &&
          fittedFrame?.hand_snapshot
        ) {
          status.textContent +=
            ' Provisional pose shown in the frozen hand' +
            (fittedFrame.measurement_source === 'csv_run' ? ' at the last contact sample.' : '.');
          placeEstimate();
        } else if (candidates.length && fittedFrame?.hand_snapshot) {
          estimate?.clear();
          $('estimatePoseWarning').hidden = true;
          status.textContent +=
            ' No valid placement found. Rejected poses are available for explicit inspection with Estimate in hand.';
        } else {
          estimate?.clear();
          status.textContent +=
            result.contacts === 0 && result.hand_boundary_points > 0
              ? ' Swept limits are retained for later contact or pose evidence.'
              : candidates.length
                ? ' No reproducible hand pose; see Fit report.'
                : ' No valid STL pose; see Fit report for rejected candidates.';
        }
      } else if (state.status === 'error') {
        estimate?.clear();
        status.textContent = 'Estimate failed: ' + state.error;
      }
    }

    async function refresh() {
      try {
        const response = await api.fetch('/api/identification', {
            signal: AbortSignal.timeout(10000),
          }),
          state = await response.json();

        if (!response.ok) throw Error(state.error || 'Service unavailable');

        if (job && state.job_id !== job) {
          clearEstimate();
          throw Error('Another estimate replaced this job. Run Estimate again.');
        }

        display(state);
      } catch (error) {
        running = false;
        updateReady();
        status.textContent = error.message;
        paintFeedback({
          status: 'connection_error',
          error: error.message,
          input_label: feedbackState?.input_label,
        });
      }
    }

    $('estimateButton').onclick = async () => {
      if (loading || running) return;

      if (mode === 'history' && !historyValid) {
        status.textContent = 'Select a valid history frame before estimating.';
        return;
      }

      const threshold = Number($('estimateThreshold').value),
        tolerance = Number($('estimateTolerance').value),
        handTolerance = Number($('estimateHandTolerance').value),
        pointSpacing = Number($('estimatePointSpacing').value);

      if (
        !Number.isFinite(threshold) ||
        threshold < 0 ||
        threshold > 4095 ||
        !Number.isFinite(tolerance) ||
        tolerance < 0.1 ||
        tolerance > 20 ||
        !Number.isFinite(handTolerance) ||
        handTolerance < 0.1 ||
        handTolerance > 20 ||
        !Number.isFinite(pointSpacing) ||
        pointSpacing < 0 ||
        pointSpacing > 20
      ) {
        status.textContent =
          'Check threshold (0–4095), tolerances (0.1–20 mm), and point spacing (0–20 mm).';
        return;
      }

      twin.tick();
      const frame = mode === 'history' ? historyFrame : window.getIdentificationFrame();

      if (!frame.valid) {
        status.textContent =
          mode === 'live'
            ? 'Live angles and pressure are missing, stale or unsynchronized.'
            : 'Load a valid history frame or choose a manual pose first.';
        return;
      }

      const frozen = JSON.parse(JSON.stringify(frame));

      clearEstimate();
      fittedFrame = frozen;
      fittedThreshold = threshold;

      const count = frozen.points.filter(
        (p) => typeof p.pressure === 'number' && p.pressure > threshold,
      ).length;

      const label =
        mode === 'history'
          ? 'History · ' + (frame.saved_name || 'capture')
          : mode === 'manual'
            ? 'Manual pose'
            : 'Live hand';

      paintFeedback({
        status: 'running',
        started_at: Date.now() / 1000,
        input_label: label,
        progress: { stage: 'queued' },
      });
      status.textContent =
        'Captured ' +
        frozen.points.length +
        ' positions · ' +
        count +
        ' contact points · ' +
        (frozen.boundary_points?.length || 0) +
        ' hand limits. Starting estimate…';
      running = true;
      updateReady();

      try {
        const check = await api.fetch('/api/identification', {
          signal: AbortSignal.timeout(10000),
        });

        const backend = await check.json();

        if (!check.ok) throw Error(backend.error || 'Could not reach estimator');

        if (backend.estimator_revision !== appConfig.estimator_revision)
          throw Error(
            'Restart the simulation launcher to load the updated estimator, then reload this page.',
          );

        const response = await api.fetch('/api/identification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            mode: 'current',
            frame: frozen,
            threshold,
            tolerance_mm: tolerance,
            hand_tolerance_mm: handTolerance,
            point_spacing_mm: pointSpacing,
            quick_preview: $('estimateQuality').value === 'quick',
            input_label: label,
          }),
        });

        const state = await response.json();
        if (response.status === 409) {
          clearEstimate();
          throw Error(
            'An estimate is already running. Wait for it to finish, then press Estimate again.',
          );
        }
        if (!response.ok) throw Error(state.error || 'Could not estimate');
        job = state.job_id;
        display(state);
      } catch (error) {
        running = false;
        updateReady();
        status.textContent = 'Estimate failed: ' + error.message;
        paintFeedback({ status: 'error', error: error.message, input_label: label });
      }
    };

    let receiverBusy = false,
      receiverLoading = false,
      lastAutoRun = null,
      receivedMetadata = new Map();
    async function openReceivedRun(id) {
      if (!id || mode === 'history' || loading || running || receiverLoading) return;
      receiverLoading = true;
      loading = true;
      updateReady();
      const version = ++buildVersion,
        fileVersion = loadVersion;
      try {
        const response = await api.fetch('/api/probing-runs/' + encodeURIComponent(id), {
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw Error((await response.json()).error || 'Could not load capture');
        const rows = IdentificationHistory.records(await response.text());
        if (mode === 'history' || fileVersion !== loadVersion || version !== buildVersion) return;
        const frame = await IdentificationRuns.buildAsync(rows, history.context(), {
          run_key: id,
          name: 'Received probe ' + id,
          threshold: Number($('estimateThreshold').value),
          voxel_mm: Number($('runVoxel').value),
          thumb_limit_selection: 'peak',
          thumb_only: $('runRegions').value === 'thumb',
          cancelled: () =>
            version !== buildVersion || mode === 'history' || fileVersion !== loadVersion,
          progress: (n, total) => {
            $('receivedRunStatus').textContent =
              'Building received run: ' + n + ' / ' + total + ' poses';
          },
        });
        if (version === buildVersion && mode !== 'history' && fileVersion === loadVersion) {
          csvRows = rows;
          csvName = 'Received probe ' + id;
          const groups = IdentificationRuns.groups(rows);
          $('historyRun').replaceChildren(
            ...groups.map((run) => {
              const option = document.createElement('option');
              option.value = run.key;
              option.textContent = run.label;
              return option;
            }),
          );
          $('csvControls').hidden = false;
          $('runControls').hidden = false;
          $('rowControls').hidden = true;
          $('historyRow').max = rows.length;
          $('historyRow').value = 1;
          frame.accumulation.received_capture = receivedMetadata.get(id) || { id };
          await acceptRun(frame);
          $('receivedRunStatus').textContent =
            'Captured run ready · ' + rows.length + ' received samples. Press Estimate when ready.';
        }
      } catch (error) {
        $('receivedRunStatus').textContent = 'Capture could not be built: ' + error.message;
      } finally {
        receiverLoading = false;
        if (version === buildVersion) {
          loading = false;
          updateReady();
        }
      }
    }
    function selectReceivedRun() {
      const id = $('receivedRunSelect').value;
      $('openReceivedRun').disabled = !id;
      $('downloadReceivedCSV').hidden = !id;
      if (id) {
        $('downloadReceivedCSV').href = base + '/api/probing-runs/' + encodeURIComponent(id);
        $('downloadReceivedCSV').download = id + '.csv';
      }
    }
    async function captureAction(action, enabled) {
      $('startReceivedCapture').disabled = true;
      $('finishReceivedCapture').disabled = true;
      try {
        const response = await api.fetch('/api/probing-runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...(enabled === undefined ? {} : { enabled }) }),
          signal: AbortSignal.timeout(5000),
        });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || 'Capture action failed');
      } catch (error) {
        $('receivedRunStatus').textContent = error.message;
      } finally {
        await pollReceivedRuns();
      }
    }
    $('captureOnClose').onchange = () => captureAction('auto', $('captureOnClose').checked);
    $('startReceivedCapture').onclick = () => captureAction('start');
    $('finishReceivedCapture').onclick = () => captureAction('finish');
    $('receivedRunSelect').onchange = selectReceivedRun;
    $('openReceivedRun').onclick = () => openReceivedRun($('receivedRunSelect').value);
    async function pollReceivedRuns() {
      if (receiverBusy || receiverLoading) return;
      receiverBusy = true;
      try {
        const response = await api.fetch('/api/probing-runs', {
          signal: AbortSignal.timeout(5000),
        });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || 'Receiver unavailable');
        $('startReceivedCapture').disabled = !!data.active;
        $('finishReceivedCapture').disabled = !['manual', 'closure'].includes(
          data.active?.capture_mode,
        );
        $('captureOnClose').checked = data.auto_on_close;
        $('closureCaptureStatus').textContent =
          data.active?.capture_mode === 'closure'
            ? 'Recording finger-motion window. Reopen the hand or press Finish capture.'
            : !data.auto_on_close
              ? 'Automatic finger-motion capture is off.'
              : data.closure_armed
                ? 'Armed: waiting for the fingers to close.'
                : 'Waiting to observe an open hand before arming.';
        receivedMetadata = new Map(data.runs.map((run) => [run.id, run]));
        const previous = $('receivedRunSelect').value,
          select = $('receivedRunSelect');
        const signature = JSON.stringify(data.runs.map((r) => [r.id, r.status, r.samples]));
        if (select.dataset.signature !== signature) {
          select.replaceChildren();
          for (const run of data.runs) {
            const option = document.createElement('option');
            option.value = run.id;
            option.textContent = run.id + ' · ' + run.status + ' · ' + run.samples + ' samples';
            select.append(option);
          }
          if (data.runs.some((r) => r.id === previous)) select.value = previous;
          select.dataset.signature = signature;
          selectReceivedRun();
        }
        if (data.error) $('receivedRunStatus').textContent = 'Recording error: ' + data.error;
        else if (data.active)
          $('receivedRunStatus').textContent =
            'Recording probe · ' +
            data.active.samples +
            ' received samples' +
            (data.active.missing_source_samples
              ? ' · ' + data.active.missing_source_samples + ' source samples missed'
              : '');
        else if (!data.runs.length)
          $('receivedRunStatus').textContent =
            'Waiting for probing telemetry with state, actual angles and tactile readings.';
        const latest = data.runs.find((r) => r.status === 'complete' && r.samples > 0);
        if (
          !restoringEstimate &&
          mode !== 'history' &&
          latest &&
          lastAutoRun !== latest.id &&
          $('autoReceiveRun').checked &&
          !loading &&
          !running
        ) {
          lastAutoRun = latest.id;
          select.value = latest.id;
          selectReceivedRun();
          await openReceivedRun(latest.id);
          if (latest.missing_source_samples || latest.skipped_samples)
            $('receivedRunStatus').textContent +=
              ' Incomplete input: ' +
              latest.missing_source_samples +
              ' source samples missed; ' +
              latest.skipped_samples +
              ' invalid samples skipped.';
        }
      } catch (error) {
        $('receivedRunStatus').textContent = 'Probing receiver unavailable: ' + error.message;
      } finally {
        receiverBusy = false;
      }
    }
    setInterval(pollReceivedRuns, 1000);
    pollReceivedRuns();

    selectMode('live');
    // Recover feedback for a job that was started before a page reload.
    api
      .fetch('/api/identification', { signal: AbortSignal.timeout(10000) })
      .then(async (response) => {
        const state = await response.json();
        if (!response.ok) throw Error(state.error || 'Estimator unavailable');
        if (['running', 'complete', 'error'].includes(state.status)) {
          if (state.estimate_frame?.valid === true && state.estimate_frame.hand_snapshot) {
            fittedFrame = JSON.parse(JSON.stringify(state.estimate_frame));
            fittedThreshold = Number.isFinite(state.estimate_threshold)
              ? state.estimate_threshold
              : 200;
            historyFrame = fittedFrame;
            historyValid = true;
            if (fittedFrame.measurement_source === 'csv_run') runFrame = fittedFrame;
            $('selectedHistory').textContent =
              fittedFrame.saved_name || state.input_label || 'Restored estimate snapshot';
            history.show(fittedFrame.hand_snapshot, 'Restored estimate snapshot');
            layoutMode('history');
          }
          job = state.job_id;
          display(state);
        }
      })
      .catch((error) => paintFeedback({ status: 'connection_error', error: error.message }))
      .finally(() => {
        restoringEstimate = false;
      });
  }
})();
