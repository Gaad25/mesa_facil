/**
 * Motor local de Texas Hold'em.
 *
 * Todas as porcentagens públicas usam a escala 0–100. O motor não depende de
 * rede nem de bibliotecas externas e limita as simulações para continuar
 * responsivo em celulares.
 */

export type Suit = "clubs" | "diamonds" | "hearts" | "spades";

export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A";

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type HandCategory =
  | "high_card"
  | "pair"
  | "two_pair"
  | "three_of_a_kind"
  | "straight"
  | "flush"
  | "full_house"
  | "four_of_a_kind"
  | "straight_flush";

export interface HandEvaluation {
  category: HandCategory;
  categoryRank: number;
  name: string;
  cards: Card[];
  tiebreakers: number[];
  score: number;
}

export type OpponentStyle =
  | "tight"
  | "balanced"
  | "loose"
  | "aggressive"
  | "passive";

export type PreflopPressure =
  | "none"
  | "limped"
  | "raised"
  | "threeBet"
  | "allIn";

export type TablePosition =
  | "UTG"
  | "EARLY"
  | "MIDDLE"
  | "LATE"
  | "CO"
  | "BTN"
  | "SB"
  | "BB";

export type EmotionalState = "calm" | "tired" | "tilted";

export interface EquityOptions {
  opponents?: number;
  opponentStyle?: OpponentStyle;
  opponentStyles?: OpponentStyle[];
  preflopPressure?: PreflopPressure | number;
  simulations?: number;
  /**
   * Permite um gerador semeado em testes. No app, Math.random é suficiente
   * porque os resultados são apenas estimativas estratégicas.
   */
  random?: () => number;
}

export interface BoardTextureAnalysis {
  label: string;
  danger: "LOW" | "MEDIUM" | "HIGH";
  wetness: number;
  paired: boolean;
  monotone: boolean;
  twoTone: boolean;
  connected: boolean;
  straightPossible: boolean;
  flushPossible: boolean;
  heroFlushDraw: boolean;
  heroStraightDraw: boolean;
  features: string[];
}

export interface BettingContext {
  holeCards: readonly Card[];
  board?: readonly Card[];
  pot: number;
  /** Quantidade adicional necessária para pagar a aposta atual. */
  callAmount?: number;
  /** Alias aceito para facilitar integrações. */
  toCall?: number;
  bigBlind: number;
  /** Fichas efetivas ainda disponíveis para esta decisão. */
  effectiveStack: number;
  /** Número de adversários ainda disputando a mão (1–8). */
  opponents?: number;
  position?: TablePosition;
  opponentStyle?: OpponentStyle;
  opponentStyles?: OpponentStyle[];
  preflopPressure?: PreflopPressure | number;
  emotionalState?: EmotionalState;
  isTired?: boolean;
  isTilted?: boolean;
  canRaise?: boolean;
  /**
   * Menor quantidade adicional permitida para a ação de raise. Se omitida,
   * o motor estima um tamanho legal e prático a partir do blind e do pote.
   */
  minimumRaise?: number;
  simulations?: number;
  random?: () => number;
}

export type PokerAction = "FOLD" | "CHECK" | "CALL" | "RAISE" | "ALL_IN";

export interface PokerAnalysis {
  action: PokerAction;
  /** Fichas adicionais que o jogador deve colocar agora. */
  amount: number;
  equity: number;
  potOdds: number;
  outs: number;
  spr: number;
  handName: string;
  texture: BoardTextureAnalysis;
  rangeLabel: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  reason: string;
  teachingPoint: string;
}

const SUITS: Suit[] = ["clubs", "diamonds", "hearts", "spades"];
const RANKS: Rank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

const RANK_VALUE: Record<Rank, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

const CATEGORY_NAME: Record<HandCategory, string> = {
  high_card: "Carta alta",
  pair: "Um par",
  two_pair: "Dois pares",
  three_of_a_kind: "Trinca",
  straight: "Sequência",
  flush: "Flush",
  full_house: "Full house",
  four_of_a_kind: "Quadra",
  straight_flush: "Straight flush",
};

const CATEGORY_RANK: Record<HandCategory, number> = {
  high_card: 0,
  pair: 1,
  two_pair: 2,
  three_of_a_kind: 3,
  straight: 4,
  flush: 5,
  full_house: 6,
  four_of_a_kind: 7,
  straight_flush: 8,
};

interface FiveCardEvaluation {
  category: HandCategory;
  categoryRank: number;
  tiebreakers: number[];
  score: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, decimals = 1): number {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function cardKey(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

function assertValidCards(cards: readonly Card[], maximum = 7): void {
  if (cards.length > maximum) {
    throw new RangeError(`São permitidas no máximo ${maximum} cartas.`);
  }

  const seen = new Set<string>();
  for (const card of cards) {
    if (!RANKS.includes(card.rank) || !SUITS.includes(card.suit)) {
      throw new TypeError("Carta inválida.");
    }
    const key = cardKey(card);
    if (seen.has(key)) {
      throw new RangeError(`Carta duplicada: ${key}.`);
    }
    seen.add(key);
  }
}

function assertNoDuplicateKnownCards(
  holeCards: readonly Card[],
  board: readonly Card[],
): void {
  assertValidCards(holeCards, 2);
  assertValidCards(board, 5);
  assertValidCards([...holeCards, ...board], 7);
  if (holeCards.length !== 2) {
    throw new RangeError("Texas Hold'em exige exatamente duas cartas na mão.");
  }
}

function scoreFrom(categoryRank: number, tiebreakers: readonly number[]): number {
  let score = categoryRank;
  for (let index = 0; index < 5; index += 1) {
    score = score * 15 + (tiebreakers[index] ?? 0);
  }
  return score;
}

function straightHigh(ranks: readonly number[]): number | null {
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);

  let run = 1;
  for (let index = 1; index < unique.length; index += 1) {
    if (unique[index - 1] - unique[index] === 1) {
      run += 1;
      if (run >= 5) return unique[index] + 4;
    } else {
      run = 1;
    }
  }
  return null;
}

function evaluateFive(cards: readonly Card[]): FiveCardEvaluation {
  const values = cards.map((card) => RANK_VALUE[card.rank]);
  const descending = [...values].sort((a, b) => b - a);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const straight = straightHigh(values);

  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const groups = [...counts.entries()].sort(
    ([rankA, countA], [rankB, countB]) =>
      countB - countA || rankB - rankA,
  );

  let category: HandCategory;
  let tiebreakers: number[];

  if (flush && straight !== null) {
    category = "straight_flush";
    tiebreakers = [straight];
  } else if (groups[0][1] === 4) {
    category = "four_of_a_kind";
    tiebreakers = [
      groups[0][0],
      groups.find(([, count]) => count === 1)?.[0] ?? 0,
    ];
  } else if (groups[0][1] === 3 && groups[1]?.[1] === 2) {
    category = "full_house";
    tiebreakers = [groups[0][0], groups[1][0]];
  } else if (flush) {
    category = "flush";
    tiebreakers = descending;
  } else if (straight !== null) {
    category = "straight";
    tiebreakers = [straight];
  } else if (groups[0][1] === 3) {
    category = "three_of_a_kind";
    tiebreakers = [
      groups[0][0],
      ...groups
        .filter(([, count]) => count === 1)
        .map(([rank]) => rank)
        .sort((a, b) => b - a),
    ];
  } else if (groups[0][1] === 2 && groups[1]?.[1] === 2) {
    const pairs = groups
      .filter(([, count]) => count === 2)
      .map(([rank]) => rank)
      .sort((a, b) => b - a);
    const kicker =
      groups.find(([, count]) => count === 1)?.[0] ?? 0;
    category = "two_pair";
    tiebreakers = [...pairs, kicker];
  } else if (groups[0][1] === 2) {
    category = "pair";
    tiebreakers = [
      groups[0][0],
      ...groups
        .filter(([, count]) => count === 1)
        .map(([rank]) => rank)
        .sort((a, b) => b - a),
    ];
  } else {
    category = "high_card";
    tiebreakers = descending;
  }

  const categoryRank = CATEGORY_RANK[category];
  return {
    category,
    categoryRank,
    tiebreakers,
    score: scoreFrom(categoryRank, tiebreakers),
  };
}

function combinationsOfFive(cards: readonly Card[]): Card[][] {
  const combinations: Card[][] = [];
  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            combinations.push([
              cards[a],
              cards[b],
              cards[c],
              cards[d],
              cards[e],
            ]);
          }
        }
      }
    }
  }
  return combinations;
}

/**
 * Encontra corretamente a melhor combinação de cinco cartas entre cinco,
 * seis ou sete cartas, incluindo a sequência A-2-3-4-5.
 */
export function evaluateBestHand(cards: readonly Card[]): HandEvaluation {
  if (cards.length < 5 || cards.length > 7) {
    throw new RangeError("A avaliação precisa de cinco a sete cartas.");
  }
  assertValidCards(cards);

  let bestCards: Card[] | null = null;
  let best: FiveCardEvaluation | null = null;

  for (const combination of combinationsOfFive(cards)) {
    const evaluation = evaluateFive(combination);
    if (best === null || evaluation.score > best.score) {
      best = evaluation;
      bestCards = combination;
    }
  }

  if (!best || !bestCards) {
    throw new Error("Não foi possível avaliar a mão.");
  }

  const isRoyal =
    best.category === "straight_flush" && best.tiebreakers[0] === 14;

  return {
    ...best,
    name: isRoyal ? "Royal flush" : CATEGORY_NAME[best.category],
    cards: bestCards,
  };
}

function createDeck(excluded: readonly Card[] = []): Card[] {
  const excludedKeys = new Set(excluded.map(cardKey));
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const card = { rank, suit };
      if (!excludedKeys.has(cardKey(card))) deck.push(card);
    }
  }
  return deck;
}

function randomIndex(length: number, random: () => number): number {
  const value = clamp(random(), 0, 0.999999999999);
  return Math.floor(value * length);
}

function takeRandomCard(deck: Card[], random: () => number): Card {
  const index = randomIndex(deck.length, random);
  const [card] = deck.splice(index, 1);
  return card;
}

function normalizedPreflopStrength(cards: readonly Card[]): number {
  const first = RANK_VALUE[cards[0].rank];
  const second = RANK_VALUE[cards[1].rank];
  const high = Math.max(first, second);
  const low = Math.min(first, second);

  if (high === low) {
    return clamp(0.45 + (0.54 * (high - 2)) / 12, 0, 0.99);
  }

  const gap = high - low - 1;
  let strength =
    0.12 + (0.32 * (high - 2)) / 12 + (0.22 * (low - 2)) / 12;

  if (cards[0].suit === cards[1].suit) strength += 0.07;
  if (gap === 0) strength += 0.09;
  else if (gap === 1) strength += 0.055;
  else if (gap === 2) strength += 0.025;
  else if (gap >= 4) strength -= 0.03;
  if (low >= 10) strength += 0.1;
  if (high === 14) strength += 0.03;

  return clamp(strength, 0.05, 0.93);
}

function pressureTightness(
  pressure: PreflopPressure | number | undefined,
): number {
  if (typeof pressure === "number") return clamp(pressure, 0, 1) * 0.5;
  switch (pressure) {
    case "limped":
      return 0.07;
    case "raised":
      return 0.2;
    case "threeBet":
      return 0.38;
    case "allIn":
      return 0.51;
    default:
      return 0;
  }
}

function styleThreshold(style: OpponentStyle): number {
  switch (style) {
    case "tight":
      return 0.49;
    case "loose":
      return 0.14;
    case "aggressive":
      return 0.24;
    case "passive":
      return 0.29;
    default:
      return 0.31;
  }
}

function takeRangedHand(
  deck: Card[],
  style: OpponentStyle,
  pressure: PreflopPressure | number | undefined,
  random: () => number,
): [Card, Card] {
  const threshold = clamp(
    styleThreshold(style) + pressureTightness(pressure),
    0.08,
    0.86,
  );
  let selected: [number, number] | null = null;
  let bestFallback: [number, number, number] | null = null;

  for (let attempt = 0; attempt < 22; attempt += 1) {
    const firstIndex = randomIndex(deck.length, random);
    let secondIndex = randomIndex(deck.length - 1, random);
    if (secondIndex >= firstIndex) secondIndex += 1;
    const strength = normalizedPreflopStrength([
      deck[firstIndex],
      deck[secondIndex],
    ]);

    if (!bestFallback || strength > bestFallback[2]) {
      bestFallback = [firstIndex, secondIndex, strength];
    }

    const acceptance = clamp(
      0.04 + (strength - threshold + 0.18) * 2.25,
      0.03,
      1,
    );
    if (random() <= acceptance) {
      selected = [firstIndex, secondIndex];
      break;
    }
  }

  if (!selected && bestFallback) {
    selected = [bestFallback[0], bestFallback[1]];
  }
  if (!selected) {
    selected = [0, 1];
  }

  const [firstIndex, secondIndex] = selected;
  const highIndex = Math.max(firstIndex, secondIndex);
  const lowIndex = Math.min(firstIndex, secondIndex);
  const highCard = deck.splice(highIndex, 1)[0];
  const lowCard = deck.splice(lowIndex, 1)[0];
  return firstIndex < secondIndex
    ? [lowCard, highCard]
    : [highCard, lowCard];
}

/**
 * Estima a parte do pote pertencente ao herói por Monte Carlo. Empates são
 * divididos, portanto 50 significa metade do pote esperado, não apenas a
 * frequência de vitórias.
 */
export function calculateEquity(
  holeCards: readonly Card[],
  board: readonly Card[] = [],
  optionsOrOpponents: EquityOptions | number = {},
): number {
  assertNoDuplicateKnownCards(holeCards, board);

  const options: EquityOptions =
    typeof optionsOrOpponents === "number"
      ? { opponents: optionsOrOpponents }
      : optionsOrOpponents;
  const opponents = Math.round(clamp(options.opponents ?? 1, 1, 8));
  const defaultSimulations =
    opponents <= 2 ? 850 : opponents <= 5 ? 600 : 420;
  const simulations = Math.round(
    clamp(options.simulations ?? defaultSimulations, 100, 2500),
  );
  const random = options.random ?? Math.random;
  const cardsNeededOnBoard = 5 - board.length;
  const knownCards = [...holeCards, ...board];
  let accumulatedShare = 0;

  for (let simulation = 0; simulation < simulations; simulation += 1) {
    const deck = createDeck(knownCards);
    const opponentHands: Array<[Card, Card]> = [];

    for (let opponent = 0; opponent < opponents; opponent += 1) {
      const style =
        options.opponentStyles?.[opponent] ??
        options.opponentStyle ??
        "balanced";
      opponentHands.push(
        takeRangedHand(deck, style, options.preflopPressure, random),
      );
    }

    const completedBoard = [...board];
    for (let card = 0; card < cardsNeededOnBoard; card += 1) {
      completedBoard.push(takeRandomCard(deck, random));
    }

    const heroScore = evaluateBestHand([
      ...holeCards,
      ...completedBoard,
    ]).score;
    const opponentScores = opponentHands.map((hand) =>
      evaluateBestHand([...hand, ...completedBoard]).score,
    );
    const bestScore = Math.max(heroScore, ...opponentScores);

    if (heroScore === bestScore) {
      const tiedPlayers =
        1 + opponentScores.filter((score) => score === bestScore).length;
      accumulatedShare += 1 / tiedPlayers;
    }
  }

  return round((accumulatedShare / simulations) * 100, 1);
}

/**
 * Retorna a equidade mínima necessária para pagar:
 * call / (pote atual + call).
 */
export function calculatePotOdds(pot: number, callAmount: number): number {
  const safePot = Math.max(0, Number.isFinite(pot) ? pot : 0);
  const safeCall = Math.max(
    0,
    Number.isFinite(callAmount) ? callAmount : 0,
  );
  if (safeCall === 0) return 0;
  return round((safeCall / (safePot + safeCall)) * 100, 1);
}

function hasFourToStraight(cards: readonly Card[]): boolean {
  const values = new Set(cards.map((card) => RANK_VALUE[card.rank]));
  if (values.has(14)) values.add(1);

  for (let high = 5; high <= 14; high += 1) {
    let present = 0;
    for (let value = high - 4; value <= high; value += 1) {
      if (values.has(value)) present += 1;
    }
    if (present === 4) return true;
  }
  return false;
}

function boardHasStraightPotential(board: readonly Card[]): boolean {
  const values = new Set(board.map((card) => RANK_VALUE[card.rank]));
  if (values.has(14)) values.add(1);

  for (let high = 5; high <= 14; high += 1) {
    let present = 0;
    for (let value = high - 4; value <= high; value += 1) {
      if (values.has(value)) present += 1;
    }
    if (present >= 3) return true;
  }
  return false;
}

/**
 * Classifica a textura usando apenas informação visível. Quando as cartas da
 * mão são fornecidas, também sinaliza draws do herói.
 */
export function analyzeBoardTexture(
  board: readonly Card[],
  holeCards: readonly Card[] = [],
): BoardTextureAnalysis {
  assertValidCards(board, 5);
  assertValidCards(holeCards, 2);
  assertValidCards([...holeCards, ...board], 7);

  if (board.length === 0) {
    return {
      label: "Pré-flop",
      danger: "LOW",
      wetness: 0,
      paired: false,
      monotone: false,
      twoTone: false,
      connected: false,
      straightPossible: false,
      flushPossible: false,
      heroFlushDraw: false,
      heroStraightDraw: false,
      features: ["Ainda não há cartas comunitárias"],
    };
  }

  const rankCounts = new Map<number, number>();
  const suitCounts = new Map<Suit, number>();
  for (const card of board) {
    const rank = RANK_VALUE[card.rank];
    rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);
    suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
  }

  const maximumSuit = Math.max(...suitCounts.values());
  const paired = [...rankCounts.values()].some((count) => count >= 2);
  const monotone = board.length >= 3 && maximumSuit === board.length;
  const twoTone =
    board.length >= 3 && !monotone && maximumSuit === board.length - 1;
  const flushPossible = maximumSuit >= 3;
  const straightPossible = boardHasStraightPotential(board);

  const sortedRanks = [...rankCounts.keys()].sort((a, b) => a - b);
  let nearbyPairs = 0;
  for (let first = 0; first < sortedRanks.length; first += 1) {
    for (let second = first + 1; second < sortedRanks.length; second += 1) {
      if (sortedRanks[second] - sortedRanks[first] <= 2) nearbyPairs += 1;
    }
  }
  const connected = straightPossible || nearbyPairs >= 2;

  const allKnown = [...holeCards, ...board];
  const allSuitCounts = new Map<Suit, number>();
  for (const card of allKnown) {
    allSuitCounts.set(card.suit, (allSuitCounts.get(card.suit) ?? 0) + 1);
  }
  const heroFlushDraw =
    holeCards.length === 2 &&
    board.length < 5 &&
    Math.max(...allSuitCounts.values()) === 4;
  const heroStraightDraw =
    holeCards.length === 2 && board.length < 5 && hasFourToStraight(allKnown);

  const highCards = board.filter(
    (card) => RANK_VALUE[card.rank] >= 11,
  ).length;
  let wetness = 5;
  if (twoTone) wetness += 20;
  if (monotone) wetness += 34;
  else if (flushPossible) wetness += 27;
  if (connected) wetness += 29;
  else wetness += Math.min(nearbyPairs * 7, 14);
  if (straightPossible) wetness += 14;
  if (paired) wetness += 10;
  if (highCards >= 2) wetness += 8;
  wetness = Math.round(clamp(wetness, 0, 100));

  const features: string[] = [];
  if (paired) features.push("Mesa pareada");
  if (monotone) features.push("Um único naipe na mesa");
  else if (flushPossible) features.push("Flush já é possível");
  else if (twoTone) features.push("Possível draw de flush");
  if (straightPossible) features.push("Sequências são possíveis");
  else if (connected) features.push("Cartas próximas");
  if (heroFlushDraw) features.push("Você tem draw de flush");
  if (heroStraightDraw) features.push("Você tem draw de sequência");
  if (features.length === 0) features.push("Poucos draws naturais");

  const danger =
    wetness >= 65 ? "HIGH" : wetness >= 35 ? "MEDIUM" : "LOW";
  let label: string;
  if (board.length < 3) label = "Mesa incompleta";
  else if (monotone) label = "Monotone e perigoso";
  else if (wetness >= 65) label = "Muito conectado e perigoso";
  else if (paired && wetness < 45) label = "Pareado e relativamente seco";
  else if (wetness >= 35) label = "Dinâmico";
  else label = "Seco e desconectado";

  return {
    label,
    danger,
    wetness,
    paired,
    monotone,
    twoTone,
    connected,
    straightPossible,
    flushPossible,
    heroFlushDraw,
    heroStraightDraw,
    features,
  };
}

function estimateOuts(
  holeCards: readonly Card[],
  board: readonly Card[],
): number {
  if (board.length < 3 || board.length >= 5) return 0;

  const current = evaluateBestHand([...holeCards, ...board]);
  const deck = createDeck([...holeCards, ...board]);
  const holeRanks = new Set(holeCards.map((card) => card.rank));
  let outs = 0;

  for (const candidate of deck) {
    const improved = evaluateBestHand([...holeCards, ...board, candidate]);
    if (improved.categoryRank <= current.categoryRank) continue;

    const makesMajorMadeHand = improved.categoryRank >= 4;
    const pairsAHoleCard = holeRanks.has(candidate.rank);
    const upgradesMadeHand =
      current.categoryRank >= 1 && improved.categoryRank >= 3;

    if (makesMajorMadeHand || pairsAHoleCard || upgradesMadeHand) {
      outs += 1;
    }
  }

  return outs;
}

function positionThreshold(position: TablePosition | undefined): number {
  switch (position) {
    case "UTG":
    case "EARLY":
      return 0.61;
    case "MIDDLE":
      return 0.54;
    case "LATE":
    case "CO":
      return 0.44;
    case "BTN":
      return 0.39;
    case "SB":
      return 0.5;
    case "BB":
      return 0.45;
    default:
      return 0.51;
  }
}

function describePreflopHand(cards: readonly Card[]): string {
  const first = RANK_VALUE[cards[0].rank];
  const second = RANK_VALUE[cards[1].rank];
  if (first === second) {
    const plural: Partial<Record<Rank, string>> = {
      A: "ases",
      K: "reis",
      Q: "damas",
      J: "valetes",
      "10": "dezes",
    };
    return `Par de ${plural[cards[0].rank] ?? cards[0].rank}`;
  }

  const sorted = [...cards].sort(
    (a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank],
  );
  const suited = cards[0].suit === cards[1].suit ? " suited" : " offsuit";
  return `${sorted[0].rank}-${sorted[1].rank}${suited}`;
}

function effectiveEmotionalState(context: BettingContext): EmotionalState {
  if (context.isTilted || context.emotionalState === "tilted") return "tilted";
  if (context.isTired || context.emotionalState === "tired") return "tired";
  return "calm";
}

function opponentRangeLabel(context: BettingContext): string {
  const styles = context.opponentStyles?.length
    ? context.opponentStyles
    : [context.opponentStyle ?? "balanced"];
  const averageStyleThreshold =
    styles.reduce((sum, style) => sum + styleThreshold(style), 0) /
    styles.length;
  const tightness = clamp(
    averageStyleThreshold + pressureTightness(context.preflopPressure),
    0,
    1,
  );

  if (tightness >= 0.72) return "Range muito forte (premium)";
  if (tightness >= 0.56) return "Range forte e estreito";
  if (tightness >= 0.4) return "Range seletivo";
  if (tightness >= 0.25) return "Range equilibrado";
  return "Range amplo";
}

function roundedChipAmount(amount: number, bigBlind: number): number {
  const unit = Math.max(1, bigBlind / 2);
  return Math.max(0, Math.round(amount / unit) * unit);
}

function proposedRaiseAmount(
  context: BettingContext,
  callAmount: number,
  texture: BoardTextureAnalysis,
  preflop: boolean,
): number {
  const stack = Math.max(0, context.effectiveStack);
  const blind = Math.max(1, context.bigBlind);
  let rawAmount: number;

  if (preflop) {
    rawAmount =
      callAmount === 0
        ? blind * 2.5
        : callAmount + Math.max(blind * 2.5, context.pot * 0.55);
  } else {
    const sizing =
      texture.danger === "HIGH" ? 0.75 : texture.danger === "MEDIUM" ? 0.62 : 0.5;
    rawAmount = callAmount + Math.max(blind, (context.pot + callAmount) * sizing);
  }

  rawAmount = Math.max(rawAmount, context.minimumRaise ?? 0);
  return Math.min(stack, roundedChipAmount(rawAmount, blind));
}

function confidenceFromMargin(
  equity: number,
  potOdds: number,
  action: PokerAction,
  simulations: number | undefined,
): "LOW" | "MEDIUM" | "HIGH" {
  const margin = Math.abs(equity - potOdds);
  if (simulations !== undefined && simulations < 250) return "LOW";
  if (action === "CHECK" && equity >= 35 && equity <= 65) return "MEDIUM";
  if (margin >= 24) return "HIGH";
  if (margin >= 9) return "MEDIUM";
  return "LOW";
}

function emotionalSuffix(state: EmotionalState): string {
  if (state === "tilted") {
    return " Como você marcou tilt, a margem de segurança foi aumentada.";
  }
  if (state === "tired") {
    return " Como você marcou cansaço, a linha foi ajustada para reduzir decisões marginais.";
  }
  return "";
}

/**
 * Analisa a decisão atual. A recomendação é deliberadamente conservadora:
 * ela usa equidade estimada, preço do call, posição, range adversário, SPR,
 * textura e o estado emocional informado.
 */
export function analyzeSpot(context: BettingContext): PokerAnalysis {
  const board = context.board ?? [];
  assertNoDuplicateKnownCards(context.holeCards, board);

  const pot = Math.max(0, context.pot);
  const callAmount = Math.min(
    Math.max(0, context.callAmount ?? context.toCall ?? 0),
    Math.max(0, context.effectiveStack),
  );
  const stack = Math.max(0, context.effectiveStack);
  const bigBlind = Math.max(1, context.bigBlind);
  const opponents = Math.round(clamp(context.opponents ?? 1, 1, 8));
  const canRaise = context.canRaise ?? true;
  const emotionalState = effectiveEmotionalState(context);
  const texture = analyzeBoardTexture(board, context.holeCards);
  const equity = calculateEquity(context.holeCards, board, {
    opponents,
    opponentStyle: context.opponentStyle,
    opponentStyles: context.opponentStyles,
    preflopPressure: context.preflopPressure,
    simulations: context.simulations,
    random: context.random,
  });
  const potOdds = calculatePotOdds(pot, callAmount);
  const spr = pot > 0 ? round(stack / pot, 1) : 0;
  const outs = estimateOuts(context.holeCards, board);
  const preflop = board.length < 3;
  const handEvaluation = preflop
    ? null
    : evaluateBestHand([...context.holeCards, ...board]);
  const handName = handEvaluation?.name ?? describePreflopHand(context.holeCards);
  const rangeLabel = opponentRangeLabel(context);
  const safetyMargin =
    emotionalState === "tilted" ? 10 : emotionalState === "tired" ? 5 : 1.5;

  let action: PokerAction;
  let amount = 0;
  let reason: string;
  let teachingPoint: string;

  if (stack === 0) {
    action = callAmount === 0 ? "CHECK" : "FOLD";
    reason = "Não há fichas efetivas disponíveis para uma nova aposta.";
    teachingPoint = "Confirme o stack antes de registrar a próxima ação.";
  } else if (preflop) {
    const handStrength = normalizedPreflopStrength(context.holeCards);
    let threshold =
      positionThreshold(context.position) +
      pressureTightness(context.preflopPressure) * 0.55 +
      Math.max(0, opponents - 2) * 0.018;
    if (emotionalState === "tired") threshold += 0.07;
    if (emotionalState === "tilted") threshold += 0.14;
    threshold = clamp(threshold, 0.32, 0.91);

    const premium = handStrength >= Math.max(0.78, threshold + 0.15);
    const playable = handStrength >= threshold;
    const cheapEnough =
      callAmount <= bigBlind &&
      equity >= potOdds + safetyMargin &&
      handStrength >= threshold - 0.08;
    const noPreflopAggression =
      context.preflopPressure === undefined ||
      context.preflopPressure === "none" ||
      context.preflopPressure === "limped" ||
      context.preflopPressure === 0;

    if (canRaise && playable && noPreflopAggression) {
      amount = proposedRaiseAmount(context, callAmount, texture, true);
      action = amount >= stack ? "ALL_IN" : "RAISE";
      reason =
        context.preflopPressure === "limped"
          ? "A mão está dentro do range para isolar os limpers e assumir a iniciativa."
          : "A mão está dentro do range de abertura para sua posição e pode assumir a iniciativa.";
      teachingPoint =
        "Entrar aumentando costuma ser melhor que apenas completar: você ganha fold equity e define o preço.";
    } else if (callAmount === 0) {
      action = "CHECK";
      reason =
        "Você pode ver a próxima carta sem investir fichas adicionais.";
      teachingPoint =
        "Quando o check é gratuito, não transforme uma mão marginal em um pote grande.";
    } else if (premium && canRaise && emotionalState !== "tilted") {
      amount = proposedRaiseAmount(
        context,
        callAmount,
        texture,
        true,
      );
      action = amount >= stack ? "ALL_IN" : "RAISE";
      reason =
        "Sua mão está no topo do range e segue forte mesmo contra a pressão pré-flop.";
      teachingPoint =
        "Mãos premium lucram ao extrair valor antes que muitas cartas comunitárias reduzam sua vantagem.";
    } else if (playable || cheapEnough) {
      amount = callAmount;
      action = callAmount >= stack ? "ALL_IN" : "CALL";
      reason =
        "A força da mão e o preço oferecido justificam continuar, mas não há margem suficiente para aumentar.";
      teachingPoint =
        "Pagar é adequado quando sua equidade supera o preço do pote sem força bastante para um raise de valor.";
    } else {
      action = "FOLD";
      reason =
        "A mão está abaixo do range recomendado para esta posição diante da pressão atual.";
      teachingPoint =
        "Disciplina pré-flop evita começar potes caros com mãos dominadas.";
    }
  } else {
    const equityFraction = equity / 100;
    const potOddsFraction = potOdds / 100;
    const monster =
      (handEvaluation?.categoryRank ?? 0) >= 6 || equityFraction >= 0.82;
    const strongValue =
      (handEvaluation?.categoryRank ?? 0) >= 3 &&
      equityFraction >= Math.max(0.61, potOddsFraction + 0.2);
    const aggressiveEnough =
      monster ||
      (strongValue &&
        emotionalState !== "tilted" &&
        (emotionalState !== "tired" || equityFraction >= 0.72));
    const profitableCall =
      equity >= potOdds + safetyMargin ||
      (callAmount <= bigBlind * 0.5 && equity >= potOdds);

    if (callAmount === 0) {
      if (canRaise && aggressiveEnough) {
        amount = proposedRaiseAmount(context, 0, texture, false);
        action = amount >= stack ? "ALL_IN" : "RAISE";
        reason =
          texture.danger === "HIGH"
            ? "Você tem vantagem suficiente para apostar por valor e cobrar dos muitos draws da mesa."
            : "Sua mão tem vantagem suficiente para apostar por valor.";
        teachingPoint =
          "Em boards mais dinâmicos, apostas maiores negam equidade a draws e extraem valor de mãos piores.";
      } else {
        action = "CHECK";
        reason =
          "Não há aposta para pagar e sua vantagem não é clara o bastante para inflar o pote.";
        teachingPoint =
          "Check também protege seu range e mantém controlado o tamanho do pote com força média.";
      }
    } else if (!profitableCall) {
      action = "FOLD";
      reason = `Sua equidade estimada de ${equity}% não oferece margem segura sobre os ${potOdds}% exigidos pelo pote.`;
      teachingPoint =
        "Um call só se sustenta quando a chance de ganhar compensa o preço e a incerteza do range adversário.";
    } else if (canRaise && aggressiveEnough) {
      amount = proposedRaiseAmount(
        context,
        callAmount,
        texture,
        false,
      );
      action = amount >= stack ? "ALL_IN" : "RAISE";
      reason =
        "Sua equidade está bem acima do preço do call e a mão é forte o bastante para extrair mais valor.";
      teachingPoint =
        "Raises de valor funcionam quando mãos piores ainda conseguem pagar.";
    } else {
      amount = callAmount;
      action = callAmount >= stack ? "ALL_IN" : "CALL";
      reason = `A equidade estimada de ${equity}% supera os ${potOdds}% exigidos pelo pote.`;
      teachingPoint =
        outs > 0
          ? `Você tem aproximadamente ${outs} outs de melhora; evite contar o mesmo out duas vezes.`
          : "Compare sempre equidade e pot odds antes de pagar uma aposta.";
    }
  }

  reason += emotionalSuffix(emotionalState);
  const confidence = confidenceFromMargin(
    equity,
    potOdds,
    action,
    context.simulations,
  );

  return {
    action,
    amount: round(amount, 2),
    equity,
    potOdds,
    outs,
    spr,
    handName,
    texture,
    rangeLabel,
    confidence,
    reason,
    teachingPoint,
  };
}
