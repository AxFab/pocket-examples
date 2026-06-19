import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initDatabase, type LedgerDatabase } from "../db.js";
import {
  addTransaction,
  listTransactions,
  monthlyReport,
  adjustAmount,
  editTransaction,
  removeTransaction,
  listCategories
} from "../ledger-service.js";

let dir: string;
let database: LedgerDatabase;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "ledger-cli-"));
  database = initDatabase(path.join(dir, "ledger.pdb"));
});

afterEach(() => {
  database.db.close();
  rmSync(dir, { recursive: true, force: true });
});

test("addTransaction stores amount, category, note and date", () => {
  const result = addTransaction(database.transactions, { amount: -12.5, category: "food", note: "lunch" });
  assert.equal(result.acknowledged, true);

  const stored = database.transactions.findOne({ _id: result.insertedId });
  assert.equal(stored?.amount, -12.5);
  assert.equal(stored?.category, "food");
  assert.equal(stored?.note, "lunch");
  assert.equal(typeof stored?.date, "number");
});

test("addTransaction rejects a non-finite amount or missing category", () => {
  assert.throws(() => addTransaction(database.transactions, { amount: NaN, category: "food" }));
  assert.throws(() => addTransaction(database.transactions, { amount: 1, category: "" }));
});

test("listTransactions sorts newest first and filters by category", () => {
  addTransaction(database.transactions, { amount: 1, category: "food", date: 1 });
  addTransaction(database.transactions, { amount: 2, category: "rent", date: 2 });
  addTransaction(database.transactions, { amount: 3, category: "food", date: 3 });

  const all = listTransactions(database.transactions);
  assert.deepEqual(all.map((t) => t.date), [3, 2, 1]);

  const foodOnly = listTransactions(database.transactions, { category: "food" });
  assert.equal(foodOnly.length, 2);
  assert.ok(foodOnly.every((t) => t.category === "food"));
});

test("listTransactions filters by date range and paginates", () => {
  for (let day = 1; day <= 5; day++) {
    addTransaction(database.transactions, { amount: day, category: "x", date: day * 1000 });
  }

  const ranged = listTransactions(database.transactions, { from: 2000, to: 5000 });
  assert.deepEqual(ranged.map((t) => t.date), [4000, 3000, 2000]);

  const page = listTransactions(database.transactions, { skip: 1, limit: 2 });
  assert.deepEqual(page.map((t) => t.date), [4000, 3000]);
});

test("listTransactions search matches note case-insensitively, escaping regex metacharacters", () => {
  addTransaction(database.transactions, { amount: -5, category: "food", note: "Coffee (large)" });
  addTransaction(database.transactions, { amount: -2, category: "food", note: "Bus ticket" });

  const results = listTransactions(database.transactions, { search: "coffee (large)" });
  assert.equal(results.length, 1);
});

test("monthlyReport sums by category within month bounds, excluding the next month", () => {
  addTransaction(database.transactions, { amount: -10, category: "food", date: Date.UTC(2026, 5, 1) });
  addTransaction(database.transactions, { amount: -5, category: "food", date: Date.UTC(2026, 5, 30) });
  addTransaction(database.transactions, { amount: 100, category: "salary", date: Date.UTC(2026, 5, 15) });
  addTransaction(database.transactions, { amount: -1, category: "food", date: Date.UTC(2026, 6, 1) }); // next month, excluded

  const report = monthlyReport(database.transactions, 2026, 6);
  assert.equal(report.count, 3);
  assert.equal(report.totalsByCategory.food, -15);
  assert.equal(report.totalsByCategory.salary, 100);
  assert.equal(report.total, 85);
});

test("adjustAmount applies a delta via $inc", () => {
  const { insertedId } = addTransaction(database.transactions, { amount: 10, category: "food" });
  adjustAmount(database.transactions, insertedId, -3.5);
  assert.equal(database.transactions.findOne({ _id: insertedId })?.amount, 6.5);
});

test("adjustAmount rejects a zero or non-finite delta", () => {
  const { insertedId } = addTransaction(database.transactions, { amount: 10, category: "food" });
  assert.throws(() => adjustAmount(database.transactions, insertedId, 0));
  assert.throws(() => adjustAmount(database.transactions, insertedId, NaN));
});

test("editTransaction updates category and note via $set", () => {
  const { insertedId } = addTransaction(database.transactions, { amount: 10, category: "food", note: "old" });
  editTransaction(database.transactions, insertedId, { category: "dining", note: "new" });

  const stored = database.transactions.findOne({ _id: insertedId });
  assert.equal(stored?.category, "dining");
  assert.equal(stored?.note, "new");
});

test("editTransaction requires at least one field", () => {
  const { insertedId } = addTransaction(database.transactions, { amount: 10, category: "food" });
  assert.throws(() => editTransaction(database.transactions, insertedId, {}));
});

test("removeTransaction deletes the transaction", () => {
  const { insertedId } = addTransaction(database.transactions, { amount: 10, category: "food" });
  const result = removeTransaction(database.transactions, insertedId);
  assert.equal(result.deletedCount, 1);
  assert.equal(listTransactions(database.transactions).length, 0);
});

test("listCategories returns distinct, sorted category names", () => {
  addTransaction(database.transactions, { amount: 1, category: "rent" });
  addTransaction(database.transactions, { amount: 1, category: "food" });
  addTransaction(database.transactions, { amount: 1, category: "food" });

  assert.deepEqual(listCategories(database.transactions), ["food", "rent"]);
});

test("compaction reclaims space and survives reopen", () => {
  addTransaction(database.transactions, { amount: 1, category: "keep" });
  const { insertedId } = addTransaction(database.transactions, { amount: 1, category: "drop" });
  removeTransaction(database.transactions, insertedId);

  database.db.compact();
  assert.equal(listTransactions(database.transactions).length, 1);

  database.db.close();
  database = initDatabase(path.join(dir, "ledger.pdb"));
  assert.equal(listTransactions(database.transactions)[0]?.category, "keep");
});
