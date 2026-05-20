# Clear Rates XIV FC

Google Apps Script project for posting FFXIV Free Company clear-rate snapshots to Discord.

The first version uses:

- Lodestone for the official FC roster.
- FFLogs for per-encounter public clear evidence.
- Google Sheets for record keeping.
- Discord webhooks for posting the clear-rate table.

## What You Need To Provide

Create these Apps Script script properties:

| Property | Purpose |
| --- | --- |
| `FFLOGS_CLIENT_ID` | FFLogs API client id |
| `FFLOGS_CLIENT_SECRET` | FFLogs API client secret |
| `DISCORD_WEBHOOK_URL` | Discord channel webhook URL |

Optional properties:

| Property | Purpose |
| --- | --- |
| `FC_LODESTONE_ID` | Defaults to Across: `9236460623271944812` |
| `SHEET_ID` | If omitted, uses the active spreadsheet |
| `DRY_RUN` | Set to `true` to skip Discord posting |

## Setup

1. Create a Google Sheet.
2. Open Extensions > Apps Script.
3. Add the files from `src/` to the Apps Script project.
4. Add the script properties listed above.
5. Run `checkSetup`.
6. Run `setupWorkbook`.
7. Run `refreshRoster`.
8. Run `previewDiscordMessage`.
9. Run `testFflogsOneCharacter`.
10. Run `testFflogsOneCharacter`.
11. Run `resetUltimateBackfill`.
12. Create an hourly time-driven trigger for `backfillUltimateClears`.

## First Validation

Run these in order:

| Function | Expected result |
| --- | --- |
| `checkSetup` | Shows missing properties, dry-run state, and roster count |
| `refreshRoster` | Writes current Lodestone members to `Roster` |
| `previewDiscordMessage` | Logs the Discord message format without FFLogs |
| `testFflogsOneCharacter` | Confirms FFLogs credentials, schema, and current savage encounter IDs |
| `backfillUltimateClears` | Slowly fills missing clear evidence in small batches |

Do not schedule `runDailyClearRates` until `testFflogsOneCharacter` returns a sensible result.

## Current Plan

The project is now using a backfill-first model.

1. `backfillUltimateClears` is the collector. It checks a small batch of members for one fight at a time, saves confirmed clears to `Evidence`, and stores its cursor in script properties.
2. Once backfill has good coverage, reports should become read-mostly: collect in small batches first, then post summaries from existing evidence.
3. Keep daily/weekly report triggers disabled while the initial backfill is running so they do not compete for FFLogs quota.

Recommended script properties during backfill:

| Property | Suggested value | Purpose |
| --- | --- | --- |
| `BACKFILL_BATCH_SIZE` | `10` | Number of roster members to process per run |
| `DRY_RUN` | `false` or `true` | Controls Discord posting for report functions only |

Recommended temporary trigger:

| Function | Schedule |
| --- | --- |
| `backfillUltimateClears` | Hourly |

When the backfill is complete, remove the hourly backfill trigger and restore reporting triggers.

## Important Notes

Lodestone achievements are not enough for per-floor savage rates because most savage tiers only expose an achievement for the final floor/tier completion. FFLogs is therefore the source for clear evidence.

FFLogs encounter IDs and historical partition lists are configured in `src/config.gs`. Verify IDs and partitions in the FFLogs API explorer before relying on a new tier.

Apps Script has runtime limits and FFLogs has hourly quota limits. The backfill function intentionally processes small batches and can be safely run again after quota resets.
