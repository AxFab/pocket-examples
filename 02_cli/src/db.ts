/**
 * Database bootstrap for the ledger CLI.
 *
 * Opens a single `.pdb` file holding one `transactions` collection, indexed
 * on the two fields the service layer queries by:
 * - `date`     (NumberIndex) — powers the range scan behind `monthlyReport()`
 *               and the `--from`/`--to` filters on `list`.
 * - `category` (StringIndex) — powers the equality filter behind
 *               `listTransactions({ category })`.
 *
 * `createIndex` is idempotent for an unchanged field/type pair (it returns
 * the existing definition instead of throwing or duplicating the log entry),
 * so calling it on every CLI invocation — i.e. every `initDatabase()` call —
 * is safe and cheap.
 */
import { pocketDb, type Database, type Collection } from "@axfab/pocket-db";

export interface LedgerDatabase {
  db: Database;
  transactions: Collection;
}

export function initDatabase(dbPath: string): LedgerDatabase {
  const db = pocketDb(dbPath);
  const transactions = db.collection("transactions");

  transactions.createIndex("date", { type: "number" });
  transactions.createIndex("category", { type: "string" });

  return { db, transactions };
}
