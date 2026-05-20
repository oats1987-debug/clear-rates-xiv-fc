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
  return runClearRatesForCadence('daily');
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
          logRun('PAUSED', 'Backfill paused at ' + currentKey + ' member index ' + i + ' because FFLogs rate limit was reached');
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
    logRun('OK', 'Backfill finished ' + currentKey + ' for ' + members.length + ' members');
  } else {
    props.setProperty('BACKFILL_KEY_INDEX', String(keyIndex));
    props.setProperty('BACKFILL_MEMBER_INDEX', String(endIndex));
    logRun('OK', 'Backfill processed ' + currentKey + ' members ' + memberIndex + '-' + (endIndex - 1));
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
