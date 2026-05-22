function postClearRatesToDiscord(summaryRows) {
  const config = getConfig();
  if (config.dryRun) {
    Logger.log(formatDiscordMessage(summaryRows));
    return;
  }

  requireProperty(config.discordWebhookUrl, 'DISCORD_WEBHOOK_URL');

  const payload = JSON.stringify({
    username: 'Across Clears',
    content: formatDiscordMessage(summaryRows)
  });

  let lastResponse = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    lastResponse = UrlFetchApp.fetch(config.discordWebhookUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: payload,
      muteHttpExceptions: true
    });

    const status = lastResponse.getResponseCode();
    if (status >= 200 && status < 300) return;

    if (status !== 429 || attempt === 4) break;

    Utilities.sleep(getDiscordRetryDelayMs(lastResponse, attempt));
  }

  throw new Error('Discord webhook failed ' + lastResponse.getResponseCode() + ': ' + lastResponse.getContentText());
}

function getDiscordRetryDelayMs(response, attempt) {
  const fallbackMs = Math.min(30000, attempt * 5000);
  const body = response.getContentText();

  try {
    const parsed = JSON.parse(body);
    if (parsed && parsed.retry_after) {
      return Math.ceil(Number(parsed.retry_after) * 1000) + 1000;
    }
  } catch (err) {
    // Cloudflare-style 429 pages are not JSON, so use the fallback delay.
  }

  return fallbackMs;
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
