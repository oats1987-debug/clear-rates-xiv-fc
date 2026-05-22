# Clear Rates XIV FC

Google Apps Script project for tracking FFXIV Free Company clear rates and posting Discord summaries.

This project was built for the Across FC. It uses:

- Lodestone for the official FC roster.
- FFLogs for clear evidence.
- Google Sheets for snapshots and historical records.
- Discord webhooks for posting summary tables.

## Current Status

The project is ready to move from the **backfill-first** phase into regular operation.

The regular model is:

- `collectDailyPriorityClearUpdates`: daily collector for current savage plus the current ultimate.
- `collectMondayUltimateUpdates` through `collectFridayUltimateUpdates`: quiet rolling collectors for one old ultimate per day.
- `postCurrentClearRatesReport`: reporter that reads `CurrentState`, writes a snapshot, and posts Discord without doing heavy FFLogs collection.

Recommended regular triggers:

| Function | Schedule | Purpose |
| --- | --- | --- |
| `collectDailyPriorityClearUpdates` | Daily, shortly after midnight Pacific | Checks M9S-M12S and FRU missing clears |
| `collectMondayUltimateUpdates` | Monday, hourly for several hours | Checks UCOB missing clears in batches |
| `collectTuesdayUltimateUpdates` | Tuesday, hourly for several hours | Checks UWU missing clears in batches |
| `collectWednesdayUltimateUpdates` | Wednesday, hourly for several hours | Checks TEA missing clears in batches |
| `collectThursdayUltimateUpdates` | Thursday, hourly for several hours | Checks DSR missing clears in batches |
| `collectFridayUltimateUpdates` | Friday, hourly for several hours | Checks TOP missing clears in batches |
| `postCurrentClearRatesReport` | Daily, 9-10 AM Pacific | Posts current known clear rates |

The older `runDailyClearRates` function now calls `postCurrentClearRatesReport`.

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
| `CurrentState` | One current row per member/fight derived from `Evidence` |
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
| `DAILY_PRIORITY_BATCH_SIZE` | `120` | Members processed by the daily savage/current-ultimate run |
| `ULTIMATE_BATCH_SIZE` | `10` | Members processed per old-ultimate batch run |
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
10. Run the backfill until complete.
11. Run `resetUpdateCursor`.
12. Add the regular update triggers listed above.
13. Add a daily 9-10 AM Pacific trigger for `postCurrentClearRatesReport`.

## Useful Functions

| Function | Use |
| --- | --- |
| `checkSetup` | Verifies properties and roster access |
| `setupWorkbookAndRoster` | Creates tabs and writes initial roster |
| `testFflogsOneCharacter` | Smoke test for FFLogs current-tier lookup |
| `checkFflogsRateLimit` | Shows hourly FFLogs quota state, if present in Apps Script |
| `resetUltimateBackfill` | Resets the backfill cursor to the first tracked fight |
| `backfillUltimateClears` | Processes the next small batch of missing clears |
| `collectDailyPriorityClearUpdates` | Daily collector for M9S-M12S and FRU |
| `collectMondayUltimateUpdates` | Monday UCOB collector |
| `collectTuesdayUltimateUpdates` | Tuesday UWU collector |
| `collectWednesdayUltimateUpdates` | Wednesday TEA collector |
| `collectThursdayUltimateUpdates` | Thursday DSR collector |
| `collectFridayUltimateUpdates` | Friday TOP collector |
| `collectMissingClearUpdates` | Generic collector for all configured fights; keep as fallback |
| `resetUpdateCursor` | Resets the regular update cursor |
| `postCurrentClearRatesReport` | Posts from `CurrentState` without collecting |
| `runDailyClearRates` | Alias for `postCurrentClearRatesReport` |
| `runWeeklyClearRates` | Legacy collect-and-post weekly function; avoid unless deliberately testing |

## Next Steps

1. Run `resetUpdateCursor` once.
2. Add `collectDailyPriorityClearUpdates` once daily shortly after midnight Pacific.
3. Add one old-ultimate collector per weekday, hourly for several hours on its assigned day.
4. Restore the daily 9-10 AM Pacific trigger for `postCurrentClearRatesReport`.
5. Watch the `Runs` tab for `OK`, `PAUSED`, or `ERROR` rows.
6. If FFLogs rate limits happen often, lower `ULTIMATE_BATCH_SIZE` from `10` to `5`.
7. If hourly runs are clean for a day, consider raising `ULTIMATE_BATCH_SIZE` to `15`.
8. Later, add a tier archive function that stores peak tier clear rates before deleting bulky old raw evidence.

## Known Constraints

- FFLogs quota resets hourly and can return `429 Too Many Requests`.
- Apps Script executions can time out around six minutes.
- Old ultimates require FFLogs partition checks.
- Character renames/transfers can affect FFLogs lookups by name/world.
- Google Sheets will eventually get large if every evidence row is retained forever.
