"use client";

import { Plus } from "lucide-react";
import { EditableNumberInput } from "@/components/editable-number-input";
import type { Card, Rank, Suit } from "@/lib/poker";

export const RANKS: Rank[] = [
  "A",
  "K",
  "Q",
  "J",
  "10",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
];

export const SUITS: Array<{ value: Suit; symbol: string; label: string }> = [
  { value: "spades", symbol: "♠", label: "Espadas" },
  { value: "hearts", symbol: "♥", label: "Copas" },
  { value: "diamonds", symbol: "♦", label: "Ouros" },
  { value: "clubs", symbol: "♣", label: "Paus" },
];

export function cardKey(card: Card) {
  return `${card.rank}-${card.suit}`;
}

function suitSymbol(suit: Suit) {
  return SUITS.find((item) => item.value === suit)?.symbol ?? "?";
}

export function isRedSuit(suit: Suit) {
  return suit === "hearts" || suit === "diamonds";
}

export function CardFace({
  card,
  size = "medium",
  onClick,
  label,
}: {
  card?: Card;
  size?: "small" | "medium" | "large";
  onClick?: () => void;
  label: string;
}) {
  const content = card ? (
    <>
      <strong>{card.rank}</strong>
      <span>{suitSymbol(card.suit)}</span>
    </>
  ) : (
    <Plus size={size === "small" ? 16 : 24} strokeWidth={2.75} />
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={`playingCard ${size} ${
          card && isRedSuit(card.suit) ? "red" : ""
        } ${card ? "filled" : "empty"}`}
        onClick={onClick}
        aria-label={label}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      className={`playingCard ${size} ${
        card && isRedSuit(card.suit) ? "red" : ""
      } ${card ? "filled" : "empty"}`}
      aria-label={label}
    >
      {content}
    </span>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  prefix = "R$",
  min = 0,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  min?: number;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="numberField">
      <span className="fieldLabel">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className="numberInput">
        <small>{prefix}</small>
        <EditableNumberInput
          inputMode="decimal"
          min={min}
          max={1_000_000}
          step={step}
          value={value}
          onValueChange={(nextValue) =>
            onChange(Math.min(1_000_000, Math.max(min, nextValue)))
          }
        />
      </span>
    </label>
  );
}
