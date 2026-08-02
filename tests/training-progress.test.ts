import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTrainingAction,
  createTrainingGame,
  getTrainingLegalActions,
} from "../lib/training/game-engine";
import {
  createEmptyTrainingProgress,
  normalizeTrainingProgress,
  recordCompletedTrainingHand,
  trainingSolidRate,
} from "../lib/training/progress";
import { evaluateHeroDecision } from "../lib/training/teacher";
import type {
  TeacherFeedback,
  TrainingDecision,
} from "../lib/training/types";

function completeTrainingHand() {
  let game = createTrainingGame({ opponentCount: 2, seed: 707 });
  const feedback: TeacherFeedback[] = [];

  for (let step = 0; step < 40 && game.status === "playing"; step += 1) {
    const legal = getTrainingLegalActions(game)!;
    const player = game.players.find((candidate) => candidate.id === legal.playerId)!;
    const decision: TrainingDecision = legal.canCheck
      ? { type: "check" }
      : { type: "call" };
    if (player.isHero) {
      const evaluation = evaluateHeroDecision(game, decision);
      if (evaluation) feedback.push(evaluation);
    }
    game = applyTrainingAction(game, decision);
  }

  assert.equal(game.status, "handComplete");
  return { game, feedback };
}

test("registra resultado e decisões de uma mão por street", () => {
  const { game, feedback } = completeTrainingHand();
  const progress = recordCompletedTrainingHand(
    createEmptyTrainingProgress(),
    game,
    feedback,
    "2026-08-02T12:00:00.000Z",
  );

  assert.equal(progress.handsPlayed, 1);
  assert.equal(progress.decisions, feedback.length);
  assert.equal(progress.totalResult, game.result?.heroNet);
  assert.equal(progress.recentHands.length, 1);
  assert.equal(progress.history.length, 1);
  assert.equal(progress.history[0].summary, game.result?.summary);
  assert.equal(progress.history[0].feedback.length, feedback.length);
  assert.ok(progress.history[0].replay.length > game.actions.length);
  assert.equal(progress.history[0].replay[0].event, "deal");
  assert.equal(progress.history[0].replay.at(-1)?.event, "result");
  assert.equal(
    progress.history[0].replay.filter((frame) => frame.event === "action").length,
    game.actions.filter((action) => action.handNumber === game.handNumber).length,
  );
  assert.equal(
    Object.values(progress.byStreet).reduce(
      (total, street) => total + street.decisions,
      0,
    ),
    feedback.length,
  );
});

test("não duplica uma mão restaurada do armazenamento", () => {
  const { game, feedback } = completeTrainingHand();
  const progress = recordCompletedTrainingHand(
    createEmptyTrainingProgress(),
    game,
    feedback,
  );
  const repeated = recordCompletedTrainingHand(progress, game, feedback);

  assert.strictEqual(repeated, progress);
  assert.equal(repeated.handsPlayed, 1);
});

test("normaliza progresso inválido e calcula decisões sólidas", () => {
  const normalized = normalizeTrainingProgress({
    version: 1,
    handsPlayed: -4,
    decisions: 10,
    good: 4,
    acceptable: 3,
    risky: 3,
    totalResult: Number.NaN,
    byStreet: {},
    recentHands: [{ invalid: true }],
    history: [{ id: "broken", replay: [] }],
    recordedHandIds: ["hand-1", 5],
  });

  assert.equal(normalized.handsPlayed, 0);
  assert.equal(normalized.totalResult, 0);
  assert.equal(normalized.recentHands.length, 0);
  assert.equal(normalized.history.length, 0);
  assert.deepEqual(normalized.recordedHandIds, ["hand-1"]);
  assert.equal(trainingSolidRate(normalized), 70);
});
