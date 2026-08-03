"use client";

import { useState } from "react";
import styles from "./range-chart.module.css";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const RANK_VALUE: Record<string, number> = {
  A: 14, K: 13, Q: 12, J: 11, T: 10, "9": 9, "8": 8,
  "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2,
};
const POSITIONS = ["UTG", "HJ", "CO", "BTN", "SB"] as const;
type Position = (typeof POSITIONS)[number];
type Tone = "fold" | "mix" | "open";

const THRESHOLD: Record<Position, number> = {
  UTG: 46,
  HJ: 43,
  CO: 39,
  BTN: 34,
  SB: 38,
};

function cellFor(row: number, column: number) {
  if (row === column) return `${RANKS[row]}${RANKS[column]}`;
  if (row < column) return `${RANKS[row]}${RANKS[column]}s`;
  return `${RANKS[column]}${RANKS[row]}o`;
}

export function rangeTone(row: number, column: number, position: Position): Tone {
  const first = RANK_VALUE[RANKS[row]];
  const second = RANK_VALUE[RANKS[column]];
  const high = Math.max(first, second);
  const low = Math.min(first, second);
  const gap = Math.max(0, high - low - 1);
  let score: number;
  if (row === column) score = 25 + high * 3;
  else if (row < column) score = high * 3 + low * 1.5 - gap * 3 + (high === 14 ? 4 : 0);
  else score = high * 3 + low - gap * 3 + (high === 14 ? 2 : 0);

  const threshold = THRESHOLD[position];
  if (score >= threshold + 5) return "open";
  if (score >= threshold) return "mix";
  return "fold";
}

export function RangeChart() {
  const [position, setPosition] = useState<Position>("BTN");
  return (
    <section className={styles.section} aria-labelledby="range-chart-title">
      <div className={styles.copy}>
        <span className="eyebrow">Chart pré-flop visual</span>
        <h2 id="range-chart-title">Veja como a posição muda seu range.</h2>
        <p>
          Uma base didática para potes não abertos. Células fortes entram sempre;
          as mistas dependem da mesa, stack e adversários.
        </p>
        <div className={styles.tabs} aria-label="Posição do range">
          {POSITIONS.map((item) => (
            <button
              type="button"
              key={item}
              aria-pressed={position === item}
              onClick={() => setPosition(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className={styles.legend} aria-hidden="true">
          <span><i className={styles.open} /> Abrir</span>
          <span><i className={styles.mix} /> Misturar</span>
          <span><i /> Fold</span>
        </div>
      </div>
      <div
        className={styles.matrix}
        role="img"
        aria-label={`Matriz didática de mãos iniciais para ${position}`}
      >
        {RANKS.flatMap((_, row) =>
          RANKS.map((__, column) => {
            const tone = rangeTone(row, column, position);
            return (
              <span
                aria-hidden="true"
                className={`${styles.cell} ${
                  tone === "open" ? styles.cellOpen : tone === "mix" ? styles.cellMix : ""
                }`}
                key={`${row}-${column}`}
              >
                {cellFor(row, column)}
              </span>
            );
          }),
        )}
      </div>
    </section>
  );
}
