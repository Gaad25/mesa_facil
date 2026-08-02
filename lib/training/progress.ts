import type {
  TeacherFeedback,
  TrainingDecisionStats,
  TrainingGameState,
  TrainingHandHistory,
  TrainingProgress,
  TrainingReplayFrame,
  TrainingStreet,
} from "./types";
import {
  EMPTY_HERO_MODEL,
  heroModelFromActions,
  mergeHeroModels,
  normalizeHeroTendencyModel,
} from "./player-model";

const STREETS: TrainingStreet[] = [
  "preflop",
  "flop",
  "turn",
  "river",
  "showdown",
];

function emptyStats(): TrainingDecisionStats {
  return { decisions: 0, good: 0, acceptable: 0, risky: 0 };
}

export function createEmptyTrainingProgress(): TrainingProgress {
  return {
    version: 1,
    handsPlayed: 0,
    totalResult: 0,
    ...emptyStats(),
    byStreet: {
      preflop: emptyStats(),
      flop: emptyStats(),
      turn: emptyStats(),
      river: emptyStats(),
      showdown: emptyStats(),
    },
    heroModel: { ...EMPTY_HERO_MODEL },
    recentHands: [],
    history: [],
    recordedHandIds: [],
  };
}

function safeCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

function safeResult(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : 0;
}

function normalizeStats(value: unknown): TrainingDecisionStats {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<TrainingDecisionStats>)
      : {};
  return {
    decisions: safeCount(candidate.decisions),
    good: safeCount(candidate.good),
    acceptable: safeCount(candidate.acceptable),
    risky: safeCount(candidate.risky),
  };
}

function isReplayFrame(value: unknown): value is TrainingReplayFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as Partial<TrainingReplayFrame>;
  return (
    typeof frame.id === "string" &&
    (frame.event === "deal" ||
      frame.event === "action" ||
      frame.event === "street" ||
      frame.event === "result") &&
    STREETS.includes(frame.street as TrainingStreet) &&
    Array.isArray(frame.board) &&
    Array.isArray(frame.players) &&
    typeof frame.pot === "number" &&
    typeof frame.currentBet === "number"
  );
}

function isTeacherFeedback(value: unknown): value is TeacherFeedback {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TeacherFeedback>;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.explanation === "string" &&
    typeof item.teachingPoint === "string" &&
    STREETS.includes(item.street as TrainingStreet) &&
    Boolean(item.analysis)
  );
}

function normalizeHistory(value: unknown): TrainingHandHistory[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Partial<TrainingHandHistory>;
    if (
      typeof item.id !== "string" ||
      !Array.isArray(item.replay) ||
      !item.replay.some(isReplayFrame)
    ) {
      return [];
    }
    return [{
      id: item.id.slice(0, 120),
      playedAt:
        typeof item.playedAt === "string"
          ? item.playedAt.slice(0, 40)
          : new Date(0).toISOString(),
      handNumber: safeCount(item.handNumber),
      heroNet: safeResult(item.heroNet),
      ...normalizeStats(item),
      dealerSeat: safeCount(item.dealerSeat),
      smallBlindSeat: safeCount(item.smallBlindSeat),
      bigBlindSeat: safeCount(item.bigBlindSeat),
      totalPot: safeCount(item.totalPot),
      summary: typeof item.summary === "string" ? item.summary.slice(0, 300) : "Mão concluída.",
      winnerIds: Array.isArray(item.winnerIds)
        ? item.winnerIds.filter((id): id is string => typeof id === "string").slice(0, 6)
        : [],
      wentToShowdown: item.wentToShowdown === true,
      replay: item.replay.filter(isReplayFrame).slice(0, 80),
      feedback: Array.isArray(item.feedback)
        ? item.feedback.filter(isTeacherFeedback).slice(0, 20)
        : [],
    }];
  });
}

export function normalizeTrainingProgress(value: unknown): TrainingProgress {
  if (!value || typeof value !== "object") return createEmptyTrainingProgress();
  const candidate = value as Partial<TrainingProgress>;
  if (candidate.version !== 1) return createEmptyTrainingProgress();
  const baseStats = normalizeStats(candidate);
  const rawByStreet =
    candidate.byStreet && typeof candidate.byStreet === "object"
      ? candidate.byStreet
      : ({} as TrainingProgress["byStreet"]);
  const recentHands = Array.isArray(candidate.recentHands)
    ? candidate.recentHands.slice(0, 20).flatMap((hand) => {
        if (!hand || typeof hand !== "object") return [];
        const item = hand as Partial<TrainingProgress["recentHands"][number]>;
        if (typeof item.id !== "string") return [];
        return [
          {
            id: item.id.slice(0, 120),
            playedAt:
              typeof item.playedAt === "string"
                ? item.playedAt.slice(0, 40)
                : new Date(0).toISOString(),
            handNumber: safeCount(item.handNumber),
            heroNet: safeResult(item.heroNet),
            ...normalizeStats(item),
          },
        ];
      })
    : [];

  return {
    version: 1,
    handsPlayed: safeCount(candidate.handsPlayed),
    totalResult: safeResult(candidate.totalResult),
    ...baseStats,
    byStreet: Object.fromEntries(
      STREETS.map((street) => [street, normalizeStats(rawByStreet[street])]),
    ) as TrainingProgress["byStreet"],
    heroModel: normalizeHeroTendencyModel(candidate.heroModel),
    recentHands,
    history: normalizeHistory(candidate.history),
    recordedHandIds: Array.isArray(candidate.recordedHandIds)
      ? candidate.recordedHandIds
          .filter((id): id is string => typeof id === "string")
          .slice(-100)
          .map((id) => id.slice(0, 120))
      : [],
  };
}

function addFeedback(stats: TrainingDecisionStats, item: TeacherFeedback) {
  stats.decisions += 1;
  if (item.grade === "good") stats.good += 1;
  if (item.grade === "acceptable") stats.acceptable += 1;
  if (item.grade === "risky") stats.risky += 1;
}

export function recordCompletedTrainingHand(
  current: TrainingProgress,
  game: TrainingGameState,
  feedback: readonly TeacherFeedback[],
  playedAt = new Date().toISOString(),
): TrainingProgress {
  if (!game.result || game.status === "playing") return current;
  const handId = `${game.id}:${game.handNumber}`;
  if (current.recordedHandIds.includes(handId)) return current;
  const handFeedback = feedback.filter(
    (item) => item.handNumber === game.handNumber && item.actualAction,
  );
  const handStats = emptyStats();
  const byStreet = Object.fromEntries(
    STREETS.map((street) => [street, { ...current.byStreet[street] }]),
  ) as TrainingProgress["byStreet"];
  const totals: TrainingDecisionStats = {
    decisions: current.decisions,
    good: current.good,
    acceptable: current.acceptable,
    risky: current.risky,
  };

  for (const item of handFeedback) {
    addFeedback(handStats, item);
    addFeedback(totals, item);
    addFeedback(byStreet[item.street], item);
  }

  return {
    ...current,
    ...totals,
    handsPlayed: current.handsPlayed + 1,
    totalResult: current.totalResult + game.result.heroNet,
    byStreet,
    heroModel: mergeHeroModels(
      current.heroModel,
      heroModelFromActions(
        game.actions.filter((action) => action.handNumber === game.handNumber),
      ),
    ),
    recentHands: [
      {
        id: handId,
        playedAt,
        handNumber: game.handNumber,
        heroNet: game.result.heroNet,
        ...handStats,
      },
      ...current.recentHands,
    ].slice(0, 20),
    history: [
      {
        id: handId,
        playedAt,
        handNumber: game.handNumber,
        heroNet: game.result.heroNet,
        ...handStats,
        dealerSeat: game.dealerSeat,
        smallBlindSeat: game.smallBlindSeat,
        bigBlindSeat: game.bigBlindSeat,
        totalPot: game.result.totalPot,
        summary: game.result.summary,
        winnerIds: [...game.result.winnerIds],
        wentToShowdown: game.street === "showdown",
        replay: game.replay,
        feedback: handFeedback,
      },
      ...current.history,
    ].slice(0, 20),
    recordedHandIds: [...current.recordedHandIds, handId].slice(-100),
  };
}

export function trainingSolidRate(progress: TrainingDecisionStats) {
  if (progress.decisions === 0) return 0;
  return Math.round(
    ((progress.good + progress.acceptable) / progress.decisions) * 100,
  );
}
