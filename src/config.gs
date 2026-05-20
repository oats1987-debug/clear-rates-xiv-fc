const DEFAULT_CONFIG = {
  fcLodestoneId: '9236460623271944812',
  fcName: 'Across',
  timezone: 'America/Los_Angeles',
  lodestoneBaseUrl: 'https://na.finalfantasyxiv.com',
  fflogsTokenUrl: 'https://www.fflogs.com/oauth/token',
  fflogsApiUrl: 'https://www.fflogs.com/api/v2/client',
  fflogsServerRegion: 'NA',
  minRequestDelayMs: 2000,
  cacheSeconds: 21600,
  includeRanks: [],
  excludeCharacterIds: [],
  encounters: [
    { key: 'M9S', label: 'M9S', source: 'fflogs', fflogsEncounterIds: [101], difficulty: 101, cadence: 'daily' },
    { key: 'M10S', label: 'M10S', source: 'fflogs', fflogsEncounterIds: [102], difficulty: 101, cadence: 'daily' },
    { key: 'M11S', label: 'M11S', source: 'fflogs', fflogsEncounterIds: [103], difficulty: 101, cadence: 'daily' },
    { key: 'M12S', label: 'M12S', source: 'fflogs', fflogsEncounterIds: [105], difficulty: 101, cadence: 'daily' },

    { key: 'FRU', label: 'FRU', source: 'fflogs', fflogsEncounterIds: [1079], fflogsPartitions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30], difficulty: 100, cadence: 'daily' },

    { key: 'UCOB', label: 'UCOB', source: 'fflogs', fflogsEncounterIds: [1047, 1060, 1073], fflogsPartitions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42], difficulty: 100, cadence: 'weekly' },
    { key: 'UWU', label: 'UWU', source: 'fflogs', fflogsEncounterIds: [1048, 1061, 1074], fflogsPartitions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42], difficulty: 100, cadence: 'weekly' },
    { key: 'TEA', label: 'TEA', source: 'fflogs', fflogsEncounterIds: [1050, 1062, 1075], fflogsPartitions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42], difficulty: 100, cadence: 'weekly' },
    { key: 'DSR', label: 'DSR', source: 'fflogs', fflogsEncounterIds: [1065, 1076], fflogsPartitions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42], difficulty: 100, cadence: 'weekly' },
    { key: 'TOP', label: 'TOP', source: 'fflogs', fflogsEncounterIds: [1068, 1077], fflogsPartitions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42], difficulty: 100, cadence: 'weekly' }
  ]
};

function getConfig() {
  const props = PropertiesService.getScriptProperties();
  const config = Object.assign({}, DEFAULT_CONFIG);

  config.fcLodestoneId = props.getProperty('FC_LODESTONE_ID') || config.fcLodestoneId;
  config.sheetId = props.getProperty('SHEET_ID') || '';
  config.dryRun = String(props.getProperty('DRY_RUN') || '').toLowerCase() === 'true';
  config.fflogsClientId = props.getProperty('FFLOGS_CLIENT_ID') || '';
  config.fflogsClientSecret = props.getProperty('FFLOGS_CLIENT_SECRET') || '';
  config.discordWebhookUrl = props.getProperty('DISCORD_WEBHOOK_URL') || '';

  return config;
}
