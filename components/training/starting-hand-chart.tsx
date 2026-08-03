"use client";

import { Grid3X3, Info, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  RANGE_ACTION_LABELS,
  RANGE_POSITION_LABELS,
  RANGE_POSITIONS,
  STARTING_HAND_RANKS,
  rangeScenario,
  startingHandAction,
  startingHandNotation,
  type RangeAction,
  type RangeMode,
  type RangePosition,
} from "@/lib/training/starting-hands";
import styles from "./starting-hand-chart.module.css";

const ACTION_EXPLANATIONS: Record<RangeAction, string> = {
  raise: "Mão forte o bastante para tomar a iniciativa neste cenário.",
  call: "Defenda pagando e jogue o pós-flop com atenção à textura da mesa.",
  mixed: "Ação situacional: alterne entre continuar e foldar conforme o adversário e os stacks.",
  fold: "Preserve suas fichas. Esta mão fica fora do range recomendado.",
};

export function StartingHandChartDialog({ onClose }: { onClose: () => void }) {
  const [position, setPosition] = useState<RangePosition>("BTN");
  const [mode, setMode] = useState<RangeMode>("beginner");
  const [selectedHand, setSelectedHand] = useState("AA");

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const selectedAction = startingHandAction(selectedHand, position, mode);

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="range-chart-title">
        <header className={styles.header}>
          <div>
            <span><Grid3X3 size={16} aria-hidden="true" /> Mapa de mãos iniciais</span>
            <h2 id="range-chart-title">Escolha melhor antes do flop.</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar mapa de mãos">
            <X size={20} />
          </button>
        </header>

        <div className={styles.content}>
          <div className={styles.controls}>
            <div className={styles.controlGroup}>
              <span>Posição</span>
              <div className={styles.positionTabs} role="group" aria-label="Posição na mesa">
                {RANGE_POSITIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={position === item ? styles.activeTab : ""}
                    aria-pressed={position === item}
                    onClick={() => setPosition(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.controlGroup}>
              <span>Nível</span>
              <div className={styles.modeTabs} role="group" aria-label="Nível de detalhe">
                <button type="button" className={mode === "beginner" ? styles.activeTab : ""} aria-pressed={mode === "beginner"} onClick={() => setMode("beginner")}>Iniciante</button>
                <button type="button" className={mode === "complete" ? styles.activeTab : ""} aria-pressed={mode === "complete"} onClick={() => setMode("complete")}>Completo</button>
              </div>
            </div>
          </div>

          <div className={styles.contextLine}>
            <strong>{RANGE_POSITION_LABELS[position]}</strong>
            <span>{rangeScenario(position)}</span>
          </div>

          <div className={styles.chartLayout}>
            <div className={styles.matrixScroller}>
              <div className={styles.matrix} role="group" aria-label={`Range de ${position}: ${rangeScenario(position)}`}>
                {STARTING_HAND_RANKS.map((_, row) => (
                  <div className={styles.matrixRow} key={row}>
                    {STARTING_HAND_RANKS.map((__, column) => {
                      const hand = startingHandNotation(row, column);
                      const action = startingHandAction(hand, position, mode);
                      return (
                        <button
                          key={hand}
                          type="button"
                          className={`${styles.handCell} ${styles[action]} ${selectedHand === hand ? styles.selectedHand : ""}`}
                          aria-label={`${hand}: ${RANGE_ACTION_LABELS[action]}`}
                          aria-pressed={selectedHand === hand}
                          onClick={() => setSelectedHand(hand)}
                        >
                          {hand}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <aside className={styles.handDetail} aria-live="polite">
              <span className={`${styles.detailBadge} ${styles[selectedAction]}`}>{RANGE_ACTION_LABELS[selectedAction]}</span>
              <strong>{selectedHand} em {position}</strong>
              <p>{ACTION_EXPLANATIONS[selectedAction]}</p>
              <small><Info size={14} /> Use como referência de estudo, não como regra rígida.</small>
            </aside>
          </div>

          <footer className={styles.legend} aria-label="Legenda das ações">
            {(["raise", "call", "mixed", "fold"] as RangeAction[]).map((action) => (
              <span key={action}><i className={styles[action]} /> {RANGE_ACTION_LABELS[action]}</span>
            ))}
            <em><Sparkles size={14} /> “s” = mesmo naipe · “o” = naipes diferentes</em>
          </footer>
        </div>
      </section>
    </div>
  );
}
