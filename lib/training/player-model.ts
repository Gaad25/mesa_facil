import type {
  HeroTendencyModel,
  TrainingActionRecord,
  TrainingProgress,
} from "./types";

export const EMPTY_HERO_MODEL: HeroTendencyModel = {
  actions: 0,
  voluntaryPreflop: 0,
  preflopOpportunities: 0,
  aggressiveActions: 0,
  calls: 0,
  foldsFacingBet: 0,
  facedBets: 0,
};

export interface HeroTendencyRates {
  sampleSize: number;
  vpip: number;
  aggression: number;
  callRate: number;
  foldToBet: number;
  label: "sem amostra" | "conservador" | "agressivo" | "pagador" | "equilibrado";
}

export function normalizeHeroTendencyModel(value: unknown): HeroTendencyModel {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<HeroTendencyModel>)
      : {};
  const count = (item: unknown) =>
    typeof item === "number" && Number.isFinite(item)
      ? Math.min(1_000_000, Math.max(0, Math.round(item)))
      : 0;
  return {
    actions: count(candidate.actions),
    voluntaryPreflop: count(candidate.voluntaryPreflop),
    preflopOpportunities: count(candidate.preflopOpportunities),
    aggressiveActions: count(candidate.aggressiveActions),
    calls: count(candidate.calls),
    foldsFacingBet: count(candidate.foldsFacingBet),
    facedBets: count(candidate.facedBets),
  };
}

export function mergeHeroModels(
  ...models: Array<HeroTendencyModel | undefined>
): HeroTendencyModel {
  return models.reduce<HeroTendencyModel>(
    (total, model) => ({
      actions: total.actions + (model?.actions ?? 0),
      voluntaryPreflop:
        total.voluntaryPreflop + (model?.voluntaryPreflop ?? 0),
      preflopOpportunities:
        total.preflopOpportunities + (model?.preflopOpportunities ?? 0),
      aggressiveActions:
        total.aggressiveActions + (model?.aggressiveActions ?? 0),
      calls: total.calls + (model?.calls ?? 0),
      foldsFacingBet:
        total.foldsFacingBet + (model?.foldsFacingBet ?? 0),
      facedBets: total.facedBets + (model?.facedBets ?? 0),
    }),
    { ...EMPTY_HERO_MODEL },
  );
}

export function heroModelFromActions(
  actions: readonly TrainingActionRecord[],
): HeroTendencyModel {
  const heroActions = actions.filter((action) => action.playerId === "hero");
  const preflopHands = new Map<number, boolean>();
  const model = { ...EMPTY_HERO_MODEL };

  for (const action of heroActions) {
    model.actions += 1;
    if (action.action === "raise" || action.action === "allIn") {
      model.aggressiveActions += 1;
    }
    if (action.action === "call") model.calls += 1;
    const facedBet =
      (action.toCallBefore ?? (action.action === "fold" || action.action === "call" ? 1 : 0)) > 0;
    if (facedBet) {
      model.facedBets += 1;
      if (action.action === "fold") model.foldsFacingBet += 1;
    }
    if (action.street === "preflop") {
      const voluntary =
        action.action === "call" ||
        action.action === "raise" ||
        action.action === "allIn";
      preflopHands.set(
        action.handNumber,
        (preflopHands.get(action.handNumber) ?? false) || voluntary,
      );
    }
  }

  model.preflopOpportunities = preflopHands.size;
  model.voluntaryPreflop = [...preflopHands.values()].filter(Boolean).length;
  return model;
}

export function heroModelFromProgress(
  progress: TrainingProgress,
): HeroTendencyModel {
  if (progress.heroModel.actions > 0) return progress.heroModel;
  const actions = progress.history.flatMap((hand) =>
    hand.replay.flatMap((frame) =>
      frame.event === "action" && frame.action ? [frame.action] : [],
    ),
  );
  return heroModelFromActions(actions);
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

export function heroTendencyRates(
  model: HeroTendencyModel,
): HeroTendencyRates {
  const vpip = rate(model.voluntaryPreflop, model.preflopOpportunities);
  const aggression = rate(model.aggressiveActions, model.actions);
  const callRate = rate(model.calls, model.facedBets);
  const foldToBet = rate(model.foldsFacingBet, model.facedBets);
  const label =
    model.actions < 4
      ? "sem amostra"
      : foldToBet >= 0.5 || vpip < 0.25
        ? "conservador"
        : callRate >= 0.55 || vpip >= 0.5
          ? "pagador"
          : aggression >= 0.42
            ? "agressivo"
            : "equilibrado";
  return {
    sampleSize: model.actions,
    vpip,
    aggression,
    callRate,
    foldToBet,
    label,
  };
}
