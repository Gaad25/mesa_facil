import type { Card, OpponentStyle, PokerAnalysis } from "../poker";

export type TrainingStreet =
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown";

export type TrainingActionType =
  | "fold"
  | "check"
  | "call"
  | "raise"
  | "allIn";

export type TrainingDifficulty = "beginner" | "intermediate" | "advanced";
export type TeacherMode = "guided" | "hints" | "review";
export type TrainingActionSpeed = "slow" | "normal" | "fast";
export type TrainingFormat = "cash" | "sitAndGo" | "tournament" | "turbo";
export type BotStrategyMode = "gto" | "adaptive";
export type TrainingStatus = "playing" | "handComplete" | "sessionComplete";

export interface HeroTendencyModel {
  actions: number;
  voluntaryPreflop: number;
  preflopOpportunities: number;
  aggressiveActions: number;
  calls: number;
  foldsFacingBet: number;
  facedBets: number;
}

export interface TrainingConfig {
  opponentCount: number;
  difficulty: TrainingDifficulty;
  teacherMode: TeacherMode;
  actionSpeed: TrainingActionSpeed;
  format: TrainingFormat;
  botStrategy: BotStrategyMode;
  botStyles: OpponentStyle[];
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  blindLevelHands: number;
  heroModel: HeroTendencyModel;
  seed: number;
}

export interface TrainingPlayer {
  id: string;
  name: string;
  seat: number;
  isHero: boolean;
  style: OpponentStyle;
  stack: number;
  handStartStack: number;
  holeCards: Card[];
  folded: boolean;
  allIn: boolean;
  committedStreet: number;
  committedHand: number;
  actedThisStreet: boolean;
  /** Indica se uma aposta ou aumento ainda é permitido para este jogador. */
  raiseAllowed: boolean;
}

export interface TrainingDecision {
  type: TrainingActionType;
  /** Total de fichas que o jogador terá investido nesta rodada. */
  amount?: number;
}

export interface TrainingLegalActions {
  playerId: string;
  toCall: number;
  callAmount: number;
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  canRaise: boolean;
  canAllIn: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
}

export interface TrainingActionRecord {
  id: string;
  handNumber: number;
  street: TrainingStreet;
  playerId: string;
  playerName: string;
  action: TrainingActionType;
  amount: number;
  potAfter: number;
  /** Valor enfrentado antes da ação; permite modelar tendências sem ver cartas. */
  toCallBefore?: number;
}

export interface TrainingPotResult {
  amount: number;
  eligiblePlayerIds: string[];
  winnerIds: string[];
}

/** Mão revelada no showdown, com a combinação que efetivamente valeu. */
export interface TrainingShowdownHand {
  playerId: string;
  name: string;
  /** Descrição detalhada: "Flush de espadas, ás alto". */
  description: string;
  /** As cinco cartas que formaram a mão, entre as sete disponíveis. */
  cards: Card[];
  won: boolean;
}

export interface TrainingHandResult {
  totalPot: number;
  winnerIds: string[];
  pots: TrainingPotResult[];
  heroNet: number;
  summary: string;
  /** Vazio quando a mão terminou por desistência, sem cartas reveladas. */
  showdown: TrainingShowdownHand[];
  /** Combinação vencedora, quando houve showdown. */
  winningHand: string | null;
}

export type TrainingReplayEvent = "deal" | "action" | "street" | "result";

export interface TrainingReplayFrame {
  id: string;
  event: TrainingReplayEvent;
  street: TrainingStreet;
  board: Card[];
  pot: number;
  currentBet: number;
  currentPlayerSeat: number | null;
  players: TrainingPlayer[];
  action?: TrainingActionRecord;
}

export interface TrainingGameState {
  version: 1;
  id: string;
  config: TrainingConfig;
  status: TrainingStatus;
  handNumber: number;
  blindLevel: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  dealerSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  currentPlayerSeat: number | null;
  street: TrainingStreet;
  board: Card[];
  deck: Card[];
  deckCursor: number;
  players: TrainingPlayer[];
  pot: number;
  currentBet: number;
  minimumRaise: number;
  actions: TrainingActionRecord[];
  replay: TrainingReplayFrame[];
  result: TrainingHandResult | null;
}

export type TeacherGrade = "good" | "acceptable" | "risky";

export interface TeacherFeedback {
  id: string;
  handNumber: number;
  street: TrainingStreet;
  actualAction?: TrainingActionType;
  recommendedAction: TrainingActionType;
  grade?: TeacherGrade;
  title: string;
  explanation: string;
  teachingPoint: string;
  analysis: PokerAnalysis;
}

export interface SavedTrainingSession {
  version: 1;
  game: TrainingGameState;
  feedback: TeacherFeedback[];
  savedAt: string;
}

export interface TrainingDecisionStats {
  decisions: number;
  good: number;
  acceptable: number;
  risky: number;
}

export interface TrainingRecentHand extends TrainingDecisionStats {
  id: string;
  playedAt: string;
  handNumber: number;
  heroNet: number;
}

export interface TrainingHandHistory extends TrainingRecentHand {
  dealerSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  totalPot: number;
  summary: string;
  winnerIds: string[];
  wentToShowdown: boolean;
  replay: TrainingReplayFrame[];
  feedback: TeacherFeedback[];
}

export interface TrainingProgress extends TrainingDecisionStats {
  version: 1;
  handsPlayed: number;
  totalResult: number;
  byStreet: Record<TrainingStreet, TrainingDecisionStats>;
  /** Perfil agregado usado pelos bots adaptativos, sem armazenar cartas. */
  heroModel: HeroTendencyModel;
  recentHands: TrainingRecentHand[];
  history: TrainingHandHistory[];
  /** Impede registrar novamente uma mão retomada pelo localStorage. */
  recordedHandIds: string[];
}
