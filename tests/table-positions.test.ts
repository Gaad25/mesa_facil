import assert from "node:assert/strict";
import test from "node:test";
import { trainingTablePosition } from "../lib/training/table-positions";

function players(total: number) {
  return Array.from({ length: total }, (_, seat) => ({ seat, handStartStack: 1_000 }));
}

test("nomeia todas as posições de uma mesa six-max", () => {
  const table = players(6);
  const positions = table.map((player) =>
    trainingTablePosition(table, player.seat, 0, 1, 2),
  );
  assert.deepEqual(positions, ["BTN", "SB", "BB", "UTG", "MP", "CO"]);
});

test("acompanha a rotação do botão", () => {
  const table = players(6);
  const positions = table.map((player) =>
    trainingTablePosition(table, player.seat, 4, 5, 0),
  );
  assert.deepEqual(positions, ["BB", "UTG", "MP", "CO", "BTN", "SB"]);
});

test("no heads-up o botão também representa o small blind", () => {
  const table = players(2);
  assert.equal(trainingTablePosition(table, 0, 0, 0, 1), "BTN/SB");
  assert.equal(trainingTablePosition(table, 1, 0, 0, 1), "BB");
});

test("ignora jogadores sem stack no início da mão", () => {
  const table = players(4);
  table[3].handStartStack = 0;
  assert.equal(trainingTablePosition(table, 3, 0, 1, 2), null);
});
