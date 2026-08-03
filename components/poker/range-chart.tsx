"use client";

import { useState } from "react";
import {
  RANGE_ACTION_LABELS,
  RANGE_POSITIONS,
  STARTING_HAND_RANKS,
  rangeScenario,
  startingHandAction,
  startingHandNotation,
  type RangeAction,
  type RangeMode,
  type RangePosition,
} from "@/lib/training/starting-hands";
import styles from "./range-chart.module.css";

const CELL_STYLE: Record<RangeAction, string> = {
  raise: styles.cellRaise,
  call: styles.cellCall,
  mixed: styles.cellMixed,
  fold: styles.cellFold,
};

export function RangeChart() {
  const [position, setPosition] = useState<RangePosition>("BTN");
  const [mode, setMode] = useState<RangeMode>("beginner");
  const [selectedHand, setSelectedHand] = useState("AA");
  const selectedAction = startingHandAction(selectedHand, position, mode);

  return (
    <section className={styles.section} aria-labelledby="range-chart-title">
      <div className={styles.copy}>
        <span className="eyebrow">Chart pré-flop visual</span>
        <h2 id="range-chart-title">Veja como a posição muda seu range.</h2>
        <p>
          Uma base didática para stacks de 100 BB. Selecione uma combinação para
          entender a ação recomendada naquele ponto da mesa.
        </p>
        <div className={styles.tabs} aria-label="Posição do range">
          {RANGE_POSITIONS.map((item) => (
            <button type="button" key={item} aria-pressed={position === item} onClick={() => setPosition(item)}>
              {item}
            </button>
          ))}
        </div>
        <div className={styles.modeTabs} aria-label="Nível do range">
          <button type="button" aria-pressed={mode === "beginner"} onClick={() => setMode("beginner")}>Iniciante</button>
          <button type="button" aria-pressed={mode === "complete"} onClick={() => setMode("complete")}>Completo</button>
        </div>
        <div className={styles.selectedDetail} aria-live="polite">
          <span className={CELL_STYLE[selectedAction]}>{RANGE_ACTION_LABELS[selectedAction]}</span>
          <strong>{selectedHand} · {position}</strong>
          <small>{rangeScenario(position)}</small>
        </div>
        <div className={styles.legend} aria-label="Legenda das ações">
          {(["raise", "call", "mixed", "fold"] as RangeAction[]).map((action) => (
            <span key={action}><i className={CELL_STYLE[action]} /> {RANGE_ACTION_LABELS[action]}</span>
          ))}
        </div>
      </div>
      <div className={styles.matrix} role="group" aria-label={`Matriz didática de mãos iniciais para ${position}`}>
        {STARTING_HAND_RANKS.flatMap((_, row) =>
          STARTING_HAND_RANKS.map((__, column) => {
            const hand = startingHandNotation(row, column);
            const action = startingHandAction(hand, position, mode);
            return (
              <button
                type="button"
                aria-label={`${hand}: ${RANGE_ACTION_LABELS[action]}`}
                aria-pressed={selectedHand === hand}
                className={`${styles.cell} ${CELL_STYLE[action]}`}
                key={`${row}-${column}`}
                onClick={() => setSelectedHand(hand)}
              >
                {hand}
              </button>
            );
          }),
        )}
      </div>
    </section>
  );
}
