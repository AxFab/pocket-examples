# 02_cli — ledger

A small command-line expense tracker backed by [`@axfab/pocket-db`](https://github.com/AxFab/pocket-db). One process, one `.pdb` file, no server.

## What it showcases

- **Indexed queries** — `category` (StringIndex) and `date` (NumberIndex) are indexed on startup; `ledger list --category=food` and date-ranged reports hit the index instead of scanning every transaction.
- **Update operators** — `ledger adjust` uses `$inc`, `ledger edit` uses `$set`.
- **Residual filtering** — `ledger list --search=...` runs a `$regex` scan on the `note` field (no text index in pocket-db, by design).
- **No aggregation pipeline** — `ledger report` narrows with an indexed `date` range query, then reduces the (small) result set in memory.
- **`db.compact()`** — `ledger compact` reclaims space from edited/deleted transactions.
- **`db.stats()` / `collection.stats()`** — `ledger stats` prints file size, document/operation counts, and reclaimable bytes.

## Run it

```bash
npm install
npm run build

node dist/cli.js add -12.50 food "coffee"
node dist/cli.js add 2500 salary "june paycheck"
node dist/cli.js list
node dist/cli.js report 2026-06
node dist/cli.js stats
```

Or, after `npm link`, use the `ledger` binary directly:

```bash
npm link
ledger add -12.50 food "coffee"
ledger list
```

By default the database file is `ledger.pdb` in the current directory. Override it with `LEDGER_DB=/path/to/file.pdb`.

## Commands

```
add <amount> <category> [note...]    Record a transaction (amount: signed decimal, e.g. -12.50)
list [--category=X] [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--search=text] [--skip=N] [--limit=N]
report <YYYY-MM>                     Per-category totals for a month
categories                           Distinct categories seen so far
adjust <id> <delta>                  Add <delta> to a transaction's amount ($inc)
edit <id> [--category=X] [--note=text]
rm <id>
stats                                Database + collection usage stats
compact                              Reclaim space from deleted/updated records
help                                 Show usage
```

## Layout

```
src/db.ts               database + index bootstrap
src/ledger-service.ts   all pocket-db reads/writes (unit-tested, no CLI concerns)
src/format.ts           currency/date parsing & formatting (pure, unit-tested)
src/cli.ts              argv parsing and command dispatch
src/tests/              node:test suites for the two modules above
```

## Test

```bash
npm test
```

## Developing against local pocket-db sources

This example installs `@axfab/pocket-db` from npm. If this folder lives inside the main repository, point `package.json` at `"@axfab/pocket-db": "file:../.."` instead and re-run `npm install`.
