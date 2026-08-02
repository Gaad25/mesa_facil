import type { OpponentStyle } from "../poker";
import { trainingSolidRate } from "./progress";
import type {
  TeacherFeedback,
  TrainingActionSpeed,
  TrainingConfig,
  TrainingDifficulty,
  TrainingProgress,
  TrainingStreet,
} from "./types";

export type PracticeStreet = Exclude<TrainingStreet, "showdown">;

export type TrainingErrorKind =
  | "expensive-calls"
  | "over-folding"
  | "missed-aggression"
  | "over-aggression";

export interface TrainingErrorInsight {
  kind: TrainingErrorKind;
  label: string;
  description: string;
  count: number;
  streetCounts: Partial<Record<PracticeStreet, number>>;
}

export interface TrainingFocus {
  street: PracticeStreet;
  streetLabel: string;
  errorKind?: TrainingErrorKind;
  errorLabel?: string;
  title: string;
  description: string;
}

export interface TrainingTrendPoint {
  handNumber: number;
  rate: number;
  playedAt: string;
}

export interface TrainingTrend {
  points: TrainingTrendPoint[];
  delta: number;
  direction: "up" | "stable" | "down" | "new";
  label: string;
}

export interface TrainingQuizQuestion {
  id: string;
  eyebrow: string;
  street: PracticeStreet | "mindset";
  errorKind?: TrainingErrorKind;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
}

export const PRACTICE_STREETS: PracticeStreet[] = [
  "preflop",
  "flop",
  "turn",
  "river",
];

export const TRAINING_STREET_LABELS: Record<TrainingStreet, string> = {
  preflop: "Pré-flop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
  showdown: "Showdown",
};

const ERROR_COPY: Record<
  TrainingErrorKind,
  Pick<TrainingErrorInsight, "label" | "description">
> = {
  "expensive-calls": {
    label: "Calls caros",
    description: "Pagamentos em situações nas quais abandonar preservava fichas.",
  },
  "over-folding": {
    label: "Folds excessivos",
    description: "Abandonos quando o preço e a equidade permitiam continuar.",
  },
  "missed-aggression": {
    label: "Valor perdido",
    description: "Checks ou calls quando apostar por valor era a linha mais forte.",
  },
  "over-aggression": {
    label: "Agressão excessiva",
    description: "Raises ou all-ins em spots que pediam controle do pote.",
  },
};

export const DEFAULT_TRAINING_CONFIG: Omit<TrainingConfig, "seed"> = {
  opponentCount: 2,
  difficulty: "beginner",
  teacherMode: "guided",
  actionSpeed: "normal",
  format: "cash",
  botStrategy: "adaptive",
  botStyles: ["balanced", "tight", "aggressive", "loose", "passive"],
  startingStack: 1_000,
  smallBlind: 5,
  bigBlind: 10,
  ante: 0,
  blindLevelHands: 0,
  heroModel: {
    actions: 0,
    voluntaryPreflop: 0,
    preflopOpportunities: 0,
    aggressiveActions: 0,
    calls: 0,
    foldsFacingBet: 0,
    facedBets: 0,
  },
};

export const TRAINING_QUESTIONS: TrainingQuizQuestion[] = [
  {
    id: "preflop-position",
    eyebrow: "Posição",
    street: "preflop",
    question:
      "Por que jogar no botão costuma ser melhor do que jogar nas primeiras posições?",
    options: [
      "Você age depois da maioria dos adversários",
      "O botão sempre recebe cartas melhores",
      "Você não precisa pagar apostas",
    ],
    correct: 0,
    explanation:
      "Agir por último traz mais informação antes de você tomar a decisão.",
  },
  {
    id: "preflop-three-bet",
    eyebrow: "Seleção pré-flop",
    street: "preflop",
    errorKind: "over-aggression",
    question:
      "Um jogador conservador aumenta de posição inicial. O que fazer com uma mão marginal fora de posição?",
    options: [
      "Abandonar e esperar um spot melhor",
      "Dar all-in para mostrar força",
      "Aumentar sempre, independentemente dos stacks",
    ],
    correct: 0,
    explanation:
      "Ranges de posição inicial tendem a ser fortes. Fora de posição, a disciplina evita potes caros com mãos dominadas.",
  },
  {
    id: "flop-pot-odds",
    eyebrow: "Pot odds",
    street: "flop",
    errorKind: "expensive-calls",
    question:
      "O pote tem 100 fichas e custa 25 para pagar. Qual é aproximadamente sua pot odd?",
    options: ["20%", "25%", "33%"],
    correct: 0,
    explanation:
      "Você investe 25 para disputar um pote final de 125: 25 ÷ 125 = 20%.",
  },
  {
    id: "flop-draw",
    eyebrow: "Draw",
    street: "flop",
    errorKind: "over-folding",
    question:
      "No flop, um flush draw com 9 outs tem aproximadamente qual chance de completar até o river?",
    options: ["18%", "36%", "54%"],
    correct: 1,
    explanation:
      "A regra rápida é multiplicar os outs por 4 no flop: 9 × 4 ≈ 36%.",
  },
  {
    id: "turn-value",
    eyebrow: "Valor no turn",
    street: "turn",
    errorKind: "missed-aggression",
    question:
      "Você tem uma mão forte no turn e o adversário costuma pagar com pares piores. Qual é o objetivo principal?",
    options: [
      "Apostar um tamanho que mãos piores possam pagar",
      "Dar check sempre para esconder sua mão",
      "Ir all-in independentemente do pote",
    ],
    correct: 0,
    explanation:
      "Extrair valor significa escolher uma aposta que mantenha mãos piores na jogada.",
  },
  {
    id: "turn-control",
    eyebrow: "Controle do pote",
    street: "turn",
    errorKind: "over-aggression",
    question:
      "No turn, sua mão média tem valor de showdown e poucas mãos piores pagam um raise. Qual linha costuma ser prudente?",
    options: [
      "Controlar o tamanho do pote com check ou call",
      "Transformar toda mão média em all-in",
      "Aumentar porque o turn sempre favorece o agressor",
    ],
    correct: 0,
    explanation:
      "Quando um raise recebe ação principalmente de mãos melhores, controlar o pote preserva o valor de showdown.",
  },
  {
    id: "river-bluff-catcher",
    eyebrow: "Decisão no river",
    street: "river",
    errorKind: "expensive-calls",
    question:
      "No river você só vence blefes. Antes de pagar uma aposta grande, o que mais importa?",
    options: [
      "Se há blefes suficientes no range adversário para justificar o preço",
      "O valor absoluto das suas cartas, sem considerar a ação",
      "Recuperar as fichas investidas nas streets anteriores",
    ],
    correct: 0,
    explanation:
      "Fichas já investidas não voltam. Um bluff catcher só paga de forma lucrativa quando frequência de blefe e pot odds justificam.",
  },
  {
    id: "river-thin-value",
    eyebrow: "Valor fino",
    street: "river",
    errorKind: "missed-aggression",
    question:
      "Você acredita que pares piores ainda pagam uma aposta pequena no river. Que conceito descreve essa jogada?",
    options: ["Aposta por valor fino", "Blefe puro", "Slow play pré-flop"],
    correct: 0,
    explanation:
      "Valor fino é apostar uma mão que ainda pode ser paga por parte suficiente das mãos piores.",
  },
  {
    id: "mindset-pause",
    eyebrow: "Disciplina",
    street: "mindset",
    question:
      "Você perdeu dois potes grandes e está irritado. Qual é a melhor resposta?",
    options: [
      "Aumentar a agressividade para recuperar",
      "Fazer uma pausa curta e reduzir decisões marginais",
      "Jogar todas as mãos até ganhar uma",
    ],
    correct: 1,
    explanation:
      "Tilt aumenta erros. Uma pausa protege a banca e melhora a qualidade das decisões.",
  },
];

function classifyTrainingError(
  feedback: TeacherFeedback,
): TrainingErrorKind | null {
  if (!feedback.actualAction || feedback.grade !== "risky") return null;
  const actual = feedback.actualAction;
  const recommended = feedback.recommendedAction;
  const actualAggressive = actual === "raise" || actual === "allIn";
  const recommendedAggressive =
    recommended === "raise" || recommended === "allIn";

  if (recommended === "fold" && actual === "call") return "expensive-calls";
  if (actual === "fold" && recommended !== "fold") return "over-folding";
  if (recommendedAggressive && !actualAggressive) return "missed-aggression";
  if (
    actualAggressive &&
    (recommended === "fold" || recommended === "check" || recommended === "call")
  ) {
    return "over-aggression";
  }
  return null;
}

export function trainingErrorInsights(
  progress: TrainingProgress,
): TrainingErrorInsight[] {
  const counts = new Map<
    TrainingErrorKind,
    { count: number; streetCounts: Partial<Record<PracticeStreet, number>> }
  >();

  for (const hand of progress.history) {
    for (const feedback of hand.feedback) {
      const kind = classifyTrainingError(feedback);
      if (!kind || feedback.street === "showdown") continue;
      const current = counts.get(kind) ?? { count: 0, streetCounts: {} };
      current.count += 1;
      current.streetCounts[feedback.street] =
        (current.streetCounts[feedback.street] ?? 0) + 1;
      counts.set(kind, current);
    }
  }

  return (Object.keys(ERROR_COPY) as TrainingErrorKind[])
    .map((kind) => ({
      kind,
      ...ERROR_COPY[kind],
      count: counts.get(kind)?.count ?? 0,
      streetCounts: counts.get(kind)?.streetCounts ?? {},
    }))
    .sort((first, second) => second.count - first.count);
}

export function recommendedTrainingFocus(
  progress: TrainingProgress,
): TrainingFocus {
  const practiced = PRACTICE_STREETS.filter(
    (street) => progress.byStreet[street].decisions > 0,
  );
  const street = practiced.length
    ? [...practiced].sort((first, second) => {
        const firstStats = progress.byStreet[first];
        const secondStats = progress.byStreet[second];
        const rateDifference =
          trainingSolidRate(firstStats) - trainingSolidRate(secondStats);
        return rateDifference || secondStats.risky - firstStats.risky;
      })[0]
    : "preflop";
  const error = trainingErrorInsights(progress).find(
    (item) => (item.streetCounts[street] ?? 0) > 0,
  );
  const streetLabel = TRAINING_STREET_LABELS[street];

  return {
    street,
    streetLabel,
    errorKind: error?.kind,
    errorLabel: error?.label,
    title: progress.decisions
      ? `Fortaleça suas decisões no ${streetLabel.toLowerCase()}`
      : "Comece pela base pré-flop",
    description: error
      ? `${error.label} é o padrão que mais merece atenção nesta street.`
      : progress.decisions
        ? "Este é o ponto com menor consistência no seu histórico recente."
        : "Uma mesa guiada e calma ajuda a construir seleção de mãos e posição.",
  };
}

export function recommendedTrainingConfig(
  progress: TrainingProgress,
): Omit<TrainingConfig, "seed"> {
  const focus = recommendedTrainingFocus(progress);
  const laterStreet = focus.street === "turn" || focus.street === "river";
  const botStyles: OpponentStyle[] = laterStreet
    ? ["passive", "balanced", "tight", "loose", "aggressive"]
    : focus.street === "flop"
      ? ["loose", "passive", "balanced", "tight", "aggressive"]
      : ["tight", "aggressive", "balanced", "loose", "passive"];
  const difficulty: TrainingDifficulty =
    progress.handsPlayed >= 20
      ? "advanced"
      : progress.handsPlayed >= 8
        ? "intermediate"
        : "beginner";
  const actionSpeed: TrainingActionSpeed =
    focus.street === "preflop" ? "normal" : "slow";

  return {
    ...DEFAULT_TRAINING_CONFIG,
    opponentCount: laterStreet ? 1 : focus.street === "flop" ? 2 : 3,
    difficulty,
    actionSpeed,
    botStyles,
  };
}

export function trainingTrend(progress: TrainingProgress): TrainingTrend {
  const points = progress.recentHands
    .filter((hand) => hand.decisions > 0)
    .slice(0, 8)
    .reverse()
    .map((hand) => ({
      handNumber: hand.handNumber,
      rate: trainingSolidRate(hand),
      playedAt: hand.playedAt,
    }));

  if (points.length < 2) {
    return {
      points,
      delta: 0,
      direction: "new",
      label: "Complete mais duas mãos para medir a evolução",
    };
  }

  const midpoint = Math.ceil(points.length / 2);
  const average = (values: TrainingTrendPoint[]) =>
    values.reduce((sum, item) => sum + item.rate, 0) / values.length;
  const delta = Math.round(
    average(points.slice(midpoint)) - average(points.slice(0, midpoint)),
  );
  const direction = delta > 5 ? "up" : delta < -5 ? "down" : "stable";

  return {
    points,
    delta,
    direction,
    label:
      direction === "up"
        ? `Evolução de ${delta} pontos nas mãos recentes`
        : direction === "down"
          ? `Queda de ${Math.abs(delta)} pontos: vale revisar as últimas mãos`
          : "Consistência estável nas mãos recentes",
  };
}

export function adaptiveTrainingQuestions(
  progress: TrainingProgress,
): TrainingQuizQuestion[] {
  const focus = recommendedTrainingFocus(progress);
  return [...TRAINING_QUESTIONS].sort((first, second) => {
    const score = (question: TrainingQuizQuestion) =>
      (question.street === focus.street ? 2 : 0) +
      (focus.errorKind && question.errorKind === focus.errorKind ? 1 : 0);
    return score(second) - score(first);
  });
}
