import assert from "node:assert/strict";
import test from "node:test";
import type { PokerAnalysis } from "../lib/poker";
import {
  adaptiveTrainingQuestions,
  recommendedTrainingConfig,
  recommendedTrainingFocus,
  trainingErrorInsights,
  trainingTrend,
} from "../lib/training/curriculum";
import { createEmptyTrainingProgress } from "../lib/training/progress";
import type {
  TeacherFeedback,
  TrainingActionType,
  TrainingHandHistory,
  TrainingStreet,
} from "../lib/training/types";

const analysis = {
  equity: 30,
  potOdds: 20,
  spr: 4,
} as PokerAnalysis;

function feedback(
  id: string,
  street: TrainingStreet,
  actualAction: TrainingActionType,
  recommendedAction: TrainingActionType,
): TeacherFeedback {
  return {
    id,
    handNumber: 1,
    street,
    actualAction,
    recommendedAction,
    grade: "risky",
    title: "Decisão arriscada",
    explanation: "Explicação",
    teachingPoint: "Ponto de estudo",
    analysis,
  };
}

function history(items: TeacherFeedback[]): TrainingHandHistory {
  return {
    id: "hand-1",
    playedAt: "2026-08-02T12:00:00.000Z",
    handNumber: 1,
    heroNet: -20,
    decisions: items.length,
    good: 0,
    acceptable: 0,
    risky: items.length,
    dealerSeat: 0,
    smallBlindSeat: 0,
    bigBlindSeat: 1,
    totalPot: 40,
    summary: "Mão concluída",
    winnerIds: ["bot-1"],
    wentToShowdown: false,
    replay: [],
    feedback: items,
  };
}

test("classifica padrões de erro a partir das decisões do professor", () => {
  const progress = createEmptyTrainingProgress();
  progress.history = [
    history([
      feedback("call", "flop", "call", "fold"),
      feedback("fold", "turn", "fold", "call"),
      feedback("passive", "river", "check", "raise"),
      feedback("raise", "preflop", "raise", "fold"),
    ]),
  ];

  const errors = trainingErrorInsights(progress);

  assert.equal(errors.find((item) => item.kind === "expensive-calls")?.count, 1);
  assert.equal(errors.find((item) => item.kind === "over-folding")?.count, 1);
  assert.equal(errors.find((item) => item.kind === "missed-aggression")?.count, 1);
  assert.equal(errors.find((item) => item.kind === "over-aggression")?.count, 1);
});

test("escolhe a street mais fraca e configura um exercício para alcançá-la", () => {
  const progress = createEmptyTrainingProgress();
  progress.handsPlayed = 10;
  progress.decisions = 10;
  progress.byStreet.preflop = { decisions: 4, good: 3, acceptable: 1, risky: 0 };
  progress.byStreet.turn = { decisions: 6, good: 1, acceptable: 1, risky: 4 };
  progress.history = [
    history([feedback("turn-call", "turn", "call", "fold")]),
  ];

  const focus = recommendedTrainingFocus(progress);
  const config = recommendedTrainingConfig(progress);

  assert.equal(focus.street, "turn");
  assert.equal(focus.errorKind, "expensive-calls");
  assert.equal(config.opponentCount, 1);
  assert.equal(config.botStyles[0], "passive");
  assert.equal(config.difficulty, "intermediate");
  assert.equal(config.actionSpeed, "slow");
});

test("mede evolução recente e prioriza quiz ligado ao ponto fraco", () => {
  const progress = createEmptyTrainingProgress();
  progress.decisions = 8;
  progress.byStreet.river = { decisions: 4, good: 1, acceptable: 0, risky: 3 };
  progress.recentHands = [
    {
      id: "new",
      playedAt: "2026-08-02T12:10:00.000Z",
      handNumber: 4,
      heroNet: 0,
      decisions: 2,
      good: 2,
      acceptable: 0,
      risky: 0,
    },
    {
      id: "old",
      playedAt: "2026-08-02T12:00:00.000Z",
      handNumber: 1,
      heroNet: 0,
      decisions: 2,
      good: 0,
      acceptable: 0,
      risky: 2,
    },
  ];

  const trend = trainingTrend(progress);
  const questions = adaptiveTrainingQuestions(progress);

  assert.equal(trend.direction, "up");
  assert.equal(trend.delta, 100);
  assert.equal(questions[0].street, "river");
});
