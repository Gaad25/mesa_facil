import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTrainingAction,
  calculateSidePots,
  createTrainingGame,
  getTrainingLegalActions,
  normalizeTrainingConfig,
  restoreTrainingGameState,
  startNextTrainingHand,
  trainingBlindStructure,
} from "../lib/training/game-engine";
import type { TrainingGameState, TrainingPlayer } from "../lib/training/types";

function passiveShowdown() {
  let game = createTrainingGame({
    opponentCount: 2,
    startingStack: 1_000,
    smallBlind: 5,
    bigBlind: 10,
    seed: 42,
  });

  for (let action = 0; action < 40 && game.status === "playing"; action += 1) {
    const legal = getTrainingLegalActions(game);
    assert.ok(legal);
    game = applyTrainingAction(
      game,
      legal.canCheck ? { type: "check" } : { type: "call" },
    );
  }
  return game;
}

test("cria uma mesa determinística sem cartas duplicadas", () => {
  const first = createTrainingGame({ opponentCount: 5, seed: 123 });
  const second = createTrainingGame({ opponentCount: 5, seed: 123 });

  assert.deepEqual(first.deck, second.deck);
  assert.equal(new Set(first.deck.map((card) => `${card.rank}-${card.suit}`)).size, 52);
  assert.equal(first.players.length, 6);
  assert.ok(first.players.every((player) => player.holeCards.length === 2));
});

test("posta antes separados das apostas e escala blinds por nível", () => {
  const game = createTrainingGame({
    opponentCount: 2,
    format: "tournament",
    startingStack: 3_000,
    smallBlind: 5,
    bigBlind: 10,
    ante: 2,
    blindLevelHands: 2,
    seed: 800,
  });

  assert.equal(game.pot, 21);
  assert.equal(
    game.players.reduce((sum, player) => sum + player.committedStreet, 0),
    15,
  );
  assert.equal(
    game.players.reduce((sum, player) => sum + player.committedHand, 0),
    21,
  );
  assert.deepEqual(trainingBlindStructure(game.config, 3), {
    level: 2,
    smallBlind: 10,
    bigBlind: 20,
    ante: 4,
  });
});

test("cash game recompra eliminados e torneio encerra ao perder o stack", () => {
  const cash = createTrainingGame({
    opponentCount: 1,
    format: "cash",
    startingStack: 500,
    seed: 801,
  });
  const bustedCash = {
    ...cash,
    status: "handComplete" as const,
    players: cash.players.map((player) =>
      player.isHero ? { ...player, stack: 0 } : player,
    ),
  };
  const rebought = startNextTrainingHand(bustedCash);
  assert.equal(rebought.status, "playing");
  assert.equal(rebought.players.find((player) => player.isHero)?.handStartStack, 500);

  const tournament = createTrainingGame({
    opponentCount: 1,
    format: "sitAndGo",
    startingStack: 500,
    seed: 802,
  });
  const bustedTournament = {
    ...tournament,
    status: "handComplete" as const,
    players: tournament.players.map((player) =>
      player.isHero ? { ...player, stack: 0 } : player,
    ),
  };
  assert.equal(startNextTrainingHand(bustedTournament).status, "sessionComplete");
});

test("normaliza perfis, velocidade e configurações de sessões antigas", () => {
  const legacy = normalizeTrainingConfig({ opponentCount: 2, seed: 10 });
  assert.equal(legacy.actionSpeed, "normal");
  assert.deepEqual(legacy.botStyles, ["balanced", "tight"]);

  const custom = normalizeTrainingConfig({
    opponentCount: 3,
    actionSpeed: "fast",
    botStyles: ["passive", "aggressive", "loose"],
    seed: 11,
  });
  assert.equal(custom.actionSpeed, "fast");
  assert.deepEqual(custom.botStyles, ["passive", "aggressive", "loose"]);

  const game = createTrainingGame(custom);
  assert.deepEqual(
    game.players.filter((player) => !player.isHero).map((player) => player.style),
    ["passive", "aggressive", "loose"],
  );
});

test("restaura sessões anteriores ao controle de raise e ao replay", () => {
  const legacy = JSON.parse(
    JSON.stringify(createTrainingGame({ opponentCount: 2, seed: 12 })),
  ) as TrainingGameState;
  delete (legacy as Partial<TrainingGameState>).replay;
  for (const player of legacy.players) {
    delete (player as Partial<TrainingPlayer>).raiseAllowed;
  }

  const restored = restoreTrainingGameState(legacy);
  assert.ok(restored.players.every((player) => player.raiseAllowed));
  assert.equal(restored.replay.length, 1);
  assert.equal(restored.replay[0].event, "deal");
});

test("respeita blinds, ordem de ação e limites do raise", () => {
  const game = createTrainingGame({
    opponentCount: 2,
    startingStack: 1_000,
    smallBlind: 5,
    bigBlind: 10,
    seed: 9,
  });
  const legal = getTrainingLegalActions(game);

  assert.equal(game.dealerSeat, 0);
  assert.equal(game.smallBlindSeat, 1);
  assert.equal(game.bigBlindSeat, 2);
  assert.equal(game.currentPlayerSeat, 0);
  assert.equal(game.pot, 15);
  assert.equal(legal?.toCall, 10);
  assert.equal(legal?.minRaiseTo, 20);
  assert.throws(
    () => applyTrainingAction(game, { type: "raise", amount: 15 }),
    /raise deve ficar/,
  );
});

test("conclui todas as rodadas e conserva as fichas no showdown", () => {
  const game = passiveShowdown();

  assert.equal(game.status, "handComplete");
  assert.equal(game.street, "showdown");
  assert.equal(game.board.length, 5);
  assert.equal(game.result?.totalPot, 30);
  assert.equal(
    game.players.reduce((total, player) => total + player.stack, 0),
    3_000,
  );
});

test("entrega o pote imediatamente quando todos os adversários desistem", () => {
  let game = createTrainingGame({
    opponentCount: 2,
    startingStack: 1_000,
    smallBlind: 5,
    bigBlind: 10,
    seed: 77,
  });
  game = applyTrainingAction(game, { type: "fold" });
  game = applyTrainingAction(game, { type: "fold" });

  assert.equal(game.status, "handComplete");
  assert.deepEqual(game.result?.winnerIds, ["bot-2"]);
  assert.equal(game.result?.totalPot, 10);
  assert.equal(
    game.players.reduce((total, player) => total + player.stack, 0),
    3_000,
  );
});

test("calcula potes principal e lateral para stacks diferentes", () => {
  const player = (
    id: string,
    committedHand: number,
    folded = false,
  ): TrainingPlayer => ({
    id,
    name: id,
    seat: Number(id.slice(-1)) || 0,
    isHero: id === "p0",
    style: "balanced",
    stack: 0,
    handStartStack: committedHand,
    holeCards: [],
    folded,
    allIn: true,
    committedStreet: committedHand,
    committedHand,
    actedThisStreet: true,
    raiseAllowed: false,
  });
  const pots = calculateSidePots([
    player("p0", 100),
    player("p1", 100),
    player("p2", 40),
  ]);

  assert.deepEqual(pots, [
    { amount: 120, eligiblePlayerIds: ["p0", "p1", "p2"] },
    { amount: 120, eligiblePlayerIds: ["p0", "p1"] },
  ]);
});

test("gira o dealer ao iniciar a mão seguinte", () => {
  const complete = passiveShowdown();
  const next = startNextTrainingHand(complete);

  assert.equal(next.status, "playing");
  assert.equal(next.handNumber, 2);
  assert.equal(next.dealerSeat, 1);
  assert.equal(next.board.length, 0);
  assert.ok(next.players.every((player) => player.holeCards.length === 2));
});

test("conserva as fichas em sequências variadas com raises e all-ins", () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const opponentCount = 1 + (seed % 5);
    let game = createTrainingGame({
      opponentCount,
      seed,
      startingStack: 200,
      smallBlind: 5,
      bigBlind: 10,
    });

    for (let step = 0; step < 150 && game.status === "playing"; step += 1) {
      const legal = getTrainingLegalActions(game)!;
      const choices = [];
      if (legal.canFold) choices.push({ type: "fold" as const });
      if (legal.canCheck) choices.push({ type: "check" as const });
      if (legal.canCall) choices.push({ type: "call" as const });
      if (legal.canRaise) {
        const raiseRange = legal.maxRaiseTo - legal.minRaiseTo + 1;
        choices.push({
          type: "raise" as const,
          amount:
            legal.minRaiseTo +
            ((seed + step) % Math.max(1, raiseRange)),
        });
      }
      if (legal.canAllIn) choices.push({ type: "allIn" as const });
      game = applyTrainingAction(
        game,
        choices[(seed * 17 + step * 7) % choices.length],
      );
    }

    assert.equal(game.status, "handComplete", `seed ${seed}`);
    assert.equal(
      game.players.reduce((total, player) => total + player.stack, 0) +
        game.pot,
      (opponentCount + 1) * 200,
      `seed ${seed}`,
    );
  }
});

test("short all-in exige resposta sem reabrir o raise para quem já agiu", () => {
  let game = createTrainingGame({
    opponentCount: 2,
    startingStack: 1_000,
    smallBlind: 5,
    bigBlind: 10,
    seed: 501,
  });
  game = {
    ...game,
    players: game.players.map((player) =>
      player.id === "bot-1" ? { ...player, stack: 30 } : player,
    ),
  };

  game = applyTrainingAction(game, { type: "raise", amount: 30 });
  game = applyTrainingAction(game, { type: "allIn" });

  const playerYetToAct = getTrainingLegalActions(game);
  assert.equal(playerYetToAct?.playerId, "bot-2");
  assert.equal(playerYetToAct?.toCall, 25);
  assert.equal(playerYetToAct?.canRaise, true);

  game = applyTrainingAction(game, { type: "call" });
  const originalRaiser = getTrainingLegalActions(game);
  assert.equal(originalRaiser?.playerId, "hero");
  assert.equal(originalRaiser?.toCall, 5);
  assert.equal(originalRaiser?.canCall, true);
  assert.equal(originalRaiser?.canRaise, false);
  assert.equal(originalRaiser?.canAllIn, false);
  assert.throws(
    () => applyTrainingAction(game, { type: "raise", amount: 100 }),
    /Raise não está disponível/,
  );
});

test("raise completo reabre o direito de aumentar", () => {
  let game = createTrainingGame({
    opponentCount: 2,
    startingStack: 1_000,
    smallBlind: 5,
    bigBlind: 10,
    seed: 502,
  });
  game = {
    ...game,
    players: game.players.map((player) =>
      player.id === "bot-1" ? { ...player, stack: 55 } : player,
    ),
  };

  game = applyTrainingAction(game, { type: "raise", amount: 30 });
  game = applyTrainingAction(game, { type: "allIn" });
  game = applyTrainingAction(game, { type: "call" });

  const originalRaiser = getTrainingLegalActions(game);
  assert.equal(originalRaiser?.playerId, "hero");
  assert.equal(originalRaiser?.toCall, 30);
  assert.equal(originalRaiser?.canRaise, true);
});

test("devolve a parte não coberta antes de encerrar a mão por fold", () => {
  let game = createTrainingGame({
    opponentCount: 1,
    startingStack: 1_000,
    smallBlind: 5,
    bigBlind: 10,
    seed: 503,
  });

  game = applyTrainingAction(game, { type: "raise", amount: 100 });
  game = applyTrainingAction(game, { type: "fold" });

  const hero = game.players.find((player) => player.isHero)!;
  assert.equal(game.status, "handComplete");
  assert.equal(game.result?.totalPot, 20);
  assert.equal(game.result?.heroNet, 10);
  assert.equal(hero.stack, 1_010);
  assert.equal(hero.committedHand, 10);
  assert.equal(
    game.players.reduce((total, player) => total + player.stack, 0),
    2_000,
  );
});
