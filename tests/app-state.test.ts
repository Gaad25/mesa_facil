import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveOpponentStats,
  normalizeAppData,
  type HandRecord,
  type RecordedAction,
} from "../lib/app-state";

test("normalizeAppData rejeita raízes e versões desconhecidas", () => {
  assert.equal(normalizeAppData(null), null);
  assert.equal(normalizeAppData([]), null);
  assert.equal(normalizeAppData({}), null);
  assert.equal(normalizeAppData({ version: 2 }), null);
});

test("normalizeAppData torna dados corrompidos seguros para a interface", () => {
  const result = normalizeAppData({
    version: 1,
    copilotEnabled: "sim",
    mood: "furioso",
    trainingAnswered: 3.7,
    trainingCorrect: 99,
    unexpectedRootField: "não deve sobreviver",
    archivedHands: [
      {
        id: "h1",
        handNumber: -20,
        playedAt: "data impossível",
        position: "X".repeat(100),
        heroCards: [
          { rank: "A", suit: "spades" },
          { rank: "A", suit: "spades" },
          { rank: "K", suit: "hearts" },
        ],
        board: [
          { rank: "A", suit: "spades" },
          { rank: "2", suit: "clubs" },
          { rank: "1", suit: "stars" },
        ],
        pot: Number.POSITIVE_INFINITY,
        result: 9_000_000,
        actualAction: "hack",
        equity: 400,
        lesson: "L".repeat(1_000),
        injected: true,
      },
      "mão inválida",
    ],
    session: {
      id: "session",
      startedAt: "inválida",
      handNumber: 0,
      smallBlind: -5,
      bigBlind: 0,
      heroId: "ausente",
      buttonSeat: 99,
      players: [
        { id: "p1", name: "Ana", seat: 0, stack: -10 },
        { id: "p1", name: "ID repetido", seat: 1, stack: 100 },
        { id: "p2", name: "Assento repetido", seat: 0, stack: 100 },
        { id: "p3", name: "Bia", seat: 2, stack: 100, style: "aggressive" },
      ],
      hands: [],
      extra: "removido",
    },
  });

  assert.ok(result);
  assert.equal(result.copilotEnabled, true);
  assert.equal(result.mood, "focused");
  assert.equal(result.trainingAnswered, 4);
  assert.equal(result.trainingCorrect, 4);
  assert.equal("unexpectedRootField" in result, false);

  assert.equal(result.archivedHands.length, 1);
  const [hand] = result.archivedHands;
  assert.equal(hand.handNumber, 1);
  assert.equal(Number.isNaN(Date.parse(hand.playedAt)), false);
  assert.equal(hand.position.length, 20);
  assert.deepEqual(hand.heroCards, [
    { rank: "A", suit: "spades" },
    { rank: "K", suit: "hearts" },
  ]);
  assert.deepEqual(hand.board, [{ rank: "2", suit: "clubs" }]);
  assert.equal(hand.pot, 0);
  assert.equal(hand.result, 1_000_000);
  assert.equal(hand.actualAction, undefined);
  assert.equal(hand.equity, 100);
  assert.equal(hand.lesson?.length, 800);
  assert.equal("injected" in hand, false);

  assert.ok(result.session);
  assert.deepEqual(result.session.players.map((player) => player.id), ["p1", "p3"]);
  assert.deepEqual(result.session.players.map((player) => player.seat), [0, 2]);
  assert.equal(result.session.heroId, "p1");
  assert.equal(result.session.players[0].stack, 0);
  assert.equal(Number.isNaN(Date.parse(result.session.startedAt)), false);
  assert.equal("extra" in result.session, false);
});

test("normalizeAppData descarta uma sessão que não preserva dois jogadores únicos", () => {
  const result = normalizeAppData({
    version: 1,
    session: {
      players: [
        { id: "p1", name: "Ana", seat: 0 },
        { id: "p1", name: "Clone", seat: 1 },
      ],
    },
  });

  assert.ok(result);
  assert.equal(result.session, null);
});

test("deriva participação, agressão e estilo das ações registradas", () => {
  const hand = (
    id: string,
    actions: RecordedAction[],
  ): HandRecord => ({
    id,
    handNumber: Number(id.slice(1)),
    playedAt: new Date().toISOString(),
    position: "BTN",
    heroCards: [],
    board: [],
    pot: 0,
    result: 0,
    actions,
  });
  const action = (
    id: string,
    actionType: RecordedAction["action"],
  ): RecordedAction => ({ id, playerId: "villain", action: actionType });

  const stats = deriveOpponentStats(
    [
      hand("h1", [action("a1", "raise")]),
      hand("h2", [action("a2", "bet")]),
      hand("h3", [action("a3", "call")]),
      hand("h4", [{ id: "hero", playerId: "hero", action: "check" }]),
    ],
    "villain",
  );

  assert.deepEqual(stats, {
    actions: 3,
    observedHands: 3,
    participation: 100,
    aggression: 67,
    style: "aggressive",
  });
  assert.equal(deriveOpponentStats([], "villain").style, "unknown");
});
