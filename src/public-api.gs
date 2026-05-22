function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action || 'dashboard';
  let result;

  try {
    if (action === 'summary') {
      result = buildPublicSummaryData();
    } else if (action === 'dashboard') {
      result = buildPublicDashboardData();
    } else {
      result = { ok: false, error: 'Unknown action.' };
    }
  } catch (err) {
    result = { ok: false, error: String(err && err.message ? err.message : err) };
  }

  return publicApiOutput(result, params.callback);
}

function buildPublicSummaryData() {
  setupWorkbook();

  const config = getConfig();
  const workbook = getWorkbook();
  const snapshotSheet = getOrCreateSheet(workbook, SHEET_SNAPSHOTS, ['snapshot_date', 'encounter', 'clears', 'roster_size', 'clear_rate']);
  const snapshotValues = snapshotSheet.getDataRange().getValues();
  const encounterLabels = config.encounters.map(function(encounter) {
    return encounter.label;
  });
  const latestSnapshots = {};

  for (let i = 1; i < snapshotValues.length; i++) {
    const row = snapshotValues[i];
    const encounter = String(row[1] || '');
    if (!encounter) continue;

    latestSnapshots[encounter] = {
      date: publicDateValue(row[0]),
      encounter: encounter,
      clears: Number(row[2] || 0),
      rosterSize: Number(row[3] || 0),
      clearRate: String(row[4] || '')
    };
  }

  const summary = encounterLabels.map(function(label) {
    const snapshot = latestSnapshots[label];
    return snapshot || {
      date: todayString(),
      encounter: label,
      clears: 0,
      rosterSize: 0,
      clearRate: '0.00%'
    };
  });

  return {
    ok: true,
    fcName: config.fcName,
    generatedAt: publicDateValue(new Date()),
    summary: summary
  };
}

function buildPublicDashboardData() {
  setupWorkbook();
  rebuildCurrentState();

  const config = getConfig();
  const workbook = getWorkbook();
  const currentSheet = getOrCreateSheet(workbook, SHEET_CURRENT_STATE, ['last_seen', 'lodestone_id', 'name', 'world', 'encounter', 'cleared', 'source', 'raw_summary']);
  const snapshotSheet = getOrCreateSheet(workbook, SHEET_SNAPSHOTS, ['snapshot_date', 'encounter', 'clears', 'roster_size', 'clear_rate']);
  const stateValues = currentSheet.getDataRange().getValues();
  const snapshotValues = snapshotSheet.getDataRange().getValues();
  const encounterLabels = config.encounters.map(function(encounter) {
    return encounter.label;
  });

  const membersById = {};
  const clearsByEncounter = {};
  encounterLabels.forEach(function(label) {
    clearsByEncounter[label] = [];
  });

  for (let i = 1; i < stateValues.length; i++) {
    const row = stateValues[i];
    const lodestoneId = String(row[1] || '');
    const name = String(row[2] || '');
    const world = String(row[3] || '');
    const encounter = String(row[4] || '');
    const cleared = row[5] === true || String(row[5]).toLowerCase() === 'true';
    if (!lodestoneId || !encounter) continue;

    if (!membersById[lodestoneId]) {
      membersById[lodestoneId] = {
        lodestoneId: lodestoneId,
        name: name,
        world: world,
        clears: {}
      };
    }
    membersById[lodestoneId].clears[encounter] = cleared;

    if (cleared) {
      if (!clearsByEncounter[encounter]) clearsByEncounter[encounter] = [];
      clearsByEncounter[encounter].push({
        lodestoneId: lodestoneId,
        name: name,
        world: world,
        lastSeen: publicDateValue(row[0])
      });
    }
  }

  const members = Object.keys(membersById).map(function(id) {
    return membersById[id];
  }).sort(function(a, b) {
    return a.name.localeCompare(b.name);
  });

  const latestSnapshots = {};
  for (let j = 1; j < snapshotValues.length; j++) {
    const snapshotRow = snapshotValues[j];
    const encounterKey = String(snapshotRow[1] || '');
    if (!encounterKey) continue;
    latestSnapshots[encounterKey] = {
      date: publicDateValue(snapshotRow[0]),
      encounter: encounterKey,
      clears: Number(snapshotRow[2] || 0),
      rosterSize: Number(snapshotRow[3] || 0),
      clearRate: String(snapshotRow[4] || '')
    };
  }

  const summary = encounterLabels.map(function(label) {
    const snapshot = latestSnapshots[label];
    const clears = clearsByEncounter[label] ? clearsByEncounter[label].length : 0;
    const rosterSize = snapshot && snapshot.rosterSize ? snapshot.rosterSize : members.length;
    return {
      encounter: label,
      date: snapshot ? snapshot.date : todayString(),
      clears: snapshot ? snapshot.clears : clears,
      rosterSize: rosterSize,
      clearRate: snapshot ? snapshot.clearRate : percent(clears, rosterSize)
    };
  });

  Object.keys(clearsByEncounter).forEach(function(label) {
    clearsByEncounter[label].sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });
  });

  return {
    ok: true,
    fcName: config.fcName,
    generatedAt: publicDateValue(new Date()),
    encounters: encounterLabels,
    summary: summary,
    clearsByEncounter: clearsByEncounter,
    members: members
  };
}

function publicApiOutput(result, callback) {
  const jsonText = JSON.stringify(result);
  if (callback) {
    const safeCallback = String(callback).replace(/[^A-Za-z0-9_.$]/g, '');
    return ContentService
      .createTextOutput(safeCallback + '(' + jsonText + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(jsonText)
    .setMimeType(ContentService.MimeType.JSON);
}

function publicDateValue(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, getConfig().timezone, 'yyyy-MM-dd HH:mm:ss');
  }
  return String(value);
}
