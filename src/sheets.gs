const SHEET_ROSTER = 'Roster';
const SHEET_SNAPSHOTS = 'Snapshots';
const SHEET_EVIDENCE = 'Evidence';
const SHEET_CURRENT_STATE = 'CurrentState';
const SHEET_RUNS = 'Runs';

function setupWorkbook() {
  const workbook = getWorkbook();
  getOrCreateSheet(workbook, SHEET_ROSTER, ['snapshot_date', 'lodestone_id', 'name', 'world', 'data_center', 'rank', 'included']);
  getOrCreateSheet(workbook, SHEET_SNAPSHOTS, ['snapshot_date', 'encounter', 'clears', 'roster_size', 'clear_rate']);
  getOrCreateSheet(workbook, SHEET_EVIDENCE, ['snapshot_date', 'lodestone_id', 'name', 'world', 'encounter', 'cleared', 'source', 'raw_summary']);
  getOrCreateSheet(workbook, SHEET_CURRENT_STATE, ['last_seen', 'lodestone_id', 'name', 'world', 'encounter', 'cleared', 'source', 'raw_summary']);
  getOrCreateSheet(workbook, SHEET_RUNS, ['run_at', 'status', 'message']);
}

function writeRosterSnapshot(members) {
  const workbook = getWorkbook();
  const sheet = getOrCreateSheet(workbook, SHEET_ROSTER, ['snapshot_date', 'lodestone_id', 'name', 'world', 'data_center', 'rank', 'included']);
  const date = todayString();
  const rows = members.map(function(member) {
    return [date, member.lodestoneId, member.name, member.world, member.dataCenter, member.rank, true];
  });
  appendRows(sheet, rows);
}

function writeClearSnapshot(results, rosterSize) {
  const workbook = getWorkbook();
  const snapshotSheet = getOrCreateSheet(workbook, SHEET_SNAPSHOTS, ['snapshot_date', 'encounter', 'clears', 'roster_size', 'clear_rate']);
  const evidenceSheet = getOrCreateSheet(workbook, SHEET_EVIDENCE, ['snapshot_date', 'lodestone_id', 'name', 'world', 'encounter', 'cleared', 'source', 'raw_summary']);
  const date = todayString();

  const byEncounter = {};
  results.forEach(function(result) {
    if (!byEncounter[result.encounterLabel]) byEncounter[result.encounterLabel] = 0;
    if (result.cleared) byEncounter[result.encounterLabel] += 1;
  });

  const snapshotRows = Object.keys(byEncounter).map(function(encounter) {
    const clears = byEncounter[encounter];
    return [date, encounter, clears, rosterSize, percent(clears, rosterSize)];
  });

  const evidenceRows = results.map(function(result) {
    return [date, result.lodestoneId, result.name, result.world, result.encounterLabel, result.cleared, result.source, result.rawSummary];
  });

  appendRows(snapshotSheet, snapshotRows);
  appendRows(evidenceSheet, evidenceRows);
  rebuildCurrentState();

  return snapshotRows.map(function(row) {
    return { date: row[0], encounter: row[1], clears: row[2], rosterSize: row[3], rate: row[4] };
  });
}

function appendEvidenceResults(results) {
  if (!results.length) return;

  const workbook = getWorkbook();
  const evidenceSheet = getOrCreateSheet(workbook, SHEET_EVIDENCE, ['snapshot_date', 'lodestone_id', 'name', 'world', 'encounter', 'cleared', 'source', 'raw_summary']);
  const date = todayString();
  const evidenceRows = results.map(function(result) {
    return [date, result.lodestoneId, result.name, result.world, result.encounterLabel, result.cleared, result.source, result.rawSummary];
  });

  appendRows(evidenceSheet, evidenceRows);
  rebuildCurrentState();
}

function writeSnapshotRows(summaryRows) {
  if (!summaryRows.length) return;

  const workbook = getWorkbook();
  const snapshotSheet = getOrCreateSheet(workbook, SHEET_SNAPSHOTS, ['snapshot_date', 'encounter', 'clears', 'roster_size', 'clear_rate']);
  const rows = summaryRows.map(function(row) {
    return [row.date, row.encounter, row.clears, row.rosterSize, row.rate];
  });

  appendRows(snapshotSheet, rows);
}

function buildReportSummaryFromCurrentState(members, encounters) {
  const current = getCurrentStateMap();
  const date = todayString();

  return encounters.map(function(encounter) {
    let clears = 0;
    members.forEach(function(member) {
      const state = current[member.lodestoneId + '|' + encounter.label];
      const cleared = state && (state.cleared === true || String(state.cleared).toLowerCase() === 'true');
      if (cleared) clears++;
    });

    return {
      date: date,
      encounter: encounter.label,
      clears: clears,
      rosterSize: members.length,
      rate: percent(clears, members.length)
    };
  });
}

function getCurrentStateMap() {
  const workbook = getWorkbook();
  let sheet = workbook.getSheetByName(SHEET_CURRENT_STATE);
  if (!sheet || sheet.getLastRow() < 2) {
    rebuildCurrentState();
    sheet = workbook.getSheetByName(SHEET_CURRENT_STATE);
  }

  const values = sheet.getDataRange().getValues();
  const current = {};
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const lodestoneId = String(row[1] || '');
    const encounter = String(row[4] || '');
    if (!lodestoneId || !encounter) continue;
    current[lodestoneId + '|' + encounter] = {
      lastSeen: row[0],
      lodestoneId: lodestoneId,
      name: row[2],
      world: row[3],
      encounter: encounter,
      cleared: row[5],
      source: row[6],
      rawSummary: row[7]
    };
  }

  return current;
}

function rebuildCurrentState() {
  const workbook = getWorkbook();
  const evidenceSheet = getOrCreateSheet(workbook, SHEET_EVIDENCE, ['snapshot_date', 'lodestone_id', 'name', 'world', 'encounter', 'cleared', 'source', 'raw_summary']);
  const currentSheet = getOrCreateSheet(workbook, SHEET_CURRENT_STATE, ['last_seen', 'lodestone_id', 'name', 'world', 'encounter', 'cleared', 'source', 'raw_summary']);
  const values = evidenceSheet.getDataRange().getValues();
  const current = {};

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const lodestoneId = String(row[1] || '');
    const encounter = String(row[4] || '');
    if (!lodestoneId || !encounter) continue;

    const key = lodestoneId + '|' + encounter;
    const candidate = {
      lastSeen: row[0],
      lodestoneId: lodestoneId,
      name: row[2],
      world: row[3],
      encounter: encounter,
      cleared: row[5],
      source: row[6],
      rawSummary: row[7]
    };

    if (!current[key] || shouldReplaceCurrentState(current[key], candidate)) {
      current[key] = candidate;
    }
  }

  const rows = Object.keys(current).sort(function(a, b) {
    const left = current[a];
    const right = current[b];
    return String(left.encounter).localeCompare(String(right.encounter)) ||
      String(left.name).localeCompare(String(right.name));
  }).map(function(key) {
    const item = current[key];
    return [item.lastSeen, item.lodestoneId, item.name, item.world, item.encounter, item.cleared, item.source, item.rawSummary];
  });

  currentSheet.clearContents();
  currentSheet.getRange(1, 1, 1, 8).setValues([['last_seen', 'lodestone_id', 'name', 'world', 'encounter', 'cleared', 'source', 'raw_summary']]);
  if (rows.length) {
    currentSheet.getRange(2, 1, rows.length, 8).setValues(rows);
  }
  currentSheet.setFrozenRows(1);
}

function shouldReplaceCurrentState(existing, candidate) {
  const existingRank = evidenceStateRank(existing);
  const candidateRank = evidenceStateRank(candidate);
  if (candidateRank !== existingRank) {
    return candidateRank > existingRank;
  }
  return new Date(candidate.lastSeen).getTime() >= new Date(existing.lastSeen).getTime();
}

function evidenceStateRank(item) {
  const cleared = item.cleared === true || String(item.cleared).toLowerCase() === 'true';
  if (cleared) return 4;
  if (item.source === 'rankings-empty' || item.source === 'none') return 3;
  if (item.source === 'error') return 2;
  if (item.source === 'not-checked') return 1;
  return 0;
}

function getConfirmedClearMap() {
  const workbook = getWorkbook();
  const sheet = getOrCreateSheet(workbook, SHEET_EVIDENCE, ['snapshot_date', 'lodestone_id', 'name', 'world', 'encounter', 'cleared', 'source', 'raw_summary']);
  const values = sheet.getDataRange().getValues();
  const confirmed = {};

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const lodestoneId = String(row[1] || '');
    const encounter = String(row[4] || '');
    const cleared = row[5] === true || String(row[5]).toLowerCase() === 'true';
    if (lodestoneId && encounter && cleared) {
      confirmed[lodestoneId + '|' + encounter] = true;
    }
  }

  return confirmed;
}

function buildSnapshotResults(members, encounters, newResults, confirmedClearMap) {
  const latest = {};
  newResults.forEach(function(result) {
    latest[result.lodestoneId + '|' + result.encounterLabel] = result;
  });

  const results = [];
  members.forEach(function(member) {
    encounters.forEach(function(encounter) {
      const key = member.lodestoneId + '|' + encounter.label;
      if (latest[key]) {
        results.push(latest[key]);
      } else if (confirmedClearMap[key]) {
        results.push({
          lodestoneId: member.lodestoneId,
          name: member.name,
          world: member.world,
          encounterKey: encounter.key,
          encounterLabel: encounter.label,
          encounterId: encounter.fflogsEncounterId,
          cleared: true,
          source: 'previously-confirmed',
          rawSummary: ''
        });
      } else {
        results.push({
          lodestoneId: member.lodestoneId,
          name: member.name,
          world: member.world,
          encounterKey: encounter.key,
          encounterLabel: encounter.label,
          encounterId: encounter.fflogsEncounterId,
          cleared: false,
          source: 'not-checked',
          rawSummary: ''
        });
      }
    });
  });

  return results;
}

function appendRows(sheet, rows) {
  if (!rows.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function logRun(status, message) {
  const workbook = getWorkbook();
  const sheet = getOrCreateSheet(workbook, SHEET_RUNS, ['run_at', 'status', 'message']);
  sheet.appendRow([new Date(), status, message || '']);
}
