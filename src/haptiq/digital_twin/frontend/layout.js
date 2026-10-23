/* Mount application controls; no network or estimation state. */
window.HaptiqLayout = {
  mount({ history }) {
    const $ = (id) => document.getElementById(id),
      panel = $('panel'),
      old = [...panel.children];

    const app = document.createElement('div');
    app.id = 'onePageApp';

    app.append($('applicationPanel').content.cloneNode(true));

    panel.append(app);
    old.forEach((node) => $('advancedData').append(node));

    old
      .filter((n) => n.matches('.kicker,h1'))
      .forEach((n) => {
        n.hidden = true;
      });

    $('modeManual').parentElement.hidden = true;

    $('manualActions').append($('quickOpen'), $('quickClose'));

    $('manualAngles').append($('controls'));
    $('viewActions').append($('resetView'));

    const connection = $('liveStatus').closest('.connection');
    if (connection) $('liveData').append(connection);

    if ($('dataSource')) $('liveData').append($('dataSource'));

    $('boundaryDisplay').append($('showHandBoundaries').closest('label'));

    $('advancedData').append($('savedCaptures'));
    $('savedFiles').closest('label').hidden = true;

    const estimateView = document.createElement('section');
    estimateView.id = 'estimateView';
    estimateView.hidden = true;

    estimateView.innerHTML =
      '<iframe title="Captured point cloud and fitted sensor geometries" sandbox="allow-scripts allow-same-origin allow-downloads"></iframe>';

    $('profileWorkspace').append(estimateView);

    const viewportTools = document.createElement('div');
    viewportTools.id = 'viewportTools';
    viewportTools.innerHTML =
      '<label><input id="handModelVisible" type="checkbox" checked> Hand model</label>';
    const legend = document.createElement('details');
    legend.id = 'pointLegend';
    legend.open = true;
    legend.innerHTML =
      '<summary>Legend</summary><span style="color:#ff766b">● Contacts</span><span style="color:#8dd3ee">● Taxel positions</span><span style="color:#b88aff">● Hand limits</span>';
    const timeline = document.createElement('section');
    timeline.id = 'historyTimeline';
    timeline.hidden = true;
    timeline.innerHTML =
      '<button id="timelinePrev" aria-label="Previous row">‹</button><label for="historyTime">History <output id="historyTimeLabel"></output></label><input id="historyTime" aria-label="History row" type="range" min="1" max="1" value="1" step="1"><button id="timelineNext" aria-label="Next row">›</button>';
    document.body.append(viewportTools, legend, timeline);

    requestAnimationFrame(() => $('resetView').click());
    $('handModelVisible').onchange = () => history.setHandVisible($('handModelVisible').checked);
    // Manual pose controls and telemetry share one Live workspace.
    $('liveData').append($('manualData'));
    const captureDetails = document.createElement('details');
    captureDetails.innerHTML = '<summary>Recordings</summary>';
    $('receivedRuns').before(captureDetails);
    captureDetails.append($('receivedRuns'));
    const layerDetails = document.createElement('details');
    layerDetails.innerHTML = '<summary>Display settings</summary>';
    $('boundaryDisplay').before(layerDetails);
    layerDetails.append($('boundaryDisplay'), $('runLayers'));
    for (const p of app.querySelectorAll(':scope > p.hint')) p.hidden = true;
    const runSettings = document.createElement('details');
    runSettings.id = 'runSettings';
    runSettings.innerHTML = '<summary>Run settings</summary>';
    $('runControls').append(runSettings);
    runSettings.append(
      $('runRegions').closest('label'),
      $('runVoxel').closest('label'),
      $('buildRun'),
      $('historyStatus'),
    );
    const activity = document.createElement('details');
    activity.innerHTML = '<summary>Status details</summary>';
    $('estimateStatus').before(activity);
    activity.append($('estimateStatus'));

    return { estimateView };
  },
};
