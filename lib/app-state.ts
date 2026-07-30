import type { Card } from "./poker";

export type PlayerStyle =
  | "unknown"
  | "tight"
  | "loose"
  | "aggressive"
  | "passive";

export type Mood = "focused" | "tired" | "tilted";

export type TableAction =
  | "check"
  | "call"
  | "bet"
  | "raise"
  | "fold"
  | "allIn";

export interface Player {
  id: string;
  name: string;
  seat: number;
  stack: number;
  active: boolean;
  style: PlayerStyle;
  notes: string;
}

export interface RecordedAction {
  id: string;
  playerId: string;
  action: TableAction;
  amount?: number;
}

export interface HandRecord {
  id: string;
  handNumber: number;
  playedAt: string;
  position: string;
  heroCards: Card[];
  board: Card[];
  pot: number;
  result: number;
  recommendedAction?: string;
  actualAction?: TableAction;
  equity?: number;
  lesson?: string;
}

export interface Session {
  id: string;
  name: string;
  active: boolean;
  startedAt: string;
  handNumber: number;
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  initialBankroll: number;
  stopLoss: number;
  heroId: string;
  buttonSeat: number;
  players: Player[];
  hands: HandRecord[];
}

export interface AppData {
  version: 1;
  copilotEnabled: boolean;
  mood: Mood;
  session: Session | null;
  archivedHands: HandRecord[];
  trainingAnswered: number;
  trainingCorrect: number;
  syncCode?: string;
  lastCloudSync?: string;
}

export const APP_STORAGE_KEY = "mesa-certa:v1";

export const emptyAppData: AppData = {
  version: 1,
  copilotEnabled: true,
  mood: "focused",
  session: null,
  archivedHands: [],
  trainingAnswered: 0,
  trainingCorrect: 0,
};

export const STYLE_LABELS: Record<PlayerStyle, string> = {
  unknown: "Observando",
  tight: "Joga poucas",
  loose: "Joga muitas",
  aggressive: "Agressivo",
  passive: "Passivo",
};

export const MOOD_LABELS: Record<Mood, string> = {
  focused: "Focado",
  tired: "Cansado",
  tilted: "Irritado",
};

export const ACTION_LABELS: Record<TableAction, string> = {
  check: "Check",
  call: "Call",
  bet: "Apostou",
  raise: "Raise",
  fold: "Fold",
  allIn: "All-in",
};

const VALID_MOODS = new Set<Mood>(["focused", "tired", "tilted"]);
const VALID_STYLES = new Set<PlayerStyle>([
  "unknown",
  "tight",
  "loose",
  "aggressive",
  "passive",
]);
const VALID_ACTIONS = new Set<TableAction>([
  "check",
  "call",
  "bet",
  "raise",
  "fold",
  "allIn",
]);
const VALID_RANKS = new Set([
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
]);
const VALID_SUITS = new Set(["clubs", "diamonds", "hearts", "spades"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeString(value: unknown, fallback: string, maximum: number) {
  return typeof value === "string"
    ? value.slice(0, maximum)
    : fallback.slice(0, maximum);
}

function safeNumber(
  value: unknown,
  fallback = 0,
  minimum = -1_000_000,
  maximum = 1_000_000,
) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function safeCard(value: unknown): Card | null {
  if (
    !isRecord(value) ||
    typeof value.rank !== "string" ||
    typeof value.suit !== "string" ||
    !VALID_RANKS.has(value.rank) ||
    !VALID_SUITS.has(value.suit)
  ) {
    return null;
  }
  return value as unknown as Card;
}

function safeCards(value: unknown, maximum: number): Card[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const cards: Card[] = [];
  for (const item of value.slice(0, maximum)) {
    const card = safeCard(item);
    if (!card) continue;
    const key = `${card.rank}-${card.suit}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push(card);
  }
  return cards;
}

function safeHand(value: unknown): HandRecord | null {
  if (!isRecord(value)) return null;
  const actualAction =
    typeof value.actualAction === "string" &&
    VALID_ACTIONS.has(value.actualAction as TableAction)
      ? (value.actualAction as TableAction)
      : undefined;
  return {
    id: safeString(value.id, `hand-${Date.now()}`, 100),
    handNumber: Math.round(safeNumber(value.handNumber, 1, 1, 1_000_000)),
    playedAt: safeString(value.playedAt, new Date().toISOString(), 40),
    position: safeString(value.position, "—", 20),
    heroCards: safeCards(value.heroCards, 2),
    board: safeCards(value.board, 5),
    pot: safeNumber(value.pot, 0, 0),
    result: safeNumber(value.result, 0),
    recommendedAction:
      typeof value.recommendedAction === "string"
        ? value.recommendedAction.slice(0, 20)
        : undefined,
    actualAction,
    equity:
      typeof value.equity === "number"
        ? safeNumber(value.equity, 0, 0, 100)
        : undefined,
    lesson:
      typeof value.lesson === "string"
        ? value.lesson.slice(0, 800)
        : undefined,
  };
}

function safePlayer(value: unknown, fallbackSeat: number): Player | null {
  if (!isRecord(value)) return null;
  const style =
    typeof value.style === "string" &&
    VALID_STYLES.has(value.style as PlayerStyle)
      ? (value.style as PlayerStyle)
      : "unknown";
  return {
    id: safeString(value.id, `player-${fallbackSeat}`, 100),
    name: safeString(value.name, `Jogador ${fallbackSeat + 1}`, 60),
    seat: Math.round(safeNumber(value.seat, fallbackSeat, 0, 8)),
    stack: safeNumber(value.stack, 0, 0),
    active: typeof value.active === "boolean" ? value.active : true,
    style,
    notes: safeString(value.notes, "", 500),
  };
}

function safeSession(value: unknown): Session | null {
  if (!isRecord(value) || !Array.isArray(value.players)) return null;
  const players = value.players
    .slice(0, 9)
    .map((player, index) => safePlayer(player, index))
    .filter((player): player is Player => Boolean(player));
  if (players.length < 2) return null;

  const uniqueIds = new Set(players.map((player) => player.id));
  const heroId =
    typeof value.heroId === "string" && uniqueIds.has(value.heroId)
      ? value.heroId
      : players[0].id;
  const hands = Array.isArray(value.hands)
    ? value.hands
        .slice(-2_500)
        .map(safeHand)
        .filter((hand): hand is HandRecord => Boolean(hand))
    : [];

  return {
    id: safeString(value.id, `session-${Date.now()}`, 100),
    name: safeString(value.name, "Mesa dos amigos", 80),
    active: typeof value.active === "boolean" ? value.active : true,
    startedAt: safeString(value.startedAt, new Date().toISOString(), 40),
    handNumber: Math.round(
      safeNumber(value.handNumber, hands.length + 1, 1, 1_000_000),
    ),
    smallBlind: safeNumber(value.smallBlind, 1, 0),
    bigBlind: safeNumber(value.bigBlind, 2, 1),
    buyIn: safeNumber(value.buyIn, 0, 0),
    initialBankroll: safeNumber(value.initialBankroll, 0, 0),
    stopLoss: safeNumber(value.stopLoss, 0, 0),
    heroId,
    buttonSeat: Math.round(safeNumber(value.buttonSeat, players[0].seat, 0, 8)),
    players,
    hands,
  };
}

/**
 * Valida dados vindos do localStorage ou da nuvem e remove campos inesperados
 * antes que eles cheguem ao estado da interface.
 */
export function normalizeAppData(value: unknown): AppData | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const mood =
    typeof value.mood === "string" && VALID_MOODS.has(value.mood as Mood)
      ? (value.mood as Mood)
      : "focused";
  const archivedHands = Array.isArray(value.archivedHands)
    ? value.archivedHands
        .slice(0, 2_500)
        .map(safeHand)
        .filter((hand): hand is HandRecord => Boolean(hand))
    : [];
  const session = value.session === null ? null : safeSession(value.session);

  return {
    version: 1,
    copilotEnabled:
      typeof value.copilotEnabled === "boolean"
        ? value.copilotEnabled
        : true,
    mood,
    session,
    archivedHands,
    trainingAnswered: Math.round(
      safeNumber(value.trainingAnswered, 0, 0, 1_000_000),
    ),
    trainingCorrect: Math.round(
      safeNumber(value.trainingCorrect, 0, 0, 1_000_000),
    ),
    syncCode:
      typeof value.syncCode === "string"
        ? value.syncCode.slice(0, 160)
        : undefined,
    lastCloudSync:
      typeof value.lastCloudSync === "string"
        ? value.lastCloudSync.slice(0, 40)
        : undefined,
  };
}

export function createPlayers(
  count: number,
  heroSeat: number,
  stack: number,
  names?: string[],
): Player[] {
  return Array.from({ length: count }, (_, seat) => ({
    id: seat === heroSeat ? "hero" : `player-${seat}`,
    name:
      seat === heroSeat
        ? "Você"
        : names?.[seat]?.trim() || `Jogador ${seat + 1}`,
    seat,
    stack,
    active: true,
    style: "unknown",
    notes: "",
  }));
}

export function activePlayers(session: Session): Player[] {
  return session.players
    .filter((player) => player.active)
    .sort((a, b) => a.seat - b.seat);
}

export function nextActiveSeat(session: Session, fromSeat: number): number {
  const active = activePlayers(session);
  if (!active.length) return fromSeat;
  const next = active.find((player) => player.seat > fromSeat);
  return next?.seat ?? active[0].seat;
}

export function previousActiveSeat(session: Session, fromSeat: number): number {
  const active = activePlayers(session);
  if (!active.length) return fromSeat;
  const before = [...active].reverse().find((player) => player.seat < fromSeat);
  return before?.seat ?? active[active.length - 1].seat;
}

export function seatForHeroAsBigBlind(
  players: Player[],
  heroSeat: number,
): number {
  const mockSession: Session = {
    id: "setup",
    name: "",
    active: true,
    startedAt: "",
    handNumber: 1,
    smallBlind: 1,
    bigBlind: 2,
    buyIn: 0,
    initialBankroll: 0,
    stopLoss: 0,
    heroId: "hero",
    buttonSeat: players[0]?.seat ?? 0,
    players,
    hands: [],
  };

  if (players.filter((player) => player.active).length === 2) {
    return previousActiveSeat(mockSession, heroSeat);
  }

  const smallBlindSeat = previousActiveSeat(mockSession, heroSeat);
  return previousActiveSeat(mockSession, smallBlindSeat);
}

export function getSeatRoles(session: Session): Record<number, string> {
  const active = activePlayers(session);
  if (!active.length) return {};

  let buttonIndex = active.findIndex(
    (player) => player.seat === session.buttonSeat,
  );
  if (buttonIndex < 0) {
    buttonIndex = active.findIndex(
      (player) => player.seat > session.buttonSeat,
    );
    if (buttonIndex < 0) buttonIndex = 0;
  }
  const ordered = Array.from(
    { length: active.length },
    (_, index) => active[(buttonIndex + index) % active.length],
  );

  const roles: Record<number, string> = {};
  const count = ordered.length;
  roles[ordered[0].seat] = count === 2 ? "BTN · SB" : "BTN";

  if (count === 2) {
    roles[ordered[1].seat] = "BB";
    return roles;
  }

  if (count >= 2) roles[ordered[1].seat] = "SB";
  if (count >= 3) roles[ordered[2].seat] = "BB";

  const remaining = ordered.slice(3);
  const earlyLabelsByCount: Record<number, string[]> = {
    1: ["UTG"],
    2: ["UTG", "CO"],
    3: ["UTG", "HJ", "CO"],
    4: ["UTG", "UTG+1", "HJ", "CO"],
    5: ["UTG", "UTG+1", "MP", "HJ", "CO"],
    6: ["UTG", "UTG+1", "MP", "MP+1", "HJ", "CO"],
  };
  const labels =
    earlyLabelsByCount[remaining.length] ??
    remaining.map((_, index) => `MP${index + 1}`);

  remaining.forEach((player, index) => {
    roles[player.seat] = labels[index] ?? `MP${index + 1}`;
  });

  return roles;
}

export function rotateButton(session: Session): Session {
  return {
    ...session,
    buttonSeat: nextActiveSeat(session, session.buttonSeat),
    handNumber: session.handNumber + 1,
  };
}

export function totalSessionResult(session: Session): number {
  return session.hands.reduce((total, hand) => total + hand.result, 0);
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value || 0);
}
