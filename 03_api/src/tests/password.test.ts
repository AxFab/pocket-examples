import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../password.js";

test("hashPassword produces a salt:hash pair that verifyPassword accepts", () => {
  const stored = hashPassword("correct horse battery staple");
  assert.match(stored, /^[0-9a-f]+:[0-9a-f]+$/);
  assert.equal(verifyPassword("correct horse battery staple", stored), true);
});

test("verifyPassword rejects a wrong password", () => {
  const stored = hashPassword("correct horse battery staple");
  assert.equal(verifyPassword("wrong password", stored), false);
});

test("verifyPassword rejects a malformed stored hash", () => {
  assert.equal(verifyPassword("anything", "not-a-valid-hash"), false);
  assert.equal(verifyPassword("anything", ""), false);
});

test("hashPassword salts each call differently", () => {
  const a = hashPassword("same password");
  const b = hashPassword("same password");
  assert.notEqual(a, b);
});
