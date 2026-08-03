import type { TrainingPlayer } from "./types";

export type TrainingTablePosition =
  | "BTN/SB"
  | "BTN"
  | "SB"
  | "BB"
  | "UTG"
  | "MP"
  | "CO";

type PositionPlayer = Pick<TrainingPlayer, "seat" | "handStartStack">;

const OPENING_POSITIONS: Record<number, readonly TrainingTablePosition[]> = {
  1: ["CO"],
  2: ["UTG", "CO"],
  3: ["UTG", "MP", "CO"],
};

export function trainingTablePosition(
  players: readonly PositionPlayer[],
  seat: number,
  dealerSeat: number,
  smallBlindSeat: number,
  bigBlindSeat: number,
): TrainingTablePosition | null {
  const active = players.filter((player) => player.handStartStack > 0);
  if (!active.some((player) => player.seat === seat)) return null;

  if (active.length === 2) {
    return seat === dealerSeat ? "BTN/SB" : "BB";
  }
  if (seat === dealerSeat) return "BTN";
  if (seat === smallBlindSeat) return "SB";
  if (seat === bigBlindSeat) return "BB";

  const tableSize = Math.max(...players.map((player) => player.seat)) + 1;
  const openingPlayers = active
    .filter((player) => ![dealerSeat, smallBlindSeat, bigBlindSeat].includes(player.seat))
    .sort(
      (first, second) =>
        ((first.seat - bigBlindSeat + tableSize) % tableSize) -
        ((second.seat - bigBlindSeat + tableSize) % tableSize),
    );
  const index = openingPlayers.findIndex((player) => player.seat === seat);
  if (index < 0) return null;
  return OPENING_POSITIONS[openingPlayers.length]?.[index] ?? "MP";
}
