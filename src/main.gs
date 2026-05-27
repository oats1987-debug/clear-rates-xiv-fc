function setupWorkbookAndRoster() {
  setupWorkbook();
  refreshRoster();
}

function checkSetup() {
  const config = getConfig();
  const checks = [
    ['FFLOGS_CLIENT_ID', Boolean(config.fflogsClientId)],
    ['FFLOGS_CLIENT_SECRET', Boolean(config.fflogsClientSecret)],
    ['DISCORD_WEBHOOK_URL', Boolean(config.discordWebhookUrl) || config.dryRun],
    ['FC_LODESTONE_ID', Boolean(config.fcLodestoneId)],
    ['encounters', Boolean(config.encounters && config.encounters.length)]
  ];

  const missing = checks.filter(function(check) {
    return !check[1];
  }).map(function(check) {
    return check[0];
  });

  const roster = fetchLodestoneRoster();
  const result = {
    ok: missing.length === 0 && roster.length > 0,
    missing: missing,
    rosterCount: roster.length,
    dryRun: config.dryRun
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function refreshRoster() {
  const members = fetchLodestoneRoster();
  writeRosterSnapshot(members);
  logRun('OK', 'Roster refreshed: ' + members.length + ' members');
  return members;
}

function runDailyClearRates() {
  return postCurrentClearRatesReport();
}

function runWeeklyClearRates() {
  return runClearRatesForCadence('weekly');
}

function runClearRatesForCadence(cadence) {
  try {
    setupWorkbook();
    const config = getConfig();
    const allEncounters = config.encounters;
    const encountersToCheck = allEncounters.filter(function(encounter) {
      return (encounter.cadence || 'daily') === cadence;
    });
    const members = fetchLodestoneRoster();
    const confirmedClearMap = getConfirmedClearMap();
    writeRosterSnapshot(members);

    const newResults = [];
    members.forEach(function(member) {
      const remainingEncounters = encountersToCheck.filter(function(encounter) {
        return !confirmedClearMap[member.lodestoneId + '|' + encounter.label];
      });
      if (!remainingEncounters.length) return;

      try {
        newResults.push.apply(newResults, fetchMemberEncounterClears(member, remainingEncounters));
      } catch (err) {
        newResults.push.apply(newResults, makeErrorResultsForMember(member, remainingEncounters, err));
      }
      sleepBetweenRequests();
    });

    const snapshotResults = buildSnapshotResults(members, allEncounters, newResults, confirmedClearMap);
    const summaryRows = writeClearSnapshot(snapshotResults, members.length);
    postClearRatesToDiscord(summaryRows);
    logRun('OK', 'Posted ' + cadence + ' clear rates for ' + members.length + ' members, checked ' + encountersToCheck.length + ' encounters');
    return summaryRows;
  } catch (err) {
    logRun('ERROR', err && err.stack ? err.stack : String(err));
    throw err;
  }
}

function previewDiscordMessage() {
  const members = fetchLodestoneRoster();
  const fakeRows = getConfig().encounters.map(function(encounter) {
    return {
      date: todayString(),
      encounter: encounter.label,
      clears: 0,
      rosterSize: members.length,
      rate: percent(0, members.length)
    };
  });
  Logger.log(formatDiscordMessage(fakeRows));
  return formatDiscordMessage(fakeRows);
}

function collectMissingClearUpdates() {
  return collectMissingClearUpdatesForKeys({
    keys: getConfig().encounters.map(function(encounter) { return encounter.key; }),
    cursorPrefix: 'UPDATE',
    batchSizeProperty: 'UPDATE_BATCH_SIZE',
    defaultBatchSize: 10,
    logLabel: 'Update'
  });
}

function collectDailyPriorityClearUpdates() {
  return collectMissingClearUpdatesForKeys({
    keys: ['M9S', 'M10S', 'M11S', 'M12S', 'FRU'],
    cursorPrefix: 'DAILY_PRIORITY',
    batchSizeProperty: 'DAILY_PRIORITY_BATCH_SIZE',
    defaultBatchSize: 30,
    logLabel: 'Daily priority update'
  });
}

function collectMondayUltimateUpdates() {
  return collectUltimateUpdatesForKey('UCOB');
}

function collectTuesdayUltimateUpdates() {
  return collectUltimateUpdatesForKey('UWU');
}

function collectWednesdayUltimateUpdates() {
  return collectUltimateUpdatesForKey('TEA');
}

function collectThursdayUltimateUpdates() {
  return collectUltimateUpdatesForKey('DSR');
}

function collectFridayUltimateUpdates() {
  return collectUltimateUpdatesForKey('TOP');
}

function collectScheduledUltimateUpdates() {
  const scheduledKey = getScheduledUltimateKey_();
  if (!scheduledKey) {
    return { skipped: true };
  }
  return collectUltimateUpdatesForKey(scheduledKey);
}

function getScheduledUltimateKey_() {
  const config = getConfig();
  const props = PropertiesService.getScriptProperties();
  const now = new Date();
  const day = Utilities.formatDate(now, config.timezone, 'EEE').toUpperCase();
  const hour = Number(Utilities.formatDate(now, config.timezone, 'H'));
  const startHour = Number(props.getProperty('ULTIMATE_WINDOW_START_HOUR') || 0);
  const endHour = Number(props.getProperty('ULTIMATE_WINDOW_END_HOUR') || 8);

  if (hour < startHour || hour >= endHour) {
    return '';
  }

  const schedule = {
    MON: 'UCOB',
    TUE: 'UWU',
    WED: 'TEA',
    THU: 'DSR',
    FRI: 'TOP'
  };

  return schedule[day] || '';
}

function collectUltimateUpdatesForKey(key) {
  return collectMissingClearUpdatesForKeys({
    keys: [key],
    cursorPrefix: 'ULT_' + key,
    batchSizeProperty: 'ULTIMATE_BATCH_SIZE',
    defaultBatchSize: 10,
    logLabel: key + ' rolling update'
  });
}

function collectMissingClearUpdatesForKeys(options) {
  const config = getConfig();
  const props = PropertiesService.getScriptProperties();
  const keys = options.keys;
  const cursorPrefix = options.cursorPrefix;
  const keyIndexProperty = cursorPrefix + '_KEY_INDEX';
  const memberIndexProperty = cursorPrefix + '_MEMBER_INDEX';
  const batchSize = Number(props.getProperty(options.batchSizeProperty) || props.getProperty('BACKFILL_BATCH_SIZE') || options.defaultBatchSize || 10);
  const maxRuntimeMs = Number(props.getProperty('COLLECTOR_MAX_RUNTIME_MS') || options.maxRuntimeMs || 300000);
  const minCheckTimeMs = Number(props.getProperty('COLLECTOR_MIN_CHECK_TIME_MS') || options.minCheckTimeMs || 90000);
  const deadlineMs = Date.now() + maxRuntimeMs;
  let keyIndex = Number(props.getProperty(keyIndexProperty) || 0);
  let memberIndex = Number(props.getProperty(memberIndexProperty) || 0);

  if (keyIndex >= keys.length) {
    keyIndex = 0;
    memberIndex = 0;
    props.setProperty(keyIndexProperty, '0');
    props.setProperty(memberIndexProperty, '0');
  }

  setupWorkbook();

  const members = fetchLodestoneRoster();
  const confirmedClearMap = getConfirmedClearMap();
  const newResults = [];
  let attempts = 0;
  let processed = 0;

  while (keyIndex < keys.length) {
    const currentKey = keys[keyIndex];
    const encounter = config.encounters.filter(function(item) {
      return item.key === currentKey;
    })[0];
    if (!encounter) {
      throw new Error('Missing encounter for update key: ' + currentKey);
    }

    const startedAtMemberIndex = memberIndex;

    while (memberIndex < members.length) {
      if (Date.now() >= deadlineMs) {
        appendEvidenceResults(newResults);
        props.setProperty(keyIndexProperty, String(keyIndex));
        props.setProperty(memberIndexProperty, String(memberIndex));
        logRun('PAUSED', withFflogsQuota(options.logLabel + ' paused before timeout at ' + currentKey + ' member index ' + memberIndex + ' after ' + attempts + ' FFLogs checks'));
        return { paused: true, reason: 'time-limit', key: currentKey, memberIndex: memberIndex, processed: processed, attempts: attempts };
      }

      if (attempts >= batchSize) {
        appendEvidenceResults(newResults);
        props.setProperty(keyIndexProperty, String(keyIndex));
        props.setProperty(memberIndexProperty, String(memberIndex));
        logRun('OK', withFflogsQuota(options.logLabel + ' processed ' + currentKey + ' members ' + startedAtMemberIndex + '-' + (memberIndex - 1) + ' with ' + attempts + ' FFLogs checks'));
        return { key: currentKey, processed: processed, attempts: attempts };
      }

      const member = members[memberIndex];
      const confirmedKey = member.lodestoneId + '|' + encounter.label;
      if (confirmedClearMap[confirmedKey]) {
        memberIndex++;
        processed++;
        continue;
      }

      if (Date.now() + minCheckTimeMs >= deadlineMs) {
        appendEvidenceResults(newResults);
        props.setProperty(keyIndexProperty, String(keyIndex));
        props.setProperty(memberIndexProperty, String(memberIndex));
        logRun('PAUSED', withFflogsQuota(options.logLabel + ' paused before starting another FFLogs check at ' + currentKey + ' member index ' + memberIndex + ' to avoid timeout'));
        return { paused: true, reason: 'time-buffer', key: currentKey, memberIndex: memberIndex, processed: processed, attempts: attempts };
      }

      try {
        newResults.push(fetchCharacterEncounterClear(member, encounter));
        attempts++;
      } catch (err) {
        if (String(err.message || err).indexOf('FFLOGS_RATE_LIMIT') !== -1) {
          appendEvidenceResults(newResults);
          props.setProperty(keyIndexProperty, String(keyIndex));
          props.setProperty(memberIndexProperty, String(memberIndex));
          logRun('PAUSED', withFflogsQuota(options.logLabel + ' paused at ' + currentKey + ' member index ' + memberIndex + ' because FFLogs rate limit was reached'));
          return { paused: true, reason: 'rate-limit', key: currentKey, memberIndex: memberIndex, processed: processed, attempts: attempts };
        }
        newResults.push(makeErrorResultsForMember(member, [encounter], err)[0]);
        attempts++;
      }
      memberIndex++;
      processed++;
      sleepBetweenRequests();
    }

    appendEvidenceResults(newResults);
    newResults.length = 0;
    logRun('OK', withFflogsQuota(options.logLabel + ' finished ' + currentKey + ' for ' + members.length + ' members with ' + attempts + ' FFLogs checks this run'));
    props.setProperty(keyIndexProperty, String(keyIndex + 1));
    props.setProperty(memberIndexProperty, '0');
    keyIndex++;
    memberIndex = 0;
  }

  appendEvidenceResults(newResults);
  props.setProperty(keyIndexProperty, '0');
  props.setProperty(memberIndexProperty, '0');
  logRun('OK', withFflogsQuota(options.logLabel + ' completed all configured fights with ' + attempts + ' FFLogs checks this run'));
  return { complete: true, processed: processed, attempts: attempts };
}

function postCurrentClearRatesReport() {
  try {
    setupWorkbook();
    const config = getConfig();
    const members = fetchLodestoneRoster();
    writeRosterSnapshot(members);
    rebuildCurrentState();

    const summaryRows = buildReportSummaryFromCurrentState(members, config.encounters);
    writeSnapshotRows(summaryRows);
    savePublicSummaryData(summaryRows);
    postClearRatesToDiscord(summaryRows);
    logRun('OK', 'Posted current-state clear rates for ' + members.length + ' members');
    return summaryRows;
  } catch (err) {
    logRun('ERROR', err && err.stack ? err.stack : String(err));
    throw err;
  }
}

function resetUpdateCursor() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('UPDATE_KEY_INDEX');
  props.deleteProperty('UPDATE_MEMBER_INDEX');
  props.deleteProperty('DAILY_PRIORITY_KEY_INDEX');
  props.deleteProperty('DAILY_PRIORITY_MEMBER_INDEX');
  ['M9S', 'M10S', 'M11S', 'M12S', 'FRU'].forEach(function(key) {
    props.deleteProperty('DAILY_' + key + '_KEY_INDEX');
    props.deleteProperty('DAILY_' + key + '_MEMBER_INDEX');
  });
  ['UCOB', 'UWU', 'TEA', 'DSR', 'TOP'].forEach(function(key) {
    props.deleteProperty('ULT_' + key + '_KEY_INDEX');
    props.deleteProperty('ULT_' + key + '_MEMBER_INDEX');
  });
  Logger.log('Update cursor reset.');
}

function fetchMemberEncounterClears(member, encounters) {
  return fetchCharacterAllEncounterClears(member, encounters);
}

function testFflogsOneCharacter() {
  const roster = fetchLodestoneRoster();
  if (!roster.length) throw new Error('No roster members found.');
  const encounter = getConfig().encounters[0];
  const result = fetchCharacterEncounterClear(roster[0], encounter);
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function backfillUltimateClears() {
  const config = getConfig();
  const props = PropertiesService.getScriptProperties();
  const keys = ['M9S', 'M10S', 'M11S', 'M12S', 'FRU', 'UCOB', 'UWU', 'TEA', 'DSR', 'TOP'];
  const batchSize = Number(props.getProperty('BACKFILL_BATCH_SIZE') || 5);
  const keyIndex = Number(props.getProperty('BACKFILL_KEY_INDEX') || 0);
  const memberIndex = Number(props.getProperty('BACKFILL_MEMBER_INDEX') || 0);
  const currentKey = keys[keyIndex];

  if (!currentKey) {
    Logger.log('Backfill complete.');
    logRun('OK', 'Ultimate backfill already complete');
    return { complete: true };
  }

  setupWorkbook();
  const encounter = config.encounters.filter(function(item) {
    return item.key === currentKey;
  })[0];
  if (!encounter) {
    throw new Error('Missing encounter for backfill key: ' + currentKey);
  }

  const members = fetchLodestoneRoster();
  const confirmedClearMap = getConfirmedClearMap();
  const endIndex = Math.min(memberIndex + batchSize, members.length);
  const newResults = [];
  let processed = 0;

  for (let i = memberIndex; i < endIndex; i++) {
    const member = members[i];
    const confirmedKey = member.lodestoneId + '|' + encounter.label;
    if (!confirmedClearMap[confirmedKey]) {
      try {
        newResults.push(fetchCharacterEncounterClear(member, encounter));
      } catch (err) {
        if (String(err.message || err).indexOf('FFLOGS_RATE_LIMIT') !== -1) {
          writeClearSnapshot(buildSnapshotResults(members, [encounter], newResults, confirmedClearMap), members.length);
          logRun('PAUSED', withFflogsQuota('Backfill paused at ' + currentKey + ' member index ' + i + ' because FFLogs rate limit was reached'));
          Logger.log('Backfill paused at ' + currentKey + ' member index ' + i + '. Run again after FFLogs quota resets.');
          return { paused: true, key: currentKey, memberIndex: i };
        }
        newResults.push(makeErrorResultsForMember(member, [encounter], err)[0]);
      }
      sleepBetweenRequests();
    }
    processed++;
  }

  const snapshotResults = buildSnapshotResults(members, [encounter], newResults, confirmedClearMap);
  writeClearSnapshot(snapshotResults, members.length);

  if (endIndex >= members.length) {
    props.setProperty('BACKFILL_KEY_INDEX', String(keyIndex + 1));
    props.setProperty('BACKFILL_MEMBER_INDEX', '0');
    logRun('OK', withFflogsQuota('Backfill finished ' + currentKey + ' for ' + members.length + ' members'));
  } else {
    props.setProperty('BACKFILL_KEY_INDEX', String(keyIndex));
    props.setProperty('BACKFILL_MEMBER_INDEX', String(endIndex));
    logRun('OK', withFflogsQuota('Backfill processed ' + currentKey + ' members ' + memberIndex + '-' + (endIndex - 1)));
  }

  Logger.log(JSON.stringify({
    key: currentKey,
    processed: processed,
    nextKeyIndex: props.getProperty('BACKFILL_KEY_INDEX'),
    nextMemberIndex: props.getProperty('BACKFILL_MEMBER_INDEX')
  }, null, 2));

  return { key: currentKey, processed: processed };
}

function resetUltimateBackfill() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('BACKFILL_KEY_INDEX');
  props.deleteProperty('BACKFILL_MEMBER_INDEX');
  Logger.log('Ultimate backfill cursor reset.');
}

function getFflogsRateLimitSummary() {
  const query =
    'query {' +
    '  rateLimitData {' +
    '    limitPerHour' +
    '    pointsSpentThisHour' +
    '    pointsResetIn' +
    '  }' +
    '}';

  try {
    const data = fflogsGraphql(query, {}, '');
    return data.data.rateLimitData;
  } catch (err) {
    return { error: String(err.message || err).slice(0, 200) };
  }
}

function withFflogsQuota(message) {
  const quota = getFflogsRateLimitSummary();
  if (quota.error) {
    return message + ' | FFLogs quota unavailable: ' + quota.error;
  }

  const remaining = Number(quota.limitPerHour || 0) - Number(quota.pointsSpentThisHour || 0);
  return message + ' | FFLogs quota remaining: ' + remaining + '/' + quota.limitPerHour + ', resets in ' + quota.pointsResetIn + 's';
}
