import { evaluateBestHand, type OpponentStyle } from "../poker";
import { createShuffledDeck } from "./deck";
import { hashSeed } from "./random";
import type {
  TrainingActionRecord,
  TrainingConfig,
  TrainingDecision,
  TrainingGameState,
  TrainingHandResult,
  TrainingLegalActions,
  TrainingPlayer,
  TrainingPotResult,
  TrainingReplayEvent,
  TrainingReplayFrame,
  TrainingStreet,
} from "./types";

const BOT_NAMES = ["Lia", "Caio", "Nina", "Theo", "Maya"];
const BOT_STYLES: OpponentStyle[] = [
  "balanced",
  "tight",
  "aggressive",
  "loose",
  "passive",
];
const VALID_BOT_STYLES = new Set<OpponentStyle>(BOT_STYLES);

function clampInteger(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function normalizeHeroModel(input: TrainingConfig["heroModel"] | undefined) {
  const count = (value: number | undefined) =>
    clampInteger(value ?? 0, 0, 1_000_000);
  return {
    actions: count(input?.actions),
    voluntaryPreflop: count(input?.voluntaryPreflop),
    preflopOpportunities: count(input?.preflopOpportunities),
    aggressiveActions: count(input?.aggressiveActions),
    calls: count(input?.calls),
    foldsFacingBet: count(input?.foldsFacingBet),
    facedBets: count(input?.facedBets),
  };
}

export function normalizeTrainingConfig(
  input: Partial<TrainingConfig>,
): TrainingConfig {
  const bigBlind = clampInteger(input.bigBlind ?? 10, 2, 1_000);
  const smallBlind = clampInteger(
    input.smallBlind ?? Math.max(1, Math.floor(bigBlind / 2)),
    1,
    bigBlind,
  );
  const opponentCount = clampInteger(input.opponentCount ?? 2, 1, 5);
  const format =
    input.format === "cash" ||
    input.format === "sitAndGo" ||
    input.format === "tournament" ||
    input.format === "turbo"
      ? input.format
      : "cash";
  const requestedStyles = Array.isArray(input.botStyles)
    ? input.botStyles.filter((style): style is OpponentStyle =>
        VALID_BOT_STYLES.has(style),
      )
    : [];
  return {
    opponentCount,
    difficulty:
      input.difficulty === "beginner" ||
      input.difficulty === "intermediate" ||
      input.difficulty === "advanced"
        ? input.difficulty
        : "beginner",
    teacherMode:
      input.teacherMode === "guided" ||
      input.teacherMode === "hints" ||
      input.teacherMode === "review"
        ? input.teacherMode
        : "guided",
    actionSpeed:
      input.actionSpeed === "slow" ||
      input.actionSpeed === "normal" ||
      input.actionSpeed === "fast"
        ? input.actionSpeed
        : "normal",
    format,
    botStrategy: input.botStrategy === "gto" ? "gto" : "adaptive",
    botStyles: Array.from(
      { length: opponentCount },
      (_, index) => requestedStyles[index] ?? BOT_STYLES[index % BOT_STYLES.length],
    ),
    startingStack: clampInteger(
      input.startingStack ?? bigBlind * 100,
      bigBlind * 20,
      bigBlind * 500,
    ),
    smallBlind,
    bigBlind,
    ante: clampInteger(input.ante ?? 0, 0, bigBlind),
    blindLevelHands: clampInteger(
      input.blindLevelHands ??
        (format === "turbo" ? 3 : format === "cash" ? 0 : 6),
      0,
      100,
    ),
    heroModel: normalizeHeroModel(input.heroModel),
    seed: clampInteger(input.seed ?? Date.now(), 1, 2_147_483_647),
  };
}

function orderedPlayers(players: readonly TrainingPlayer[]) {
  return [...players].sort((first, second) => first.seat - second.seat);
}

function nextPlayer(
  players: readonly TrainingPlayer[],
  fromSeat: number,
  predicate: (player: TrainingPlayer) => boolean,
): TrainingPlayer | null {
  const ordered = orderedPlayers(players);
  if (ordered.length === 0) return null;
  const startIndex = ordered.findIndex((player) => player.seat === fromSeat);
  for (let offset = 1; offset <= ordered.length; offset += 1) {
    const index = (Math.max(0, startIndex) + offset) % ordered.length;
    if (predicate(ordered[index])) return ordered[index];
  }
  return null;
}

function playersInHand(players: readonly TrainingPlayer[]) {
  return players.filter((player) => player.handStartStack > 0);
}

function contenders(players: readonly TrainingPlayer[]) {
  return players.filter(
    (player) => player.handStartStack > 0 && !player.folded,
  );
}

function canAct(player: TrainingPlayer) {
  return (
    player.handStartStack > 0 &&
    !player.folded &&
    !player.allIn &&
    player.stack > 0
  );
}

function commitChips(player: TrainingPlayer, requested: number): number {
  const amount = Math.min(player.stack, Math.max(0, Math.round(requested)));
  player.stack -= amount;
  player.committedStreet += amount;
  player.committedHand += amount;
  if (player.stack === 0) player.allIn = true;
  return amount;
}

function commitAnte(player: TrainingPlayer, requested: number): number {
  const amount = Math.min(player.stack, Math.max(0, Math.round(requested)));
  player.stack -= amount;
  player.committedHand += amount;
  if (player.stack === 0) player.allIn = true;
  return amount;
}

export function trainingBlindStructure(
  config: TrainingConfig,
  handNumber: number,
) {
  const level =
    config.format === "cash" || config.blindLevelHands <= 0
      ? 1
      : Math.floor((Math.max(1, handNumber) - 1) / config.blindLevelHands) + 1;
  const multiplier = 2 ** Math.min(10, level - 1);
  return {
    level,
    smallBlind: config.smallBlind * multiplier,
    bigBlind: config.bigBlind * multiplier,
    ante: config.ante * multiplier,
  };
}

function replayFrame(
  state: TrainingGameState,
  event: TrainingReplayEvent,
  action?: TrainingActionRecord,
): TrainingReplayFrame {
  return {
    id: `h${state.handNumber}-r${state.replay.length + 1}`,
    event,
    street: state.street,
    board: state.board.map((card) => ({ ...card })),
    pot:
      event === "result" && state.result
        ? state.result.totalPot
        : state.pot,
    currentBet: state.currentBet,
    currentPlayerSeat: state.currentPlayerSeat,
    players: state.players.map((player) => ({
      ...player,
      holeCards: player.holeCards.map((card) => ({ ...card })),
    })),
    ...(action ? { action: { ...action } } : {}),
  };
}

function appendReplayFrame(
  state: TrainingGameState,
  event: TrainingReplayEvent,
  action?: TrainingActionRecord,
): TrainingGameState {
  return {
    ...state,
    replay: [...state.replay, replayFrame(state, event, action)],
  };
}

function dealHoleCards(
  players: TrainingPlayer[],
  dealerSeat: number,
  deck: TrainingGameState["deck"],
  initialCursor: number,
) {
  let cursor = initialCursor;
  let dealingSeat = dealerSeat;
  for (let round = 0; round < 2; round += 1) {
    for (let count = 0; count < playersInHand(players).length; count += 1) {
      const recipient = nextPlayer(
        players,
        dealingSeat,
        (player) => player.handStartStack > 0,
      );
      if (!recipient) break;
      recipient.holeCards.push(deck[cursor]);
      cursor += 1;
      dealingSeat = recipient.seat;
    }
    dealingSeat = dealerSeat;
  }
  return cursor;
}

function buildPlayers(config: TrainingConfig): TrainingPlayer[] {
  return Array.from({ length: config.opponentCount + 1 }, (_, seat) => ({
    id: seat === 0 ? "hero" : `bot-${seat}`,
    name: seat === 0 ? "Você" : BOT_NAMES[seat - 1],
    seat,
    isHero: seat === 0,
    style:
      seat === 0
        ? "balanced"
        : config.botStyles[seat - 1] ??
          BOT_STYLES[(seat - 1) % BOT_STYLES.length],
    stack: config.startingStack,
    handStartStack: config.startingStack,
    holeCards: [],
    folded: false,
    allIn: false,
    committedStreet: 0,
    committedHand: 0,
    actedThisStreet: false,
    raiseAllowed: true,
  }));
}

function prepareHand(
  previousPlayers: readonly TrainingPlayer[],
  config: TrainingConfig,
  handNumber: number,
  dealerSeat: number,
  previousActions: readonly TrainingActionRecord[],
): TrainingGameState {
  const players = previousPlayers.map((player) => ({
    ...player,
    handStartStack: player.stack,
    holeCards: [],
    folded: player.stack <= 0,
    allIn: false,
    committedStreet: 0,
    committedHand: 0,
    actedThisStreet: false,
    raiseAllowed: true,
  }));
  const deck = createShuffledDeck(hashSeed(config.seed, handNumber));
  const deckCursor = dealHoleCards(players, dealerSeat, deck, 0);
  const active = playersInHand(players);
  const blindStructure = trainingBlindStructure(config, handNumber);
  const headsUp = active.length === 2;
  const smallBlindPlayer = headsUp
    ? players.find((player) => player.seat === dealerSeat) ?? active[0]
    : nextPlayer(players, dealerSeat, (player) => player.handStartStack > 0)!;
  const bigBlindPlayer = nextPlayer(
    players,
    smallBlindPlayer.seat,
    (player) => player.handStartStack > 0,
  )!;
  let pot = 0;
  for (const player of active) {
    pot += commitAnte(player, blindStructure.ante);
  }
  pot += commitChips(smallBlindPlayer, blindStructure.smallBlind);
  pot += commitChips(bigBlindPlayer, blindStructure.bigBlind);
  const firstActor = headsUp
    ? canAct(smallBlindPlayer)
      ? smallBlindPlayer
      : nextPlayer(players, smallBlindPlayer.seat, canAct)
    : nextPlayer(players, bigBlindPlayer.seat, canAct);

  const state: TrainingGameState = {
    version: 1,
    id: `training-${config.seed}`,
    config,
    status: "playing",
    handNumber,
    blindLevel: blindStructure.level,
    smallBlind: blindStructure.smallBlind,
    bigBlind: blindStructure.bigBlind,
    ante: blindStructure.ante,
    dealerSeat,
    smallBlindSeat: smallBlindPlayer.seat,
    bigBlindSeat: bigBlindPlayer.seat,
    currentPlayerSeat: firstActor?.seat ?? null,
    street: "preflop",
    board: [],
    deck,
    deckCursor,
    players,
    pot,
    currentBet: blindStructure.bigBlind,
    minimumRaise: blindStructure.bigBlind,
    actions: [...previousActions].slice(-250),
    replay: [],
    result: null,
  };
  const dealt = appendReplayFrame(state, "deal");
  return players.filter(canAct).length <= 1
    ? runBoardAndShowdown(dealt)
    : dealt;
}

export function createTrainingGame(
  input: Partial<TrainingConfig> = {},
): TrainingGameState {
  const config = normalizeTrainingConfig(input);
  return prepareHand(buildPlayers(config), config, 1, 0, []);
}

function currentPlayer(state: TrainingGameState): TrainingPlayer | null {
  return (
    state.players.find((player) => player.seat === state.currentPlayerSeat) ??
    null
  );
}

export function getTrainingLegalActions(
  state: TrainingGameState,
): TrainingLegalActions | null {
  if (state.status !== "playing") return null;
  const player = currentPlayer(state);
  if (!player || !canAct(player)) return null;
  const toCall = Math.max(0, state.currentBet - player.committedStreet);
  const callAmount = Math.min(toCall, player.stack);
  const maxRaiseTo = player.committedStreet + player.stack;
  const minRaiseTo = state.currentBet + state.minimumRaise;
  const hasResponder = state.players.some(
    (candidate) => candidate.id !== player.id && canAct(candidate),
  );
  const canRaise =
    player.raiseAllowed && hasResponder && maxRaiseTo >= minRaiseTo;
  const allInWouldRaise = maxRaiseTo > state.currentBet;
  const canAllIn =
    player.stack > 0 &&
    (allInWouldRaise
      ? player.raiseAllowed && hasResponder
      : toCall > 0);

  return {
    playerId: player.id,
    toCall,
    callAmount,
    canFold: toCall > 0,
    canCheck: toCall === 0,
    canCall: toCall > 0 && player.stack > 0,
    canRaise,
    canAllIn,
    minRaiseTo: canRaise ? minRaiseTo : maxRaiseTo,
    maxRaiseTo,
  };
}

function validateDecision(
  decision: TrainingDecision,
  legal: TrainingLegalActions,
) {
  if (decision.type === "fold" && !legal.canFold) {
    throw new RangeError("Fold não está disponível nesta decisão.");
  }
  if (decision.type === "check" && !legal.canCheck) {
    throw new RangeError("Check não está disponível nesta decisão.");
  }
  if (decision.type === "call" && !legal.canCall) {
    throw new RangeError("Call não está disponível nesta decisão.");
  }
  if (decision.type === "raise") {
    if (!legal.canRaise) throw new RangeError("Raise não está disponível.");
    const amount = Math.round(decision.amount ?? 0);
    if (amount < legal.minRaiseTo || amount > legal.maxRaiseTo) {
      throw new RangeError(
        `O raise deve ficar entre ${legal.minRaiseTo} e ${legal.maxRaiseTo}.`,
      );
    }
  }
  if (decision.type === "allIn" && !legal.canAllIn) {
    throw new RangeError("All-in não está disponível nesta decisão.");
  }
}

function bettingRoundComplete(state: TrainingGameState) {
  const actors = state.players.filter(canAct);
  return actors.every(
    (player) =>
      player.actedThisStreet && player.committedStreet === state.currentBet,
  );
}

function nextActorAfter(
  state: TrainingGameState,
  fromSeat: number,
): TrainingPlayer | null {
  return nextPlayer(
    state.players,
    fromSeat,
    (player) =>
      canAct(player) &&
      (!player.actedThisStreet || player.committedStreet < state.currentBet),
  );
}

function drawCommunity(state: TrainingGameState, count: number) {
  const cursorAfterBurn = state.deckCursor + 1;
  return {
    board: [
      ...state.board,
      ...state.deck.slice(cursorAfterBurn, cursorAfterBurn + count),
    ],
    deckCursor: cursorAfterBurn + count,
  };
}

function nextStreet(street: TrainingStreet): TrainingStreet {
  if (street === "preflop") return "flop";
  if (street === "flop") return "turn";
  if (street === "turn") return "river";
  return "showdown";
}

function refundUncalledBet(state: TrainingGameState): TrainingGameState {
  const contributions = state.players
    .map((player) => ({ player, amount: player.committedHand }))
    .sort((first, second) => second.amount - first.amount);
  if (contributions.length < 2) return state;
  const [highest, second] = contributions;
  if (highest.amount <= second.amount) return state;
  const refund = highest.amount - second.amount;
  const players = state.players.map((player) =>
    player.id === highest.player.id
      ? {
          ...player,
          stack: player.stack + refund,
          committedHand: player.committedHand - refund,
          committedStreet: Math.max(0, player.committedStreet - refund),
          allIn: player.stack + refund === 0,
        }
      : player,
  );
  return { ...state, players, pot: state.pot - refund };
}

export function calculateSidePots(
  players: readonly TrainingPlayer[],
): Array<{ amount: number; eligiblePlayerIds: string[] }> {
  const levels = [
    ...new Set(
      players
        .map((player) => player.committedHand)
        .filter((amount) => amount > 0),
    ),
  ].sort((first, second) => first - second);
  let previousLevel = 0;
  return levels
    .map((level) => {
      const contributors = players.filter(
        (player) => player.committedHand >= level,
      );
      const amount = (level - previousLevel) * contributors.length;
      previousLevel = level;
      return {
        amount,
        eligiblePlayerIds: contributors
          .filter((player) => !player.folded)
          .map((player) => player.id),
      };
    })
    .filter((pot) => pot.amount > 0);
}

function winnerOrder(state: TrainingGameState, ids: readonly string[]) {
  const ordered: string[] = [];
  let seat = state.dealerSeat;
  for (let index = 0; index < state.players.length; index += 1) {
    const player = nextPlayer(state.players, seat, () => true);
    if (!player) break;
    if (ids.includes(player.id)) ordered.push(player.id);
    seat = player.seat;
  }
  return ordered;
}

function awardPots(
  state: TrainingGameState,
  rawPots: ReturnType<typeof calculateSidePots>,
) {
  const players = state.players.map((player) => ({ ...player }));
  const results: TrainingPotResult[] = [];

  for (const pot of rawPots) {
    const eligible = players.filter((player) =>
      pot.eligiblePlayerIds.includes(player.id),
    );
    const scores = eligible.map((player) => ({
      id: player.id,
      score: evaluateBestHand([...player.holeCards, ...state.board]).score,
    }));
    const bestScore = Math.max(...scores.map((entry) => entry.score));
    const winnerIds = scores
      .filter((entry) => entry.score === bestScore)
      .map((entry) => entry.id);
    const orderedWinners = winnerOrder(state, winnerIds);
    const share = Math.floor(pot.amount / orderedWinners.length);
    let remainder = pot.amount - share * orderedWinners.length;
    for (const id of orderedWinners) {
      const winner = players.find((player) => player.id === id)!;
      winner.stack += share + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);
    }
    results.push({ ...pot, winnerIds: orderedWinners });
  }

  return { players, results };
}

function completeByFold(state: TrainingGameState): TrainingGameState {
  const normalized = refundUncalledBet(state);
  const winner = contenders(normalized.players)[0];
  const totalPot = normalized.pot;
  const players = normalized.players.map((player) =>
    player.id === winner.id
      ? { ...player, stack: player.stack + totalPot }
      : player,
  );
  const hero = players.find((player) => player.isHero)!;
  const result: TrainingHandResult = {
    totalPot,
    winnerIds: [winner.id],
    pots: [
      {
        amount: totalPot,
        eligiblePlayerIds: [winner.id],
        winnerIds: [winner.id],
      },
    ],
    heroNet: hero.stack - hero.handStartStack,
    summary: winner.isHero
      ? "Você levou o pote depois que os adversários desistiram."
      : `${winner.name} levou o pote depois que os demais desistiram.`,
  };
  return appendReplayFrame({
    ...normalized,
    players,
    status: "handComplete",
    currentPlayerSeat: null,
    pot: 0,
    result,
  }, "result");
}

function completeShowdown(state: TrainingGameState): TrainingGameState {
  const normalized = refundUncalledBet({ ...state, street: "showdown" });
  const rawPots = calculateSidePots(normalized.players);
  const { players, results } = awardPots(normalized, rawPots);
  const winnerIds = [...new Set(results.flatMap((pot) => pot.winnerIds))];
  const hero = players.find((player) => player.isHero)!;
  const winnerNames = winnerIds.map(
    (id) => players.find((player) => player.id === id)?.name ?? "Jogador",
  );
  const result: TrainingHandResult = {
    totalPot: normalized.pot,
    winnerIds,
    pots: results,
    heroNet: hero.stack - hero.handStartStack,
    summary:
      winnerNames.length === 1
        ? `${winnerNames[0]} venceu no showdown.`
        : `Pote dividido entre ${winnerNames.join(" e ")}.`,
  };
  return appendReplayFrame({
    ...normalized,
    players,
    status: "handComplete",
    currentPlayerSeat: null,
    pot: 0,
    result,
  }, "result");
}

function runBoardAndShowdown(state: TrainingGameState): TrainingGameState {
  let next = state;
  while (next.board.length < 5) {
    const count = next.board.length === 0 ? 3 : 1;
    const community = drawCommunity(next, count);
    next = {
      ...next,
      ...community,
      street:
        community.board.length === 3
          ? "flop"
          : community.board.length === 4
            ? "turn"
            : "river",
    };
    next = appendReplayFrame(next, "street");
  }
  return completeShowdown(next);
}

function advanceStreet(state: TrainingGameState): TrainingGameState {
  if (state.street === "river") return completeShowdown(state);
  const street = nextStreet(state.street);
  const community = drawCommunity(state, street === "flop" ? 3 : 1);
  const players = state.players.map((player) => ({
    ...player,
    committedStreet: 0,
    actedThisStreet: false,
    raiseAllowed: true,
  }));
  const next: TrainingGameState = {
    ...state,
    ...community,
    players,
    street,
    currentBet: 0,
    minimumRaise: state.bigBlind,
    currentPlayerSeat: null,
  };

  if (players.filter(canAct).length <= 1) {
    return runBoardAndShowdown(appendReplayFrame(next, "street"));
  }
  const firstActor = nextPlayer(players, state.dealerSeat, canAct);
  return appendReplayFrame(
    { ...next, currentPlayerSeat: firstActor?.seat ?? null },
    "street",
  );
}

export function applyTrainingAction(
  state: TrainingGameState,
  decision: TrainingDecision,
): TrainingGameState {
  const legal = getTrainingLegalActions(state);
  if (!legal) throw new RangeError("Não há uma decisão pendente.");
  validateDecision(decision, legal);
  const players = state.players.map((player) => ({ ...player }));
  const actor = players.find((player) => player.id === legal.playerId)!;
  let pot = state.pot;
  let currentBet = state.currentBet;
  let minimumRaise = state.minimumRaise;
  let recordedAmount = 0;

  if (decision.type === "fold") {
    actor.folded = true;
    actor.actedThisStreet = true;
    actor.raiseAllowed = false;
  } else if (decision.type === "check") {
    actor.actedThisStreet = true;
    actor.raiseAllowed = false;
  } else if (decision.type === "call") {
    recordedAmount = commitChips(actor, legal.callAmount);
    pot += recordedAmount;
    actor.actedThisStreet = true;
    actor.raiseAllowed = false;
  } else {
    const target =
      decision.type === "allIn"
        ? legal.maxRaiseTo
        : Math.round(decision.amount ?? legal.minRaiseTo);
    const previousBet = currentBet;
    recordedAmount = commitChips(actor, target - actor.committedStreet);
    pot += recordedAmount;
    if (actor.committedStreet > currentBet) {
      currentBet = actor.committedStreet;
      const raiseSize = currentBet - previousBet;
      if (raiseSize >= minimumRaise) {
        minimumRaise = raiseSize;
        for (const player of players) {
          if (player.id !== actor.id && canAct(player)) {
            player.actedThisStreet = false;
            player.raiseAllowed = true;
          }
        }
      }
    }
    actor.actedThisStreet = true;
    actor.raiseAllowed = false;
  }

  const action: TrainingActionRecord = {
    id: `h${state.handNumber}-a${state.actions.length + 1}`,
    handNumber: state.handNumber,
    street: state.street,
    playerId: actor.id,
    playerName: actor.name,
    action: decision.type,
    amount: recordedAmount,
    potAfter: pot,
    toCallBefore: legal.toCall,
  };
  let next: TrainingGameState = {
    ...state,
    players,
    pot,
    currentBet,
    minimumRaise,
    actions: [...state.actions, action].slice(-250),
  };
  next = appendReplayFrame(next, "action", action);

  if (contenders(players).length === 1) return completeByFold(next);
  if (bettingRoundComplete(next)) return advanceStreet(next);

  const following = nextActorAfter(next, actor.seat);
  if (!following) return advanceStreet(next);
  next = { ...next, currentPlayerSeat: following.seat };
  return next;
}

export function restoreTrainingGameState(
  state: TrainingGameState,
): TrainingGameState {
  const blindStructure = trainingBlindStructure(state.config, state.handNumber);
  const players = state.players.map((player) => ({
    ...player,
    raiseAllowed:
      typeof player.raiseAllowed === "boolean"
        ? player.raiseAllowed
        : !player.actedThisStreet,
  }));
  const replay = Array.isArray(state.replay)
    ? state.replay.flatMap((frame) =>
        frame && Array.isArray(frame.players)
          ? [{
              ...frame,
              players: frame.players.map((player) => ({
                ...player,
                raiseAllowed:
                  typeof player.raiseAllowed === "boolean"
                    ? player.raiseAllowed
                    : !player.actedThisStreet,
              })),
            }]
          : [],
      )
    : [];
  const normalized = {
    ...state,
    players,
    replay,
    blindLevel:
      typeof state.blindLevel === "number"
        ? state.blindLevel
        : blindStructure.level,
    smallBlind:
      typeof state.smallBlind === "number"
        ? state.smallBlind
        : blindStructure.smallBlind,
    bigBlind:
      typeof state.bigBlind === "number"
        ? state.bigBlind
        : blindStructure.bigBlind,
    ante: typeof state.ante === "number" ? state.ante : blindStructure.ante,
  };
  return replay.length > 0
    ? normalized
    : appendReplayFrame(normalized, "deal");
}

export function startNextTrainingHand(
  state: TrainingGameState,
): TrainingGameState {
  if (state.status !== "handComplete") return state;
  const previousPlayers =
    state.config.format === "cash"
      ? state.players.map((player) =>
          player.stack > 0
            ? player
            : { ...player, stack: state.config.startingStack },
        )
      : state.players;
  const active = previousPlayers.filter((player) => player.stack > 0);
  const hero = previousPlayers.find((player) => player.isHero)!;
  if (hero.stack <= 0 || active.length < 2) {
    return { ...state, status: "sessionComplete", currentPlayerSeat: null };
  }
  const dealer = nextPlayer(
    previousPlayers,
    state.dealerSeat,
    (player) => player.stack > 0,
  )!;
  return prepareHand(
    previousPlayers,
    state.config,
    state.handNumber + 1,
    dealer.seat,
    state.actions,
  );
}

export function trainingPotTotal(state: TrainingGameState) {
  return state.status === "handComplete" || state.status === "sessionComplete"
    ? (state.result?.totalPot ?? 0)
    : state.pot;
}
