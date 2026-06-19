import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCurrency, formatDate, parseDateArg, parseMonthArg, parseAmountArg } from "../format.js";

test("formatCurrency signs positive, negative, and zero amounts", () => {
  assert.equal(formatCurrency(12.5), "+12.50");
  assert.equal(formatCurrency(-3), "-3.00");
  assert.equal(formatCurrency(0), "+0.00");
});

test("formatDate renders YYYY-MM-DD in UTC", () => {
  assert.equal(formatDate(Date.UTC(2026, 5, 19)), "2026-06-19");
});

test("parseDateArg round-trips with formatDate", () => {
  const epochMs = parseDateArg("2026-01-31");
  assert.equal(formatDate(epochMs), "2026-01-31");
});

test("parseDateArg rejects malformed input", () => {
  assert.throws(() => parseDateArg("2026/01/31"));
  assert.throws(() => parseDateArg("not-a-date"));
});

test("parseMonthArg extracts year and month", () => {
  assert.deepEqual(parseMonthArg("2026-06"), { year: 2026, month: 6 });
});

test("parseMonthArg rejects malformed or out-of-range input", () => {
  assert.throws(() => parseMonthArg("2026-6"));
  assert.throws(() => parseMonthArg("2026-13"));
});

test("parseAmountArg parses signed decimals and rejects non-numeric input", () => {
  assert.equal(parseAmountArg("-12.50"), -12.5);
  assert.equal(parseAmountArg("7"), 7);
  assert.throws(() => parseAmountArg("abc"));
});
