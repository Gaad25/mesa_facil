import {
  analyzeSpot,
  type PokerAction,
  type PreflopPressure,
  type TablePosition,
} from "../poker";
import { getTrainingLegalActions } from "./game-engine";
import { hashSeed, seededRandom } from "./random";
import type {
  TeacherFeedback,
  TeacherGrade,
  TrainingActionType,
  TrainingDecision,
  TrainingGameState,
  TrainingPlayer,
} from "./types";

const ACTION_MAP: Record<PokerAction, TrainingActionType> = {
  FOLD: "fold",
  CHECK: "check",
  CALL: "call",
  RAISE: "raise",
  ALL_IN: "allIn",
};

function positionFor(
  state: TrainingGameState,
  hero: TrainingPlayer,
): TablePosition {
  if (hero.seat === state.dealerSeat) return "BTN";
  if (hero.seat === state.smallBlindSeat) return "SB";
  if (hero.seat === state.bigBlindSeat) return "BB";
  const active = state.players.filter((player) => player.handStartStack > 0);
  const distance =
    (hero.seat - state.dealerSeat + state.players.length) % state.players.length;
  if (distance <= Math.max(1, Math.floor(active.length / 3))) return "EARLY";
  if (distance >= Math.max(2, active.length - 2)) return "LATE";
  return "MIDDLE";
}

function pressureFor(state: TrainingGameState): PreflopPressure {
  if (state.street !== "preflop") return "none";
  if (state.currentBet <= state.bigBlind) return "none";
  if (state.currentBet <= state.bigBlind * 3.5) return "raised";
  if (state.currentBet <= state.bigBlind * 9) return "threeBet";
  return "allIn";
}

function analyzeHeroSpot(state: TrainingGameState) {
  const legal = getTrainingLegalActions(state);
  const hero = state.players.find((player) => player.isHero);
  if (!legal || !hero || legal.playerId !== hero.id) return null;
  const opponents = state.players.filter(
    (player) => !player.isHero && !player.folded && player.handStartStack > 0,
  );
  const random = seededRandom(
    hashSeed(state.config.seed, state.handNumber, state.actions.length, "teacher"),
  );

  return analyzeSpot({
    holeCards: hero.holeCards,
    board: state.board,
    pot: state.pot,
    callAmount: legal.callAmount,
    bigBlind: state.bigBlind,
    effectiveStack: hero.stack,
    opponents: Math.max(1, opponents.length),
    opponentStyles: opponents.map((opponent) => opponent.style),
    position: positionFor(state, hero),
    preflopPressure: pressureFor(state),
    emotionalState: "calm",
    canRaise: legal.canRaise,
    minimumRaise: Math.max(0, legal.minRaiseTo - hero.committedStreet),
    simulations: 260,
    random,
  });
}

function gradeDecision(
  actual: TrainingActionType,
  recommended: TrainingActionType,
  equity: number,
  potOdds: number,
): TeacherGrade {
  if (actual === recommended) return "good";
  if (
    (actual === "raise" && recommended === "allIn") ||
    (actual === "allIn" && recommended === "raise")
  ) {
    return "acceptable";
  }
  const margin = equity - potOdds;
  if (
    (recommended === "fold" && actual === "call" && margin >= -3) ||
    (recommended === "call" && actual === "fold" && margin <= 5) ||
    (recommended === "raise" && actual === "call" && margin >= 8) ||
    (recommended === "check" && actual === "raise" && equity >= 58)
  ) {
    return "acceptable";
  }
  return "risky";
}

export function createTeacherHint(
  state: TrainingGameState,
): TeacherFeedback | null {
  const analysis = analyzeHeroSpot(state);
  if (!analysis) return null;
  const recommendedAction = ACTION_MAP[analysis.action];
  return {
    id: `hint-${state.handNumber}-${state.actions.length}`,
    handNumber: state.handNumber,
    street: state.street,
    recommendedAction,
    title: "Pense no preço antes de agir",
    explanation: analysis.reason,
    teachingPoint: analysis.teachingPoint,
    analysis,
  };
}

export function evaluateHeroDecision(
  stateBeforeAction: TrainingGameState,
  decision: TrainingDecision,
): TeacherFeedback | null {
  const analysis = analyzeHeroSpot(stateBeforeAction);
  if (!analysis) return null;
  const recommendedAction = ACTION_MAP[analysis.action];
  const grade = gradeDecision(
    decision.type,
    recommendedAction,
    analysis.equity,
    analysis.potOdds,
  );
  const titles: Record<TeacherGrade, string> = {
    good: "Boa decisão",
    acceptable: "Linha defensável",
    risky: "Decisão arriscada",
  };
  const lead: Record<TeacherGrade, string> = {
    good: "Sua ação acompanha a linha recomendada para esta situação.",
    acceptable:
      "Há argumentos para sua escolha, embora exista uma linha mais consistente.",
    risky:
      "O preço, a força da mão ou a pressão da mesa favoreciam outra escolha.",
  };

  return {
    id: `feedback-${stateBeforeAction.handNumber}-${stateBeforeAction.actions.length}`,
    handNumber: stateBeforeAction.handNumber,
    street: stateBeforeAction.street,
    actualAction: decision.type,
    recommendedAction,
    grade,
    title: titles[grade],
    explanation: `${lead[grade]} ${analysis.reason}`,
    teachingPoint: analysis.teachingPoint,
    analysis,
  };
}
