export const STARTING_HAND_RANKS = [
  "A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2",
] as const;

export const RANGE_POSITIONS = ["UTG", "MP", "CO", "BTN", "SB", "BB"] as const;

export type RangePosition = (typeof RANGE_POSITIONS)[number];
export type RangeMode = "beginner" | "complete";
export type RangeAction = "raise" | "call" | "mixed" | "fold";

export const RANGE_POSITION_LABELS: Record<RangePosition, string> = {
  UTG: "Under the gun",
  MP: "Posição intermediária",
  CO: "Cutoff",
  BTN: "Botão",
  SB: "Small blind",
  BB: "Big blind",
};

export const RANGE_ACTION_LABELS: Record<RangeAction, string> = {
  raise: "Aumentar",
  call: "Pagar",
  mixed: "Estratégia mista",
  fold: "Fold",
};

const OPEN_RAISES: Record<Exclude<RangePosition, "BB">, readonly string[]> = {
  UTG: [
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77",
    "AKs", "AQs", "AJs", "ATs", "KQs", "KJs", "QJs", "JTs", "T9s",
    "AKo", "AQo", "KQo",
  ],
  MP: [
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55",
    "AKs", "AQs", "AJs", "ATs", "A9s", "A5s", "A4s", "A3s", "A2s",
    "KQs", "KJs", "KTs", "QJs", "QTs", "JTs", "T9s", "98s",
    "AKo", "AQo", "AJo", "KQo",
  ],
  CO: [
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22",
    "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
    "KQs", "KJs", "KTs", "K9s", "K8s", "QJs", "QTs", "Q9s", "JTs", "J9s",
    "T9s", "T8s", "98s", "97s", "87s", "76s", "65s", "54s",
    "AKo", "AQo", "AJo", "ATo", "KQo", "KJo", "QJo",
  ],
  BTN: [
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22",
    "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
    "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "K6s", "K5s", "K4s",
    "QJs", "QTs", "Q9s", "Q8s", "Q7s", "JTs", "J9s", "J8s", "J7s",
    "T9s", "T8s", "T7s", "98s", "97s", "96s", "87s", "86s", "76s", "75s", "65s", "54s",
    "AKo", "AQo", "AJo", "ATo", "A9o", "A8o", "A7o",
    "KQo", "KJo", "KTo", "K9o", "QJo", "QTo", "Q9o", "JTo", "J9o", "T9o",
  ],
  SB: [
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22",
    "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
    "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "K6s", "K5s", "QJs", "QTs", "Q9s", "Q8s",
    "JTs", "J9s", "J8s", "T9s", "T8s", "98s", "97s", "87s", "76s", "65s", "54s",
    "AKo", "AQo", "AJo", "ATo", "A9o", "KQo", "KJo", "KTo", "QJo", "QTo", "JTo", "T9o",
  ],
};

const OPEN_MIXED: Record<Exclude<RangePosition, "BB">, readonly string[]> = {
  UTG: ["66", "A9s", "A5s", "A4s", "KTs", "QTs", "98s", "AJo"],
  MP: ["44", "A8s", "A7s", "A6s", "K9s", "J9s", "T8s", "87s", "ATo", "KJo"],
  CO: ["K7s", "Q8s", "J8s", "T7s", "86s", "75s", "A9o", "KTo", "QTo", "JTo"],
  BTN: ["K3s", "K2s", "Q6s", "J6s", "T6s", "95s", "85s", "74s", "64s", "53s", "A6o", "K8o", "Q8o", "J8o", "T8o", "98o"],
  SB: ["K4s", "K3s", "K2s", "Q7s", "Q6s", "J7s", "T7s", "96s", "86s", "75s", "64s", "A8o", "A7o", "K9o", "Q9o", "J9o"],
};

const BB_THREE_BET = new Set([
  "AA", "KK", "QQ", "JJ", "TT", "AKs", "AQs", "AJs", "A5s", "A4s", "AKo", "AQo",
]);

const BB_CALL = new Set([
  "99", "88", "77", "66", "55", "44", "33", "22",
  "ATs", "A9s", "A8s", "A7s", "A6s", "A3s", "A2s",
  "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "QJs", "QTs", "Q9s", "Q8s",
  "JTs", "J9s", "J8s", "T9s", "T8s", "98s", "97s", "87s", "76s", "65s", "54s",
  "AJo", "ATo", "A9o", "KQo", "KJo", "KTo", "QJo", "QTo", "JTo", "T9o",
]);

const BB_MIXED = new Set([
  "K6s", "K5s", "K4s", "Q7s", "J7s", "T7s", "96s", "86s", "75s", "64s", "53s",
  "A8o", "A7o", "K9o", "Q9o", "J9o", "T8o", "98o",
]);

const OPEN_RAISE_SETS = Object.fromEntries(
  Object.entries(OPEN_RAISES).map(([position, hands]) => [position, new Set(hands)]),
) as Record<Exclude<RangePosition, "BB">, Set<string>>;

const OPEN_MIXED_SETS = Object.fromEntries(
  Object.entries(OPEN_MIXED).map(([position, hands]) => [position, new Set(hands)]),
) as Record<Exclude<RangePosition, "BB">, Set<string>>;

export function startingHandNotation(row: number, column: number) {
  const rowRank = STARTING_HAND_RANKS[row];
  const columnRank = STARTING_HAND_RANKS[column];
  if (row === column) return `${rowRank}${columnRank}`;
  return row < column
    ? `${rowRank}${columnRank}s`
    : `${columnRank}${rowRank}o`;
}

export function startingHandAction(
  hand: string,
  position: RangePosition,
  mode: RangeMode,
): RangeAction {
  if (position === "BB") {
    if (BB_THREE_BET.has(hand)) return "raise";
    if (BB_CALL.has(hand)) return "call";
    if (mode === "complete" && BB_MIXED.has(hand)) return "mixed";
    return "fold";
  }

  if (OPEN_RAISE_SETS[position].has(hand)) return "raise";
  if (mode === "complete" && OPEN_MIXED_SETS[position].has(hand)) return "mixed";
  return "fold";
}

export function rangeScenario(position: RangePosition) {
  return position === "BB" ? "Defesa contra um raise do botão" : "Pote não aberto · 100 BB";
}
