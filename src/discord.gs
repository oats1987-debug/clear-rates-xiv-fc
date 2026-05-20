function postClearRatesToDiscord(summaryRows) {
  const config = getConfig();
  if (config.dryRun) {
    Logger.log(formatDiscordMessage(summaryRows));
    return;
  }

  requireProperty(config.discordWebhookUrl, 'DISCORD_WEBHOOK_URL');

  const response = UrlFetchApp.fetch(config.discordWebhookUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      username: 'Across Clears',
      content: formatDiscordMessage(summaryRows)
    }),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('Discord webhook failed ' + status + ': ' + response.getContentText());
  }
}

function formatDiscordMessage(summaryRows) {
  const date = todayString();
  const lines = [
    ':white_check_mark: **Across Clear Rates: ' + date + '**',
    '```',
    pad('Encounter', 10) + '  ' + pad('FC clear rate', 15) + '  FC clears',
    pad('----------', 10) + '  ' + pad('---------------', 15) + '  ---------'
  ];

  summaryRows.forEach(function(row) {
    lines.push(pad(row.encounter, 10) + '  ' + pad(row.rate, 15) + '  ' + row.clears + ' / ' + row.rosterSize);
  });

  lines.push('```');
  return lines.join('\n');
}

function pad(value, length) {
  value = String(value);
  while (value.length < length) value += ' ';
  return value;
}
