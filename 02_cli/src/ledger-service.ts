/**
 * Service layer for the ledger CLI: all pocket-db reads/writes live here,
 * kept free of argv/console concerns so it can be unit-tested directly
 * (see `src/tests/ledger-service.test.ts`) without spawning a process.
 *
 * Each function below is a small showcase of a different pocket-db feature:
 * - `addTransaction`     — `insertOne`
 * - `listTransactions`   — `find` with an equality filter (StringIndex on
 *                          `category`), a range filter (NumberIndex on
 *                          `date`), a residual `$regex` scan, `sort`,
 *                          `skip`/`limit`
 * - `monthlyReport`       — a `date` range query reduced in memory (pocket-db
 *                          has no aggregation pipeline by design)
 * - `adjustAmount`        — `updateOne` with `$inc`
 * - `editTransaction`     — `updateOne` with `$set`
 * - `removeTransaction`   — `deleteOne`
 * - `listCategories`      — a full scan reduced to a distinct, sorted list
 */
import type { Collection } from "@axfab/pocket-db";

export interface AddTransactionInput {
  /** Signed amount: positive = income, negative = expense. */
  amount: number;
  category: string;
  note?: string;
  /** Epoch ms; defaults to `Date.now()`. */
  date?: number;
}

export interface ListOptions {
  category?: string;
  /** Epoch ms, inclusive lower bound. */
  from?: number;
  /** Epoch ms, exclusive upper bound. */
  to?: number;
  /** Case-insensitive substring match against `note`. */
  search?: string;
  skip?: number;
  limit?: number;
}

export interface MonthlyReport {
  year: number;
  month: number;
  count: number;
  total: number;
  totalsByCategory: Record<string, number>;
}

export interface EditPatch {
  category?: string;
  note?: string;
}

/** Inserts a transaction. Throws if `amount` isn't finite or `category` is empty. */
export function addTransaction(transactions: Collection, input: AddTransactionInput) {
  if (!Number.isFinite(input.amount)) throw new Error("amount must be a finite number");
  if (!input.category) throw new Error("category is required");

  return transactions.insertOne({
    amount: input.amount,
    category: input.category,
    note: input.note ?? "",
    date: input.date ?? Date.now()
  });
}

/**
 * Lists transactions, newest first, with optional category/date/note
 * filters and pagination. `category` and the `date` range each hit a
 * secondary index when present; `search` always falls back to a residual
 * `$regex` scan (pocket-db has no text index).
 */
export function listTransactions(transactions: Collection, options: ListOptions = {}) {
  const query: Record<string, unknown> = {};
  if (options.category) query.category = options.category;

  if (options.from !== undefined || options.to !== undefined) {
    const range: Record<string, number> = {};
    if (options.from !== undefined) range.$gte = options.from;
    if (options.to !== undefined) range.$lt = options.to;
    query.date = range;
  }

  if (options.search) {
    query.note = { $regex: escapeRegex(options.search), $options: "i" };
  }

  let cursor = transactions.find(query).sort({ date: -1 });
  if (options.skip !== undefined) cursor = cursor.skip(options.skip);
  if (options.limit !== undefined) cursor = cursor.limit(options.limit);
  return cursor.toArray();
}

/**
 * Sums transactions by category for a calendar month (UTC).
 *
 * pocket-db has no aggregation pipeline (by design — see the project
 * README), so this narrows with an indexed `date` range query and reduces
 * the small result set in memory.
 */
export function monthlyReport(transactions: Collection, year: number, month: number): MonthlyReport {
  const from = Date.UTC(year, month - 1, 1);
  const to = Date.UTC(year, month, 1); // first instant of the next month (exclusive bound)
  const rows = transactions.find({ date: { $gte: from, $lt: to } }).toArray();

  const totalsByCategory: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    const amount = row.amount as number;
    const category = row.category as string;
    totalsByCategory[category] = (totalsByCategory[category] ?? 0) + amount;
    total += amount;
  }

  return { year, month, count: rows.length, total, totalsByCategory };
}

/** Adds `delta` to a transaction's amount via `$inc`. Throws if `delta` is zero or not finite. */
export function adjustAmount(transactions: Collection, id: string, delta: number) {
  if (!Number.isFinite(delta) || delta === 0) throw new Error("delta must be a non-zero finite number");
  return transactions.updateOne(id, { $inc: { amount: delta } });
}

/** Updates `category` and/or `note` via `$set`. Throws if the patch is empty. */
export function editTransaction(transactions: Collection, id: string, patch: EditPatch) {
  const set: Record<string, string> = {};
  if (patch.category !== undefined) set.category = patch.category;
  if (patch.note !== undefined) set.note = patch.note;
  if (Object.keys(set).length === 0) throw new Error("nothing to update");

  return transactions.updateOne(id, { $set: set });
}

export function removeTransaction(transactions: Collection, id: string) {
  return transactions.deleteOne(id);
}

/** Returns the distinct categories seen so far, sorted alphabetically. */
export function listCategories(transactions: Collection): string[] {
  const categories = new Set<string>();
  for (const doc of transactions.find().toArray()) {
    categories.add(doc.category as string);
  }
  return [...categories].sort();
}

function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
