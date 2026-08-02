import assert from "node:assert/strict";
import test from "node:test";
import {
  botStrategyDiagnostics,
  chooseBotAction,
} from "../lib/training/bot-strategy";
import {
  applyTrainingAction,
  createTrainingGame,
  getTrainingLegalActions,
} from "../lib/training/game-engine";
import {
  createTeacherHint,
  evaluateHeroDecision,
} from "../lib/training/teacher";
import type { HeroTendencyModel } from "../lib/training/types";

test("bots sempre escolhem ações aceitas pelo motor", () => {
  let game = createTrainingGame({
    opponentCount: 4,
    difficulty: "advanced",
    seed: 2026,
  });

  for (let step = 0; step < 80 && game.status === "playing"; step += 1) {
    const legal = getTrainingLegalActions(game);
    assert.ok(legal);
    const player = game.players.find((candidate) => candidate.id === legal.playerId)!;
    const decision = player.isHero
      ? legal.canCheck
        ? { type: "check" as const }
        : { type: "call" as const }
      : chooseBotAction(game);
    assert.doesNotThrow(() => applyTrainingAction(game, decision));
    game = applyTrainingAction(game, decision);
  }

  assert.equal(game.status, "handComplete");
});

test("bots adaptativos blefam mais contra folds e apostam valor contra calls", () => {
  const buildSpot = (heroModel: HeroTendencyModel) => {
    let game = createTrainingGame({
      opponentCount: 1,
      difficulty: "advanced",
      botStrategy: "adaptive",
      heroModel,
      seed: 910,
    });
    game = applyTrainingAction(game, { type: "call" });
    return botStrategyDiagnostics(game);
  };
  const folder = buildSpot({
    actions: 12,
    voluntaryPreflop: 2,
    preflopOpportunities: 10,
    aggressiveActions: 1,
    calls: 1,
    foldsFacingBet: 8,
    facedBets: 10,
  });
  const caller = buildSpot({
    actions: 12,
    voluntaryPreflop: 8,
    preflopOpportunities: 10,
    aggressiveActions: 2,
    calls: 8,
    foldsFacingBet: 1,
    facedBets: 10,
  });

  assert.ok(folder.adaptation.bluffFrequency > caller.adaptation.bluffFrequency);
  assert.ok(caller.adaptation.valueThresholdAdjustment < folder.adaptation.valueThresholdAdjustment);
  assert.equal(folder.heroLabel, "conservador");
  assert.equal(caller.heroLabel, "pagador");
});

test("professor cria dica e avaliação para a decisão do herói", () => {
  const game = createTrainingGame({ opponentCount: 2, seed: 88 });
  const hint = createTeacherHint(game);
  const evaluation = evaluateHeroDecision(game, { type: "call" });

  assert.ok(hint);
  assert.ok(evaluation);
  assert.ok(["good", "acceptable", "risky"].includes(evaluation.grade!));
  assert.ok(evaluation.explanation.length > 30);
  assert.ok(evaluation.analysis.equity >= 0 && evaluation.analysis.equity <= 100);
});

test("professor não muda a recomendação ao trocar cartas escondidas dos bots", () => {
  const game = createTrainingGame({ opponentCount: 2, seed: 321 });
  const original = createTeacherHint(game);
  const changedHiddenCards = {
    ...game,
    players: game.players.map((player, index) =>
      player.isHero
        ? player
        : {
            ...player,
            holeCards: game.players[index === 1 ? 2 : 1].holeCards,
          },
    ),
  };
  const changed = createTeacherHint(changedHiddenCards);

  assert.equal(changed?.recommendedAction, original?.recommendedAction);
  assert.equal(changed?.analysis.equity, original?.analysis.equity);
  assert.equal(changed?.analysis.reason, original?.analysis.reason);
});
