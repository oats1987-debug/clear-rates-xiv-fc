function fetchLodestoneRoster() {
  const config = getConfig();
  const members = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const url = config.lodestoneBaseUrl + '/lodestone/freecompany/' + config.fcLodestoneId + '/member/' + (page > 1 ? '?page=' + page : '');
    const html = fetchText(url, {}, 'lodestone-roster-' + config.fcLodestoneId + '-page-' + page);
    members.push.apply(members, parseLodestoneRosterPage(html));
    hasNext = html.indexOf('member/?page=' + (page + 1)) !== -1;
    page += 1;
    sleepBetweenRequests();
  }

  return filterRoster(dedupeMembers(members));
}

function parseLodestoneRosterPage(html) {
  const members = [];
  const pattern = /<li class="entry"><a href="\/lodestone\/character\/(\d+)\/" class="entry__bg">[\s\S]*?<p class="entry__name">([\s\S]*?)<\/p><p class="entry__world">[\s\S]*?<\/i>([\s\S]*?) \[([\s\S]*?)\]<\/p>[\s\S]*?<span>([\s\S]*?)<\/span>/g;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    members.push({
      lodestoneId: match[1],
      name: htmlDecode(match[2]).trim(),
      world: htmlDecode(match[3]).trim(),
      dataCenter: htmlDecode(match[4]).trim(),
      rank: htmlDecode(match[5]).trim()
    });
  }

  return members;
}

function dedupeMembers(members) {
  const seen = {};
  return members.filter(function(member) {
    if (seen[member.lodestoneId]) return false;
    seen[member.lodestoneId] = true;
    return true;
  });
}

function filterRoster(members) {
  const config = getConfig();
  const includeRanks = config.includeRanks || [];
  const excludeIds = {};
  (config.excludeCharacterIds || []).forEach(function(id) {
    excludeIds[String(id)] = true;
  });

  return members.filter(function(member) {
    if (excludeIds[member.lodestoneId]) return false;
    if (includeRanks.length && includeRanks.indexOf(member.rank) === -1) return false;
    return true;
  });
}

function fetchText(url, options, cacheKey) {
  const config = getConfig();
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const response = UrlFetchApp.fetch(url, Object.assign({
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      'User-Agent': 'ClearRatesXIVFC/1.0'
    }
  }, options || {}));

  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('Fetch failed ' + status + ' for ' + url + ': ' + response.getContentText().slice(0, 500));
  }

  const text = response.getContentText();
  if (text.length < 90000) {
    cache.put(cacheKey, text, config.cacheSeconds);
  }
  return text;
}

function fetchLodestoneAchievementClear(member, encounter) {
  if (!encounter.achievementId) {
    throw new Error('Missing Lodestone achievementId for ' + encounter.label);
  }

  const config = getConfig();
  const url = config.lodestoneBaseUrl + '/lodestone/character/' + member.lodestoneId + '/achievement/detail/' + encounter.achievementId + '/';
  const html = fetchText(url, {}, 'lodestone-achievement-' + member.lodestoneId + '-' + encounter.achievementId);
  const cleared = html.indexOf('achievement__view--complete') !== -1 || html.indexOf('achievement__base--complete') !== -1;
  const hiddenOrMissing = html.indexOf('show_achievement = false') !== -1 && !cleared;

  return {
    lodestoneId: member.lodestoneId,
    name: member.name,
    world: member.world,
    encounterKey: encounter.key,
    encounterLabel: encounter.label,
    encounterId: encounter.achievementId,
    cleared: cleared,
    source: cleared ? 'lodestone-achievement' : (hiddenOrMissing ? 'lodestone-hidden-or-missing' : 'lodestone-not-complete'),
    rawSummary: cleared ? 'achievementId=' + encounter.achievementId : ''
  };
}

function fetchLodestoneAchievementClears(member, encounters) {
  return encounters.map(function(encounter) {
    return fetchLodestoneAchievementClear(member, encounter);
  });
}
