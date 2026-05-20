function getFflogsAccessToken() {
  const config = getConfig();
  requireProperty(config.fflogsClientId, 'FFLOGS_CLIENT_ID');
  requireProperty(config.fflogsClientSecret, 'FFLOGS_CLIENT_SECRET');

  const cache = CacheService.getScriptCache();
  const cached = cache.get('fflogs-access-token');
  if (cached) return cached;

  const basic = Utilities.base64Encode(config.fflogsClientId + ':' + config.fflogsClientSecret);
  const response = UrlFetchApp.fetch(config.fflogsTokenUrl, {
    method: 'post',
    payload: { grant_type: 'client_credentials' },
    muteHttpExceptions: true,
    headers: { Authorization: 'Basic ' + basic }
  });

  const status = response.getResponseCode();
  const text = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error('FFLogs token request failed ' + status + ': ' + text);
  }

  const data = JSON.parse(text);
  cache.put('fflogs-access-token', data.access_token, Math.max(60, Number(data.expires_in || 3600) - 120));
  return data.access_token;
}

function fflogsGraphql(query, variables, cacheKey) {
  const config = getConfig();
  const cache = CacheService.getScriptCache();
  if (cacheKey && cacheKey.length < 240) {
    const cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  const response = UrlFetchApp.fetch(config.fflogsApiUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ query: query, variables: variables || {} }),
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + getFflogsAccessToken() }
  });

  const status = response.getResponseCode();
  const text = response.getContentText();

  if (status === 429) {
    throw new Error('FFLOGS_RATE_LIMIT: ' + text);
  }

  if (status < 200 || status >= 300) {
    throw new Error('FFLogs GraphQL request failed ' + status + ': ' + text);
  }

  const data = JSON.parse(text);
  if (data.errors && data.errors.length) {
    throw new Error('FFLogs GraphQL error: ' + JSON.stringify(data.errors));
  }

  if (cacheKey && cacheKey.length < 240) {
    cache.put(cacheKey, JSON.stringify(data), getConfig().cacheSeconds);
  }
  return data;
}

function fetchCharacterEncounterClear(member, encounter) {
  if (encounter.fflogsPartitions && encounter.fflogsPartitions.length) {
    return fetchCharacterEncounterClearChunked(member, encounter);
  }
  return fetchCharacterAllEncounterClears(member, [encounter])[0];
}

function fetchCharacterEncounterClearChunked(member, encounter) {
  const partitions = getPartitions(encounter);
  const chunkSize = Number(encounter.partitionChunkSize || 6);

  for (let i = 0; i < partitions.length; i += chunkSize) {
    const chunk = partitions.slice(i, i + chunkSize);
    const chunkEncounter = Object.assign({}, encounter, { fflogsPartitions: chunk });
    const result = fetchCharacterAllEncounterClears(member, [chunkEncounter])[0];

    if (result.cleared) {
      return result;
    }

    if (result.source === 'error') {
      return result;
    }
  }

  return {
    lodestoneId: member.lodestoneId,
    name: member.name,
    world: member.world,
    encounterKey: encounter.key,
    encounterLabel: encounter.label,
    encounterId: getEncounterIds(encounter).join(','),
    cleared: false,
    source: 'rankings-empty',
    rawSummary: 'all partition chunks checked'
  };
}

function getEncounterIds(encounter) {
  if (encounter.fflogsEncounterIds && encounter.fflogsEncounterIds.length) {
    return encounter.fflogsEncounterIds;
  }
  if (encounter.fflogsEncounterId) {
    return [encounter.fflogsEncounterId];
  }
  return [];
}

function getPartitions(encounter) {
  if (encounter.fflogsPartitions && encounter.fflogsPartitions.length) {
    return encounter.fflogsPartitions;
  }
  return [null];
}

function fetchCharacterAllEncounterClears(member, encounters) {
  const config = getConfig();
  const fieldMap = [];
  const encounterFields = [];

  encounters.forEach(function(encounter, encounterIndex) {
    const ids = getEncounterIds(encounter);
    const partitions = getPartitions(encounter);
    assertFflogsEncounter(encounter, ids);

    ids.forEach(function(id, idIndex) {
      partitions.forEach(function(partition, partitionIndex) {
        const alias = 'e' + encounterIndex + '_' + idIndex + '_' + partitionIndex;
        const partitionArg = partition ? ', partition: ' + partition : '';

        fieldMap.push({
          alias: alias,
          encounter: encounter,
          encounterId: id,
          partition: partition
        });

        encounterFields.push(alias + ': encounterRankings(encounterID: ' + id + ', difficulty: ' + encounter.difficulty + ', metric: dps' + partitionArg + ')');
      });
    });
  });

  const query =
    'query CharacterEncounters($name: String!, $serverSlug: String!, $serverRegion: String!) {' +
    '  characterData {' +
    '    character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {' +
    '      id canonicalID lodestoneID ' + encounterFields.join(' ') +
    '    }' +
    '  }' +
    '}';

  const variables = {
    name: member.name,
    serverSlug: member.world,
    serverRegion: config.fflogsServerRegion
  };

  const cacheKey = ['fflogs', member.lodestoneId, encounters.map(function(e) {
    return e.key + '-' + getEncounterIds(e).join('_') + '-p' + getPartitions(e).join('_');
  }).join(',')].join(':');

  const data = fflogsGraphql(query, variables, cacheKey);
  const character = data.data && data.data.characterData && data.data.characterData.character;

  return encounters.map(function(encounter) {
    const matchingFields = fieldMap.filter(function(field) {
      return field.encounter.key === encounter.key;
    });

    let bestEvidence = { cleared: false, source: 'none', rawSummary: '' };
    let bestEncounterId = getEncounterIds(encounter)[0] || '';

    matchingFields.forEach(function(field) {
      const rankings = character && character[field.alias];
      const evidence = summarizeRankingEvidence(rankings);
      if (evidence.cleared && !bestEvidence.cleared) {
        bestEvidence = evidence;
        bestEncounterId = field.encounterId + (field.partition ? '/p' + field.partition : '');
      }
    });

    return {
      lodestoneId: member.lodestoneId,
      name: member.name,
      world: member.world,
      encounterKey: encounter.key,
      encounterLabel: encounter.label,
      encounterId: bestEncounterId,
      cleared: bestEvidence.cleared,
      source: bestEvidence.source,
      rawSummary: bestEvidence.rawSummary
    };
  });
}

function assertFflogsEncounter(encounter, ids) {
  if (!ids.length || !encounter.difficulty) {
    throw new Error('Encounter is missing fflogsEncounterIds or difficulty: ' + JSON.stringify(encounter));
  }

  ids.forEach(function(id) {
    if (!/^\d+$/.test(String(id)) || !/^\d+$/.test(String(encounter.difficulty))) {
      throw new Error('Encounter IDs and difficulties must be numeric: ' + JSON.stringify(encounter));
    }
  });
}

function makeErrorResultsForMember(member, encounters, error) {
  const message = error && error.message ? error.message : String(error);
  return encounters.map(function(encounter) {
    return {
      lodestoneId: member.lodestoneId,
      name: member.name,
      world: member.world,
      encounterKey: encounter.key,
      encounterLabel: encounter.label,
      encounterId: getEncounterIds(encounter).join(','),
      cleared: false,
      source: 'error',
      rawSummary: message.slice(0, 300)
    };
  });
}

function summarizeRankingEvidence(rankings) {
  if (!rankings) {
    return { cleared: false, source: 'none', rawSummary: '' };
  }

  if (typeof rankings === 'string') {
    try {
      rankings = JSON.parse(rankings);
    } catch (err) {
      return { cleared: false, source: 'unparsed', rawSummary: rankings.slice(0, 300) };
    }
  }

  const totalKills = Number(rankings.totalKills || rankings.totalKillsAllStars || 0);
  if (totalKills > 0) {
    return { cleared: true, source: 'totalKills', rawSummary: JSON.stringify({ totalKills: totalKills }) };
  }

  const ranks = rankings.ranks || rankings.rankings || rankings.bestPerformanceAverage;
  if (Array.isArray(ranks) && ranks.length > 0) {
    return { cleared: true, source: 'ranks', rawSummary: JSON.stringify({ ranks: ranks.length }) };
  }

  const hasBestAmount = Number(rankings.bestAmount || 0) > 0;
  if (hasBestAmount) {
    return { cleared: true, source: 'bestAmount', rawSummary: JSON.stringify({ bestAmount: rankings.bestAmount }) };
  }

  return { cleared: false, source: 'rankings-empty', rawSummary: JSON.stringify(rankings).slice(0, 300) };
}
