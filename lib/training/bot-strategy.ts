import { calculateEquity, calculatePotOdds } from "../poker";
import { getTrainingLegalActions } from "./game-engine";
import {
  heroModelFromActions,
  heroTendencyRates,
  mergeHeroModels,
} from "./player-model";
import { hashSeed, seededRandom } from "./random";
import type {
  HeroTendencyModel,
  TrainingDecision,
  TrainingGameState,
  TrainingLegalActions,
  TrainingPlayer,
} from "./types";

const STYLE_AGGRESSION: Record<TrainingPlayer["style"], number> = {
  tight: -0.06,
  balanced: 0,
  loose: 0.05,
  aggressive: 0.12,
  passive: -0.1,
};

const STYLE_LOOSENESS: Record<TrainingPlayer["style"], number> = {
  tight: -5,
  balanced: 0,
  loose: 6,
  aggressive: 2,
  passive: 3,
};

export interface BotStrategyDiagnostics {
  equity: number;
  potOdds: number;
  minimumDefenseFrequency: number;
  heroModel: HeroTendencyModel;
  heroLabel: ReturnType<typeof heroTendencyRates>["label"];
  adaptation: {
    bluffFrequency: number;
    valueThresholdAdjustment: number;
    trapFrequency: number;
  };
  weights: {
    fold: number;
    passive: number;
    aggressive: number;
    allIn: number;
  };
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function currentHeroModel(state: TrainingGameState) {
  return mergeHeroModels(
    state.config.heroModel,
    heroModelFromActions(state.actions),
  );
}

function adaptiveAdjustments(state: TrainingGameState) {
  const model = currentHeroModel(state);
  const rates = heroTendencyRates(model);
  let bluffFrequency = 0;
  let valueThresholdAdjustment = 0;
  let trapFrequency = 0;

  if (state.config.botStrategy === "adaptive" && rates.sampleSize >= 4) {
    if (rates.foldToBet >= 0.48) bluffFrequency += 0.12;
    if (rates.callRate >= 0.52) {
      bluffFrequency -= 0.08;
      valueThresholdAdjustment -= 6;
    }
    if (rates.vpip >= 0.48) valueThresholdAdjustment -= 3;
    if (rates.aggression >= 0.42) {
      bluffFrequency -= 0.03;
      trapFrequency += 0.12;
    }
  }

  return {
    model,
    rates,
    bluffFrequency,
    valueThresholdAdjustment,
    trapFrequency,
  };
}

/**
 * Reduz o espaço contínuo do no-limit a tamanhos reutilizáveis (33%, 66% e
 * 100% do pote), seguindo a mesma ideia de action abstraction usada em CFR.
 */
export function abstractRaiseTarget(
  state: TrainingGameState,
  legal: TrainingLegalActions,
  strength: "bluff" | "thin" | "value",
  random: () => number,
) {
  const actor = state.players.find((player) => player.id === legal.playerId)!;
  const afterCallPot = state.pot + legal.callAmount;
  const fractions =
    state.street === "preflop"
      ? strength === "value"
        ? [0.66, 1]
        : [0.33, 0.66]
      : strength === "value"
        ? [0.66, 1]
        : strength === "thin"
          ? [0.33, 0.66]
          : [0.33, 0.66, 1];
  const fraction = fractions[Math.min(fractions.length - 1, Math.floor(random() * fractions.length))];
  const target =
    actor.committedStreet +
    legal.callAmount +
    Math.max(state.minimumRaise, Math.round(afterCallPot * fraction));
  return Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, target));
}

function sampleWeighted(
  weights: BotStrategyDiagnostics["weights"],
  random: () => number,
) {
  const entries = Object.entries(weights) as Array<
    [keyof BotStrategyDiagnostics["weights"], number]
  >;
  const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
  let roll = random() * Math.max(total, Number.EPSILON);
  for (const [action, weight] of entries) {
    roll -= Math.max(0, weight);
    if (roll <= 0) return action;
  }
  return "passive";
}

export function botStrategyDiagnostics(
  state: TrainingGameState,
): BotStrategyDiagnostics {
  const legal = getTrainingLegalActions(state);
  if (!legal) throw new RangeError("O bot não possui uma ação pendente.");
  const bot = state.players.find((player) => player.id === legal.playerId);
  if (!bot || bot.isHero) {
    throw new RangeError("A decisão atual não pertence a um bot.");
  }
  const actionCount = state.actions.filter(
    (action) => action.handNumber === state.handNumber,
  ).length;
  const equityRandom = seededRandom(
    hashSeed(state.config.seed, state.handNumber, actionCount, bot.id, "equity"),
  );
  const opponents = Math.max(
    1,
    state.players.filter(
      (player) => player.id !== bot.id && !player.folded && player.handStartStack > 0,
    ).length,
  );
  const simulations =
    state.config.difficulty === "advanced"
      ? 420
      : state.config.difficulty === "intermediate"
        ? 260
        : 140;
  const equity = calculateEquity(bot.holeCards, state.board, {
    opponents,
    opponentStyle: "balanced",
    preflopPressure: state.currentBet > state.bigBlind ? "raised" : "none",
    simulations,
    random: equityRandom,
  });
  const potOdds = calculatePotOdds(state.pot, legal.callAmount);
  const minimumDefenseFrequency =
    legal.toCall > 0 ? (state.pot / (state.pot + legal.toCall)) * 100 : 100;
  const adaptation = adaptiveAdjustments(state);
  const fairShare = 100 / (opponents + 1);
  const styleAggression = STYLE_AGGRESSION[bot.style];
  const looseness = STYLE_LOOSENESS[bot.style];
  const valueThreshold =
    Math.max(52, fairShare + 18) + adaptation.valueThresholdAdjustment;
  const equityEdge = equity + looseness - potOdds;
  const valueStrength = clamp((equity + looseness - valueThreshold + 15) / 32);
  const defendStrength = clamp((equityEdge + 8) / 24);
  const balancedBluffBase = legal.toCall === 0 ? 0.08 : 0.04;
  const bluffFrequency = clamp(
    balancedBluffBase + styleAggression + adaptation.bluffFrequency,
    0.01,
    0.28,
  );
  const pressure = legal.toCall > 0 ? legal.toCall / Math.max(1, state.pot) : 0;
  const foldWeight = legal.canFold
    ? clamp(1 - defendStrength + pressure * 0.2, 0.02, 0.96)
    : 0;
  const passiveWeight = legal.canCheck || legal.canCall
    ? clamp(
        legal.toCall === 0 ? 0.72 - valueStrength * 0.42 : defendStrength,
        0.03,
        0.94,
      ) + adaptation.trapFrequency * valueStrength
    : 0;
  const aggressiveWeight = legal.canRaise
    ? clamp(
        valueStrength * (0.78 - adaptation.trapFrequency) +
          bluffFrequency * (1 - valueStrength),
        0.01,
        0.9,
      )
    : 0;
  const effectiveStack = Math.min(
    bot.stack,
    ...state.players
      .filter((player) => player.id !== bot.id && !player.folded)
      .map((player) => player.stack),
  );
  const spr = effectiveStack / Math.max(1, state.pot);
  const allInWeight = legal.canAllIn && (spr <= 1.4 || equity >= 82)
    ? clamp(valueStrength * 0.36 + bluffFrequency * 0.08, 0, 0.36)
    : 0;
  const mistakeNoise =
    state.config.difficulty === "beginner"
      ? 0.16
      : state.config.difficulty === "intermediate"
        ? 0.07
        : 0;

  return {
    equity,
    potOdds,
    minimumDefenseFrequency,
    heroModel: adaptation.model,
    heroLabel: adaptation.rates.label,
    adaptation: {
      bluffFrequency,
      valueThresholdAdjustment: adaptation.valueThresholdAdjustment,
      trapFrequency: adaptation.trapFrequency,
    },
    weights: {
      fold: foldWeight + mistakeNoise,
      passive: passiveWeight + mistakeNoise,
      aggressive: aggressiveWeight + mistakeNoise * 0.5,
      allIn: allInWeight + mistakeNoise * 0.12,
    },
  };
}

/**
 * Estratégia mista local: combina equidade, pot odds, MDF, abstração de ações
 * e um modelo de tendências do herói. É uma aproximação pedagógica de GTO,
 * não uma solução exata de um solver.
 */
export function chooseBotAction(state: TrainingGameState): TrainingDecision {
  const legal = getTrainingLegalActions(state);
  if (!legal) throw new RangeError("O bot não possui uma ação pendente.");
  const bot = state.players.find((player) => player.id === legal.playerId);
  if (!bot || bot.isHero) {
    throw new RangeError("A decisão atual não pertence a um bot.");
  }
  const actionCount = state.actions.filter(
    (action) => action.handNumber === state.handNumber,
  ).length;
  const random = seededRandom(
    hashSeed(state.config.seed, state.handNumber, actionCount, bot.id, "strategy"),
  );
  const diagnostics = botStrategyDiagnostics(state);
  const sampled = sampleWeighted(diagnostics.weights, random);

  if (sampled === "fold" && legal.canFold) return { type: "fold" };
  if (sampled === "allIn" && legal.canAllIn) return { type: "allIn" };
  if (sampled === "aggressive" && legal.canRaise) {
    const strength =
      diagnostics.equity >= 68
        ? "value"
        : diagnostics.equity >= diagnostics.potOdds + 8
          ? "thin"
          : "bluff";
    const amount = abstractRaiseTarget(state, legal, strength, random);
    return amount >= legal.maxRaiseTo
      ? { type: "allIn" }
      : { type: "raise", amount };
  }
  if (legal.canCall) return { type: "call" };
  if (legal.canCheck) return { type: "check" };
  if (legal.canFold) return { type: "fold" };
  return { type: "allIn" };
}
