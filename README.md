# Clear Rates XIV FC

Google Apps Script project for tracking FFXIV Free Company clear rates and posting Discord summaries.

This project was built for the Across FC. It uses:

- Lodestone for the official FC roster.
- FFLogs for clear evidence.
- Google Sheets for snapshots and historical records.
- Discord webhooks for posting summary tables.

## Current Status

The project is in the **backfill-first** phase.

The main problem being solved is that FFLogs has both hourly quota limits and historical partitions for old ultimates. Large one-shot runs can hit FFLogs `429 Too Many Requests` or Apps Script's runtime limit, so the current plan is to collect data in small hourly batches before turning normal daily reports back on.

Current temporary trigger:

| Function | Schedule | Purpose |
| --- | --- | --- |
| `backfillUltimateClears` | Hourly | Slowly fills `Evidence` for all tracked fights |

Daily and weekly report triggers should stay disabled until backfill has enough coverage.

## Tracked Fights

Configured in `src/config.gs`.

| Label | Source | Notes |
| --- | --- | --- |
| `M9S` | FFLogs | AAC Heavyweight M1 Savage |
| `M10S` | FFLogs | AAC Heavyweight M2 Savage |
| `M11S` | FFLogs | AAC Heavyweight M3 Savage |
| `M12S` | FFLogs | Uses Lindwurm II, not part 1 |
| `FRU` | FFLogs | Uses historical partitions |
| `UCOB` | FFLogs | Uses multiple IDs and partitions |
| `UWU` | FFLogs | Uses multiple IDs and partitions |
| `TEA` | FFLogs | Uses multiple IDs and partitions |
| `DSR` | FFLogs | Uses original and legacy IDs plus partitions |
| `TOP` | FFLogs | Uses original and legacy IDs plus partitions |

Lodestone achievements are intentionally not used for clear evidence because many members hide achievements and savage floors do not have one achievement per floor. Lodestone is only used for the FC roster.

## Sheet Tabs

| Tab | Purpose |
| --- | --- |
| `Roster` | Roster snapshot rows from Lodestone |
| `Snapshots` | Clear-rate summary rows by date and encounter |
| `Evidence` | Raw per-character clear evidence |
| `Runs` | Run log and errors |

Important behavior:

- Once a character is confirmed cleared for a fight, future runs skip that member/fight.
- Snapshot rows preserve the roster size at the time of the snapshot.
- Backfill writes incremental snapshot rows while it progresses.

## Required Script Properties

Create these in Apps Script > Project Settings > Script properties.

| Property | Purpose |
| --- | --- |
| `FFLOGS_CLIENT_ID` | FFLogs API client ID |
| `FFLOGS_CLIENT_SECRET` | FFLogs API client secret |
| `DISCORD_WEBHOOK_URL` | Discord webhook URL |

Recommended during backfill:

| Property | Suggested value | Purpose |
| --- | --- | --- |
| `BACKFILL_BATCH_SIZE` | `10` | Members processed per hourly backfill run |
| `DRY_RUN` | `false` | Report functions post when run; backfill does not post |

Optional:

| Property | Default | Purpose |
| --- | --- | --- |
| `FC_LODESTONE_ID` | `9236460623271944812` | Across FC Lodestone ID |
| `SHEET_ID` | Active spreadsheet | Use if Apps Script is detached from the sheet |

## Setup

1. Create a Google Sheet.
2. Open Extensions > Apps Script.
3. Add the files from `src/` to the Apps Script project.
4. Add the required script properties.
5. Run `checkSetup`.
6. Run `setupWorkbookAndRoster`.
7. Run `testFflogsOneCharacter`.
8. Set `BACKFILL_BATCH_SIZE` to `10`.
9. Run `resetUltimateBackfill`.
10. Add an hourly trigger for `backfillUltimateClears`.

## Useful Functions

| Function | Use |
| --- | --- |
| `checkSetup` | Verifies properties and roster access |
| `setupWorkbookAndRoster` | Creates tabs and writes initial roster |
| `testFflogsOneCharacter` | Smoke test for FFLogs current-tier lookup |
| `checkFflogsRateLimit` | Shows hourly FFLogs quota state, if present in Apps Script |
| `resetUltimateBackfill` | Resets the backfill cursor to the first tracked fight |
| `backfillUltimateClears` | Processes the next small batch of missing clears |
| `runDailyClearRates` | Current collect-and-post daily function; keep disabled during backfill |
| `runWeeklyClearRates` | Current collect-and-post weekly function; keep disabled during backfill |

## Next Steps

1. Let the hourly `backfillUltimateClears` trigger run for a while.
2. Watch the `Runs` tab for `OK`, `PAUSED`, or `ERROR` rows.
3. If FFLogs rate limits happen often, lower `BACKFILL_BATCH_SIZE` from `10` to `5`.
4. If hourly runs are clean for a day, consider raising `BACKFILL_BATCH_SIZE` to `15`.
5. Once backfill coverage looks good, split the system into:
   - collector jobs that only update `Evidence`
   - reporter jobs that only summarize existing data and post Discord
6. Restore a daily 9-10 AM Pacific report trigger after the reporter is read-only.
7. Later, add a tier archive function that stores peak tier clear rates before deleting bulky old raw evidence.

## Known Constraints

- FFLogs quota resets hourly and can return `429 Too Many Requests`.
- Apps Script executions can time out around six minutes.
- Old ultimates require FFLogs partition checks.
- Character renames/transfers can affect FFLogs lookups by name/world.
- Google Sheets will eventually get large if every evidence row is retained forever.

