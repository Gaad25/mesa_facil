import type { Card, Rank, Suit } from "../poker";
import { seededRandom } from "./random";

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

export function createShuffledDeck(seed: number): Card[] {
  const deck = SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({ rank, suit })),
  );
  const random = seededRandom(seed);

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }

  return deck;
}
