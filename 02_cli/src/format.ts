/**
 * Pure formatting/parsing helpers for the ledger CLI.
 *
 * Kept free of any pocket-db or CLI dependency so they're trivial to
 * unit-test (see `src/tests/format.test.ts`).
 */

/**
 * Formats a dollar amount with a fixed 2-decimal layout and an explicit
 * sign, e.g. `12.5` -> `"+12.50"`, `-3` -> `"-3.00"`.
 *
 * Note: amounts are plain JS numbers throughout this example for
 * simplicity. A production ledger should store integer cents to avoid
 * floating-point drift across many additions — out of scope here.
 */
export function formatCurrency(amount: number): string {
  const sign = amount < 0 ? "-" : "+";
  return `${sign}${Math.abs(amount).toFixed(2)}`;
}

/** Formats an epoch-ms timestamp as `YYYY-MM-DD` (UTC). */
export function formatDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

/**
 * Parses a `YYYY-MM-DD` string into an epoch-ms timestamp (UTC midnight).
 * Throws on malformed input.
 */
export function parseDateArg(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid date "${value}", expected YYYY-MM-DD`);
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

/**
 * Parses a `YYYY-MM` string into its year/month parts (month is 1-12).
 * Throws on malformed or out-of-range input.
 */
export function parseMonthArg(value: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid month "${value}", expected YYYY-MM`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid month "${value}": month out of range`);
  return { year, month };
}

/** Parses a signed decimal amount string. Throws on non-numeric input. */
export function parseAmountArg(value: string): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error(`Invalid amount "${value}"`);
  return amount;
}
