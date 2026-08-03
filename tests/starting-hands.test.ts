import assert from "node:assert/strict";
import test from "node:test";
import {
  startingHandAction,
  startingHandNotation,
} from "../lib/training/starting-hands";

test("monta a matriz com pares, suited e offsuit nas diagonais corretas", () => {
  assert.equal(startingHandNotation(0, 0), "AA");
  assert.equal(startingHandNotation(0, 1), "AKs");
  assert.equal(startingHandNotation(1, 0), "AKo");
  assert.equal(startingHandNotation(12, 12), "22");
});

test("o range se alarga conforme a posição fica mais tardia", () => {
  assert.equal(startingHandAction("A8o", "UTG", "beginner"), "fold");
  assert.equal(startingHandAction("A8o", "BTN", "beginner"), "raise");
});

test("o modo completo revela mãos de estratégia mista", () => {
  assert.equal(startingHandAction("A9s", "UTG", "beginner"), "fold");
  assert.equal(startingHandAction("A9s", "UTG", "complete"), "mixed");
});

test("o big blind apresenta uma defesa contra raise do botão", () => {
  assert.equal(startingHandAction("AA", "BB", "beginner"), "raise");
  assert.equal(startingHandAction("T9s", "BB", "beginner"), "call");
  assert.equal(startingHandAction("72o", "BB", "complete"), "fold");
});
