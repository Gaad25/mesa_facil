"use client";

import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bot,
  Brain,
  Check,
  ChevronRight,
  CircleHelp,
  Coins,
  Download,
  Eye,
  EyeOff,
  Gauge,
  Grid3X3,
  History,
  Lightbulb,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Spade,
  StepBack,
  StepForward,
  Target,
  TimerReset,
  Trophy,
  Upload,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Card, OpponentStyle } from "@/lib/poker";
import { EditableNumberInput } from "@/components/editable-number-input";
import { chooseBotAction } from "@/lib/training/bot-strategy";
import {
  DEFAULT_TRAINING_CONFIG,
  PRACTICE_STREETS,
  TRAINING_STREET_LABELS,
  recommendedTrainingConfig,
  recommendedTrainingFocus,
  trainingErrorInsights,
  trainingTrend,
} from "@/lib/training/curriculum";
import {
  applyTrainingAction,
  createTrainingGame,
  getTrainingLegalActions,
  startNextTrainingHand,
  trainingPotTotal,
} from "@/lib/training/game-engine";
import {
  createEmptyTrainingProgress,
  recordCompletedTrainingHand,
  trainingSolidRate,
} from "@/lib/training/progress";
import {
  parseTrainingProgressBackup,
  serializeTrainingProgress,
  trainingProgressFilename,
} from "@/lib/training/progress-transfer";
import { heroModelFromProgress } from "@/lib/training/player-model";
import { createSessionSeed } from "@/lib/training/random";
import { trainingTablePosition } from "@/lib/training/table-positions";
import {
  clearTrainingSession,
  loadTrainingProgress,
  loadTrainingSession,
  saveTrainingProgress,
  saveTrainingSession,
} from "@/lib/training/storage";
import {
  createTeacherHint,
  evaluateHeroDecision,
} from "@/lib/training/teacher";
import type {
  BotStrategyMode,
  TeacherFeedback,
  TeacherGrade,
  TeacherMode,
  TrainingActionRecord,
  TrainingActionType,
  TrainingActionSpeed,
  TrainingConfig,
  TrainingDecision,
  TrainingDifficulty,
  TrainingGameState,
  TrainingFormat,
  TrainingHandHistory,
  TrainingLegalActions,
  TrainingPlayer,
  TrainingProgress,
  TrainingStreet,
} from "@/lib/training/types";
import { StartingHandChartDialog } from "./starting-hand-chart";
import styles from "./training-game.module.css";

const STREET_LABELS = TRAINING_STREET_LABELS;

const ACTION_LABELS: Record<TrainingActionType, string> = {
  fold: "Fold",
  check: "Check",
  call: "Call",
  raise: "Raise",
  allIn: "All-in",
};

const STYLE_LABELS: Record<TrainingPlayer["style"], string> = {
  tight: "Conservador",
  balanced: "Equilibrado",
  loose: "Recreativo",
  aggressive: "Agressivo",
  passive: "Passivo",
};

const BOT_PROFILE_NAMES = ["Lia", "Caio", "Nina", "Theo", "Maya"];
const AVAILABLE_BOT_STYLES: OpponentStyle[] = [
  "balanced",
  "tight",
  "aggressive",
  "loose",
  "passive",
];

const STYLE_DESCRIPTIONS: Record<OpponentStyle, string> = {
  balanced: "Mistura valor e blefes",
  tight: "Seleciona poucas mãos",
  aggressive: "Aposta e aumenta mais",
  loose: "Participa de muitos potes",
  passive: "Prefere check e call",
};

const GRADE_LABELS: Record<TeacherGrade, string> = {
  good: "Boa",
  acceptable: "Defensável",
  risky: "Arriscada",
};

const FORMAT_LABELS: Record<TrainingFormat, string> = {
  cash: "Cash game",
  sitAndGo: "Sit & Go",
  tournament: "Torneio regular",
  turbo: "Torneio turbo",
};

const FORMAT_PRESETS: Record<
  TrainingFormat,
  Pick<
    TrainingConfig,
    "startingStack" | "smallBlind" | "bigBlind" | "ante" | "blindLevelHands"
  >
> = {
  cash: {
    startingStack: 1_000,
    smallBlind: 5,
    bigBlind: 10,
    ante: 0,
    blindLevelHands: 0,
  },
  sitAndGo: {
    startingStack: 1_500,
    smallBlind: 10,
    bigBlind: 20,
    ante: 0,
    blindLevelHands: 6,
  },
  tournament: {
    startingStack: 3_000,
    smallBlind: 10,
    bigBlind: 20,
    ante: 2,
    blindLevelHands: 8,
  },
  turbo: {
    startingStack: 1_000,
    smallBlind: 10,
    bigBlind: 20,
    ante: 2,
    blindLevelHands: 3,
  },
};

const SUIT_SYMBOLS: Record<Card["suit"], string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

const SUIT_LABELS: Record<Card["suit"], string> = {
  clubs: "paus",
  diamonds: "ouros",
  hearts: "copas",
  spades: "espadas",
};

function formatChips(amount: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(amount);
}

function TrainingCard({
  card,
  hidden = false,
  animation,
  animationDelay = 0,
}: {
  card?: Card;
  hidden?: boolean;
  animation?: "deal" | "reveal";
  animationDelay?: number;
}) {
  const motionClass =
    animation === "deal"
      ? styles.dealtCard
      : animation === "reveal"
        ? styles.revealedCard
        : "";
  const motionStyle = animation
    ? ({ "--card-delay": `${animationDelay}ms` } as CSSProperties)
    : undefined;

  if (hidden) {
    return (
      <span
        className={`${styles.card} ${styles.cardBack} ${motionClass}`}
        style={motionStyle}
        role="img"
        aria-label="Carta fechada"
      >
        <Spade size={16} />
      </span>
    );
  }
  if (!card) {
    return <span className={`${styles.card} ${styles.cardEmpty}`} aria-hidden="true" />;
  }
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <span
      className={`${styles.card} ${red ? styles.redCard : ""} ${motionClass}`}
      style={motionStyle}
      role="img"
      aria-label={`${card.rank} de ${SUIT_LABELS[card.suit]}`}
    >
      <strong className={styles.cardRank}>{card.rank}</strong>
      <span className={styles.cardSuit} aria-hidden="true">
        {SUIT_SYMBOLS[card.suit]}
      </span>
    </span>
  );
}

function ConfigChoice<T extends string>({
  value,
  selected,
  label,
  description,
  onSelect,
}: {
  value: T;
  selected: boolean;
  label: string;
  description: string;
  onSelect: (value: T) => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.configChoice} ${selected ? styles.selectedChoice : ""}`}
      onClick={() => onSelect(value)}
      aria-pressed={selected}
    >
      <span className={styles.choiceMark}>{selected && <Check size={16} />}</span>
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
    </button>
  );
}

function TrainingSetup({
  onStart,
  onOpenHistory,
  onOpenProgress,
  onOpenRanges,
  onImportProgress,
  progress,
}: {
  onStart: (config: Omit<TrainingConfig, "seed">) => void;
  onOpenHistory: () => void;
  onOpenProgress: () => void;
  onOpenRanges: () => void;
  onImportProgress: (progress: TrainingProgress) => void;
  progress: TrainingProgress;
}) {
  const [config, setConfig] = useState(DEFAULT_TRAINING_CONFIG);
  const [customProfiles, setCustomProfiles] = useState(false);
  const [transferMessage, setTransferMessage] = useState("");
  const importInput = useRef<HTMLInputElement>(null);
  const focus = recommendedTrainingFocus(progress);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const updateBotStyle = (index: number, style: OpponentStyle) => {
    const botStyles = [...config.botStyles];
    botStyles[index] = style;
    setConfig({ ...config, botStyles });
  };

  const applyFormat = (format: TrainingFormat) => {
    setConfig({ ...config, format, ...FORMAT_PRESETS[format] });
  };

  const exportProgress = () => {
    const blob = new Blob([serializeTrainingProgress(progress)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = trainingProgressFilename();
    link.click();
    URL.revokeObjectURL(url);
    setTransferMessage("Arquivo de progresso exportado.");
  };

  const importProgress = async (file: File | undefined) => {
    if (!file) return;
    const imported = parseTrainingProgressBackup(await file.text());
    if (!imported) {
      setTransferMessage("Este arquivo não é um progresso válido do Mesa Certa.");
      return;
    }
    onImportProgress(imported);
    setTransferMessage("Progresso importado neste aparelho.");
    if (importInput.current) importInput.current.value = "";
  };

  return (
    <main className={styles.setupShell}>
      <header className={styles.routeHeader}>
        <Link href="/" className={styles.backLink}>
          <ArrowLeft size={16} /> Voltar ao Mesa Certa
        </Link>
        <span className={styles.offlinePill}>
          <WifiOff size={16} /> 100% local
        </span>
      </header>

      <div className={styles.setupLayout}>
        <section className={styles.setupIntro}>
          <span className={styles.eyebrow}>
            <Sparkles size={16} /> Mesa de treino
          </span>
          <h1>Aprenda jogando uma mão de cada vez.</h1>
          <p>
            Enfrente adversários simulados e receba explicações baseadas somente
            nas informações que você teria em uma mesa real.
          </p>
          <div className={styles.trustList}>
            <span><ShieldCheck size={16} /> Os bots não enxergam suas cartas</span>
            <span><Brain size={16} /> Professor disponível durante toda a mão</span>
            <span><Bot size={16} /> Bots usam estratégias mistas e aprendem seu padrão</span>
            <span><WifiOff size={16} /> Nenhuma conexão é necessária</span>
          </div>
          <div className={styles.progressPreview}>
              <div>
                <span className={styles.progressIcon}><Trophy size={18} /></span>
                <span>
                  <small>Seu progresso</small>
                  <strong>
                    {progress.decisions
                      ? `${trainingSolidRate(progress)}% de decisões sólidas`
                      : "Pronto para registrar sua evolução"}
                  </strong>
                </span>
              </div>
              <div className={styles.progressNumbers}>
                <span><strong>{progress.handsPlayed}</strong><small>mãos</small></span>
                <span><strong>{progress.decisions}</strong><small>decisões</small></span>
                <span><strong>{progress.good}</strong><small>boas</small></span>
              </div>
              <div className={styles.focusRecommendation}>
                <Target size={16} /> Próximo foco recomendado: <strong>{focus.streetLabel}</strong>
              </div>
              <div className={styles.progressPreviewActions}>
                <button
                  type="button"
                  className={styles.historyButton}
                  onClick={onOpenRanges}
                >
                  <Grid3X3 size={16} /> Ver ranges
                </button>
                <button
                  type="button"
                  className={styles.historyButton}
                  onClick={onOpenProgress}
                >
                  <BarChart3 size={16} /> Ver dashboard
                </button>
                {progress.history.length > 0 && (
                <button
                  type="button"
                  className={styles.historyButton}
                  onClick={onOpenHistory}
                >
                  <History size={16} /> Ver histórico e replays
                </button>
                )}
              </div>
              <div className={styles.progressTransferActions}>
                <button type="button" onClick={exportProgress}>
                  <Download size={16} /> Exportar progresso
                </button>
                <button type="button" onClick={() => importInput.current?.click()}>
                  <Upload size={16} /> Importar arquivo
                </button>
                <input
                  ref={importInput}
                  type="file"
                  accept="application/json,.json"
                  className={styles.hiddenFileInput}
                  onChange={(event) => void importProgress(event.target.files?.[0])}
                />
              </div>
              {transferMessage && (
                <small className={styles.transferMessage} role="status">
                  {transferMessage}
                </small>
              )}
            </div>
        </section>

        <section className={styles.setupCard}>
          <div className={styles.setupHeading}>
            <span>Configuração</span>
            <h2>Prepare sua mesa</h2>
          </div>

          <div className={styles.recommendedExercise}>
            <span className={styles.recommendedExerciseIcon}><Target size={18} /></span>
            <span>
              <small>Exercício escolhido pelo seu histórico</small>
              <strong>{focus.title}</strong>
              <p>{focus.description}</p>
            </span>
            <button
              type="button"
              onClick={() => onStart(recommendedTrainingConfig(progress))}
            >
              Treinar {focus.streetLabel} <ChevronRight size={16} />
            </button>
          </div>

          <div className={styles.configSection}>
            <div className={styles.configLabel}>
              <TimerReset size={16} />
              <span>
                <strong>Formato da sessão</strong>
                <small>Escolha entre cash game e estruturas de torneio</small>
              </span>
            </div>
            <div className={styles.formatGrid}>
              <ConfigChoice
                value="cash"
                selected={config.format === "cash"}
                label="Cash game"
                description="Blinds fixos e recompras automáticas"
                onSelect={applyFormat}
              />
              <ConfigChoice
                value="sitAndGo"
                selected={config.format === "sitAndGo"}
                label="Sit & Go"
                description="Eliminação e níveis a cada 6 mãos"
                onSelect={applyFormat}
              />
              <ConfigChoice
                value="tournament"
                selected={config.format === "tournament"}
                label="Torneio regular"
                description="Stack profundo, ante e níveis longos"
                onSelect={applyFormat}
              />
              <ConfigChoice
                value="turbo"
                selected={config.format === "turbo"}
                label="Turbo"
                description="Stacks curtos e blinds acelerados"
                onSelect={applyFormat}
              />
            </div>
            <div className={styles.tableEconomyGrid}>
              <label>
                <span>Stack inicial</span>
                <EditableNumberInput
                  min={100}
                  max={500_000}
                  step={50}
                  value={config.startingStack}
                  onValueChange={(startingStack) =>
                    setConfig((current) => ({ ...current, startingStack }))
                  }
                />
              </label>
              <label>
                <span>Small blind</span>
                <EditableNumberInput
                  min={1}
                  max={1_000}
                  value={config.smallBlind}
                  onValueChange={(smallBlind) => {
                    setConfig((current) => ({
                      ...current,
                      smallBlind,
                      bigBlind: Math.max(current.bigBlind, smallBlind),
                    }));
                  }}
                />
              </label>
              <label>
                <span>Big blind</span>
                <EditableNumberInput
                  min={2}
                  max={1_000}
                  value={config.bigBlind}
                  onValueChange={(bigBlind) => {
                    setConfig((current) => ({
                      ...current,
                      bigBlind,
                      smallBlind: Math.min(current.smallBlind, bigBlind),
                      ante: Math.min(current.ante, bigBlind),
                    }));
                  }}
                />
              </label>
              <label>
                <span>Ante por jogador</span>
                <EditableNumberInput
                  min={0}
                  max={config.bigBlind}
                  value={config.ante}
                  onValueChange={(ante) =>
                    setConfig((current) => ({ ...current, ante }))
                  }
                />
              </label>
              {config.format !== "cash" && (
                <label className={styles.blindLevelField}>
                  <span>Mãos por nível</span>
                  <EditableNumberInput
                    min={1}
                    max={100}
                    value={config.blindLevelHands}
                    onValueChange={(blindLevelHands) =>
                      setConfig((current) => ({ ...current, blindLevelHands }))
                    }
                  />
                </label>
              )}
            </div>
          </div>

          <div className={styles.configSection}>
            <div className={styles.configLabel}>
              <Users size={16} />
              <span>
                <strong>Adversários</strong>
                <small>Você pode jogar contra 1 a 5 bots</small>
              </span>
            </div>
            <div className={styles.countPicker}>
              {[1, 2, 3, 4, 5].map((count) => (
                <button
                  type="button"
                  key={count}
                  className={config.opponentCount === count ? styles.selectedCount : ""}
                  onClick={() => setConfig({ ...config, opponentCount: count })}
                  aria-label={`${count} adversário${count > 1 ? "s" : ""}`}
                >
                  {count}
                </button>
              ))}
            </div>
            <div className={styles.profileMode}>
              <button
                type="button"
                className={!customProfiles ? styles.activeProfileMode : ""}
                onClick={() => setCustomProfiles(false)}
                aria-pressed={!customProfiles}
              >
                Mistura recomendada
              </button>
              <button
                type="button"
                className={customProfiles ? styles.activeProfileMode : ""}
                onClick={() => setCustomProfiles(true)}
                aria-pressed={customProfiles}
              >
                Personalizar perfis
              </button>
            </div>
            {customProfiles ? (
              <div className={styles.botProfiles}>
                {Array.from({ length: config.opponentCount }, (_, index) => (
                  <label key={BOT_PROFILE_NAMES[index]}>
                    <span>
                      <strong>{BOT_PROFILE_NAMES[index]}</strong>
                      <small>{STYLE_DESCRIPTIONS[config.botStyles[index]]}</small>
                    </span>
                    <select
                      aria-label={`Estilo de ${BOT_PROFILE_NAMES[index]}`}
                      value={config.botStyles[index]}
                      onChange={(event) =>
                        updateBotStyle(index, event.target.value as OpponentStyle)
                      }
                    >
                      {AVAILABLE_BOT_STYLES.map((style) => (
                        <option value={style} key={style}>
                          {STYLE_LABELS[style]}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ) : (
              <div className={styles.automaticProfiles}>
                {config.botStyles.slice(0, config.opponentCount).map((style, index) => (
                  <span key={`${style}-${index}`}>
                    {BOT_PROFILE_NAMES[index]} · {STYLE_LABELS[style]}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className={styles.configSection}>
            <div className={styles.configLabel}>
              <Bot size={16} />
              <span>
                <strong>Estratégia dos bots</strong>
                <small>Estratégias mistas, tamanhos por pote e leitura do seu padrão</small>
              </span>
            </div>
            <div className={styles.strategyModeGrid}>
              <ConfigChoice
                value="adaptive"
                selected={config.botStrategy === "adaptive"}
                label="Adaptativa"
                description="Explora tendências sem enxergar cartas escondidas"
                onSelect={(botStrategy: BotStrategyMode) =>
                  setConfig({ ...config, botStrategy })
                }
              />
              <ConfigChoice
                value="gto"
                selected={config.botStrategy === "gto"}
                label="GTO aproximado"
                description="Mantém frequências balanceadas e imprevisíveis"
                onSelect={(botStrategy: BotStrategyMode) =>
                  setConfig({ ...config, botStrategy })
                }
              />
            </div>
            <p className={styles.strategyDisclaimer}>
              Inspirado em abstração de ações e estratégias mistas de CFR. Não substitui um solver completo.
            </p>
          </div>

          <div className={styles.configSection}>
            <div className={styles.configLabel}>
              <Gauge size={16} />
              <span>
                <strong>Dificuldade</strong>
                <small>Altera a precisão e a imprevisibilidade dos bots</small>
              </span>
            </div>
            <div className={styles.choiceGrid}>
              <ConfigChoice
                value="beginner"
                selected={config.difficulty === "beginner"}
                label="Iniciante"
                description="Mais tempo para aprender"
                onSelect={(difficulty: TrainingDifficulty) =>
                  setConfig({ ...config, difficulty })
                }
              />
              <ConfigChoice
                value="intermediate"
                selected={config.difficulty === "intermediate"}
                label="Intermediário"
                description="Decisões mais consistentes"
                onSelect={(difficulty: TrainingDifficulty) =>
                  setConfig({ ...config, difficulty })
                }
              />
              <ConfigChoice
                value="advanced"
                selected={config.difficulty === "advanced"}
                label="Avançado"
                description="Menos erros estratégicos"
                onSelect={(difficulty: TrainingDifficulty) =>
                  setConfig({ ...config, difficulty })
                }
              />
            </div>
          </div>

          <div className={styles.configSection}>
            <div className={styles.configLabel}>
              <Sparkles size={16} />
              <span>
                <strong>Ritmo das ações</strong>
                <small>Controle quanto tempo os adversários levam para agir</small>
              </span>
            </div>
            <div className={styles.speedPicker}>
              {(
                [
                  ["slow", "Calmo", "Mais tempo para observar"],
                  ["normal", "Normal", "Ritmo natural"],
                  ["fast", "Rápido", "Treino sem pausas"],
                ] as const
              ).map(([speed, label, description]) => (
                <button
                  type="button"
                  key={speed}
                  className={config.actionSpeed === speed ? styles.selectedSpeed : ""}
                  onClick={() =>
                    setConfig({
                      ...config,
                      actionSpeed: speed as TrainingActionSpeed,
                    })
                  }
                  aria-pressed={config.actionSpeed === speed}
                >
                  <strong>{label}</strong>
                  <small>{description}</small>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.configSection}>
            <div className={styles.configLabel}>
              <Lightbulb size={16} />
              <span>
                <strong>Professor</strong>
                <small>Escolha quando deseja receber orientação</small>
              </span>
            </div>
            <div className={styles.choiceGrid}>
              <ConfigChoice
                value="guided"
                selected={config.teacherMode === "guided"}
                label="Guiado"
                description="Explica antes de cada decisão"
                onSelect={(teacherMode: TeacherMode) =>
                  setConfig({ ...config, teacherMode })
                }
              />
              <ConfigChoice
                value="hints"
                selected={config.teacherMode === "hints"}
                label="Sob demanda"
                description="Ajuda quando você solicitar"
                onSelect={(teacherMode: TeacherMode) =>
                  setConfig({ ...config, teacherMode })
                }
              />
              <ConfigChoice
                value="review"
                selected={config.teacherMode === "review"}
                label="Avaliação"
                description="Comenta depois da sua ação"
                onSelect={(teacherMode: TeacherMode) =>
                  setConfig({ ...config, teacherMode })
                }
              />
            </div>
          </div>

          <button type="button" className={styles.startButton} onClick={() => onStart(config)}>
            Sentar à mesa <ChevronRight size={18} />
          </button>
          <p className={styles.stackNote}>
            {FORMAT_LABELS[config.format]} · stacks de {formatChips(config.startingStack)} · blinds {config.smallBlind}/{config.bigBlind}
            {config.ante > 0 ? ` · ante ${config.ante}` : ""} · sem dinheiro real
          </p>
        </section>
      </div>
    </main>
  );
}

function seatPosition(player: TrainingPlayer, total: number) {
  const relativeSeat = (player.seat + total) % total;
  const angle = 90 + (relativeSeat * 360) / total;
  const radians = (angle * Math.PI) / 180;
  const verticalRadius = player.isHero ? 35 : 38;
  const mobileVerticalRadius = player.isHero ? 31 : 34;
  return {
    "--seat-x": `${50 + Math.cos(radians) * 38}%`,
    "--seat-y": `${50 + Math.sin(radians) * verticalRadius}%`,
    "--mobile-seat-x": `${50 + Math.cos(radians) * 36}%`,
    "--mobile-seat-y": `${50 + Math.sin(radians) * mobileVerticalRadius}%`,
  } as CSSProperties;
}

function PlayerSeat({
  player,
  game,
}: {
  player: TrainingPlayer;
  game: TrainingGameState;
}) {
  const current = game.currentPlayerSeat === player.seat;
  const handFinished = game.status !== "playing";
  const reveal = player.isHero || handFinished;
  const revealingOpponent = handFinished && !player.isHero;
  const winner = handFinished && Boolean(game.result?.winnerIds.includes(player.id));
  const position = trainingTablePosition(
    game.players,
    player.seat,
    game.dealerSeat,
    game.smallBlindSeat,
    game.bigBlindSeat,
  );
  const role =
    player.seat === game.dealerSeat
      ? "D"
      : player.seat === game.smallBlindSeat
        ? "SB"
        : player.seat === game.bigBlindSeat
          ? "BB"
          : null;
  return (
    <div
      className={`${styles.playerSeat} ${player.isHero ? styles.heroSeat : ""} ${
        current ? styles.currentSeat : ""
      } ${player.folded ? styles.foldedSeat : ""} ${
        revealingOpponent ? styles.revealedSeat : ""
      } ${handFinished ? styles.finishedSeat : ""} ${winner ? styles.winnerSeat : ""}`}
      style={seatPosition(player, game.players.length)}
      data-training-seat={player.seat}
      aria-label={`${player.isHero ? "Você" : player.name}, ${formatChips(player.stack)} fichas${
        position ? `, posição ${position}` : ""
      }${player.folded ? ", desistiu" : player.allIn ? ", all-in" : ""}`}
    >
      <div className={styles.seatCards}>
        {player.holeCards.map((card, index) => (
          <TrainingCard
            key={`${game.handNumber}-${player.id}-${index}-${reveal ? "front" : "back"}`}
            card={reveal ? card : undefined}
            hidden={!reveal}
            animation={revealingOpponent ? "reveal" : "deal"}
            animationDelay={
              revealingOpponent
                ? 140 + player.seat * 130 + index * 90
                : player.seat * 35 + index * 90
            }
          />
        ))}
      </div>
      <div className={styles.seatBody}>
        <span className={styles.avatar}>{player.isHero ? "EU" : player.name[0]}</span>
        <span className={styles.seatMeta}>
          <strong>
            <span className={styles.playerName}>{player.name}</span>
            {position && <span className={styles.positionLabel}>{position}</span>}
          </strong>
          <small>
            {formatChips(player.stack)}<span className={styles.chipWord}> fichas</span>
          </small>
        </span>
        {role && <em>{role}</em>}
      </div>
      {!player.isHero && <span className={styles.styleTag}>{STYLE_LABELS[player.style]}</span>}
      {player.folded && <span className={styles.stateTag}>Fold</span>}
      {player.allIn && !player.folded && !winner && <span className={styles.stateTag}>All-in</span>}
      {winner && <span className={styles.winnerTag}>Vencedor</span>}
    </div>
  );
}

function ActionControls({
  legal,
  onAction,
}: {
  legal: TrainingLegalActions;
  onAction: (decision: TrainingDecision) => void;
}) {
  const [raiseTo, setRaiseTo] = useState(legal.minRaiseTo);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setRaiseTo(legal.minRaiseTo);
  }, [legal.playerId, legal.minRaiseTo, legal.maxRaiseTo]);

  useEffect(() => {
    if (!window.matchMedia("(max-width: 720px)").matches) return;
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [legal.playerId, legal.toCall, legal.minRaiseTo]);

  return (
    <section ref={panelRef} className={styles.actionPanel} aria-label="Suas ações">
      <div className={styles.actionPrompt}>
        <span><Target size={16} /> Sua decisão</span>
        <strong>
          {legal.toCall > 0
            ? `${formatChips(legal.callAmount)} fichas para pagar`
            : "Você pode passar sem pagar"}
        </strong>
      </div>
      {legal.canRaise && (
        <div className={styles.raiseControl}>
          <div className={styles.raiseControlHeader}>
            <label htmlFor="training-raise">Tamanho do aumento</label>
            <output htmlFor="training-raise">{formatChips(raiseTo)} fichas</output>
          </div>
          <input
            id="training-raise"
            type="range"
            min={legal.minRaiseTo}
            max={legal.maxRaiseTo}
            step={1}
            value={raiseTo}
            onChange={(event) => setRaiseTo(Number(event.target.value))}
          />
          <div className={styles.raiseBounds} aria-hidden="true">
            <small>Mín. {formatChips(legal.minRaiseTo)}</small>
            <small>Máx. {formatChips(legal.maxRaiseTo)}</small>
          </div>
        </div>
      )}
      <div className={styles.actionButtons}>
        {legal.canFold && (
          <button type="button" className={styles.foldButton} onClick={() => onAction({ type: "fold" })}>
            Fold
          </button>
        )}
        {legal.canCheck && (
          <button type="button" className={styles.neutralButton} onClick={() => onAction({ type: "check" })}>
            Check
          </button>
        )}
        {legal.canCall && (
          <button type="button" className={styles.neutralButton} onClick={() => onAction({ type: "call" })}>
            Call {formatChips(legal.callAmount)}
          </button>
        )}
        {legal.canRaise && (
          <button type="button" className={styles.raiseButton} onClick={() => onAction({ type: "raise", amount: raiseTo })}>
            Raise para {formatChips(raiseTo)}
          </button>
        )}
        {legal.canAllIn && (
          <button type="button" className={styles.allInButton} onClick={() => onAction({ type: "allIn" })}>
            All-in
          </button>
        )}
      </div>
    </section>
  );
}

function RecentActions({ actions }: { actions: TrainingActionRecord[] }) {
  return (
    <div className={styles.actionLog} aria-label="Ações recentes">
      <span className={styles.actionLogTitle}>
        <History size={14} aria-hidden="true" /> Últimas ações
      </span>
      <div className={styles.actionLogItems}>
        {actions.map((action) => (
          <span key={action.id} className={styles.actionLogItem}>
            <strong>{action.playerName}</strong> {ACTION_LABELS[action.action]}
            {action.amount > 0 ? ` ${formatChips(action.amount)}` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function explainLatestAction(action: TrainingActionRecord | undefined) {
  if (!action) {
    return "Os blinds já colocaram as primeiras fichas no pote. A ação começa pelo primeiro jogador ainda ativo.";
  }

  const amount = formatChips(action.amount);
  switch (action.action) {
    case "fold":
      return `${action.playerName} desistiu da mão. As fichas que já estavam no pote continuam lá, mas esse jogador não pode mais ganhá-las.`;
    case "check":
      return `${action.playerName} deu check: continuou na mão sem colocar fichas porque não havia uma aposta para pagar.`;
    case "call":
      return `${action.playerName} pagou ${amount} fichas para igualar a aposta e continuar na mão.`;
    case "raise":
      return `${action.playerName} colocou ${amount} fichas em um raise. A aposta ficou maior para os jogadores que agem depois.`;
    case "allIn":
      return `${action.playerName} foi all-in e colocou suas ${amount} fichas restantes em jogo.`;
  }
}

function explainStreet(street: TrainingStreet) {
  switch (street) {
    case "preflop":
      return "No pré-flop, avalie suas duas cartas, sua posição e a pressão das apostas; ainda não há cartas comunitárias.";
    case "flop":
      return "No flop, compare suas cartas com as três cartas da mesa e observe pares e projetos de sequência ou flush.";
    case "turn":
      return "No turn, a quarta carta pode melhorar mãos e projetos. Reavalie antes de repetir o plano do flop.";
    case "river":
      return "No river, nenhuma carta nova virá. Decida usando a força final da mão e a história das apostas.";
    case "showdown":
      return "No showdown, as mãos restantes são comparadas para decidir quem recebe o pote.";
  }
}

function explainDecision(game: TrainingGameState, legal: TrainingLegalActions) {
  if (legal.toCall <= 0) {
    return `Não há aposta para pagar. Check mantém você na mão sem custo; Raise coloca pressão e aumenta o pote de ${formatChips(trainingPotTotal(game))} fichas.`;
  }

  const pot = trainingPotTotal(game);
  const finalPot = pot + legal.callAmount;
  const breakEven = finalPot > 0
    ? Math.round((legal.callAmount / finalPot) * 100)
    : 0;
  return `O Call custa ${formatChips(legal.callAmount)} fichas e faria o pote chegar a ${formatChips(finalPot)}. Em termos simples, ele precisa ganhar cerca de ${breakEven}% das vezes para se pagar no longo prazo.`;
}

function actionMeaning(action: TrainingActionType, legal: TrainingLegalActions) {
  switch (action) {
    case "fold":
      return "sair da mão e não investir mais";
    case "check":
      return "passar a vez sem pagar";
    case "call":
      return `pagar ${formatChips(legal.callAmount)} e continuar`;
    case "raise":
      return `aumentar para pelo menos ${formatChips(legal.minRaiseTo)}`;
    case "allIn":
      return "colocar todas as fichas disponíveis";
  }
}

function DecisionLesson({
  game,
  legal,
  latestAction,
  feedback,
  mode,
  onAsk,
  onHide,
}: {
  game: TrainingGameState;
  legal: TrainingLegalActions;
  latestAction: TrainingActionRecord | undefined;
  feedback: TeacherFeedback | null;
  mode: TeacherMode;
  onAsk: () => void;
  onHide: () => void;
}) {
  const availableActions: TrainingActionType[] = [
    ...(legal.canFold ? ["fold" as const] : []),
    ...(legal.canCheck ? ["check" as const] : []),
    ...(legal.canCall ? ["call" as const] : []),
    ...(legal.canRaise ? ["raise" as const] : []),
    ...(legal.canAllIn ? ["allIn" as const] : []),
  ];

  return (
    <section className={styles.decisionLesson} aria-label="Professor da jogada" aria-live="polite">
      <div className={styles.lessonHeader}>
        <h2><Brain size={17} aria-hidden="true" /> Entenda a jogada</h2>
        <div className={styles.lessonHeaderActions}>
          <span>{STREET_LABELS[game.street]}</span>
          <button type="button" onClick={onHide} aria-label="Ocultar ajuda">
            <EyeOff size={14} aria-hidden="true" /> Ocultar
          </button>
        </div>
      </div>

      <div className={styles.lessonSteps}>
        <article>
          <strong><span>1</span> O que aconteceu</strong>
          <p>{explainLatestAction(latestAction)}</p>
        </article>
        <article>
          <strong><span>2</span> Sua decisão agora</strong>
          <p>{explainDecision(game, legal)}</p>
          <small>{explainStreet(game.street)}</small>
        </article>
      </div>

      {feedback ? (
        <div className={styles.lessonRecommendation}>
          <span><Lightbulb size={15} aria-hidden="true" /> Professor recomenda</span>
          <strong>{ACTION_LABELS[feedback.recommendedAction]}</strong>
          <p>{feedback.explanation}</p>
          <small>{feedback.teachingPoint}</small>
        </div>
      ) : mode === "hints" ? (
        <button type="button" className={styles.lessonHintButton} onClick={onAsk}>
          <CircleHelp size={16} aria-hidden="true" /> Explicar qual ação faz mais sentido
        </button>
      ) : (
        <p className={styles.lessonReviewNote}>
          No modo avaliação, escolha primeiro. O professor compara sua jogada logo depois.
        </p>
      )}

      <div className={styles.actionMeanings} aria-label="Significado das ações disponíveis">
        {availableActions.map((action) => (
          <span key={action}>
            <strong>{ACTION_LABELS[action]}</strong>
            <small>{actionMeaning(action, legal)}</small>
          </span>
        ))}
      </div>
    </section>
  );
}

function TeacherPanel({
  feedback,
  mode,
  canAsk,
  onAsk,
  onHide,
}: {
  feedback: TeacherFeedback | null;
  mode: TeacherMode;
  canAsk: boolean;
  onAsk: () => void;
  onHide: () => void;
}) {
  if (!feedback) {
    return (
      <aside className={`${styles.teacherPanel} ${styles.teacherWaiting}`}>
        <span className={styles.teacherIcon}><Brain size={21} /></span>
        <span className={styles.eyebrow}>Professor</span>
        <h2>{mode === "review" ? "Primeiro, tome sua decisão." : "Observe a ação da mesa."}</h2>
        <p>
          {mode === "review"
            ? "Depois da sua jogada, eu comparo sua linha com uma recomendação matemática."
            : "Quando chegar sua vez, avalie posição, preço e possíveis mãos adversárias."}
        </p>
        {mode === "hints" && canAsk && (
          <button type="button" className={styles.askButton} onClick={onAsk}>
            <CircleHelp size={16} /> Pedir uma dica
          </button>
        )}
        <button type="button" className={styles.teacherHideButton} onClick={onHide}>
          <EyeOff size={16} aria-hidden="true" /> Ocultar ajuda
        </button>
      </aside>
    );
  }

  const gradeClass = feedback.grade ? styles[feedback.grade] : styles.hint;
  return (
    <aside className={`${styles.teacherPanel} ${gradeClass}`}>
      <div className={styles.teacherTop}>
        <span className={styles.eyebrow}>
          <Lightbulb size={16} /> Professor
        </span>
        {feedback.grade && (
          <span className={styles.gradePill}>{GRADE_LABELS[feedback.grade]}</span>
        )}
      </div>
      <h2>{feedback.title}</h2>
      <p>{feedback.explanation}</p>
      <div className={styles.teacherMetrics}>
        <span><small>Equidade</small><strong>{Math.round(feedback.analysis.equity)}%</strong></span>
        <span><small>Pot odds</small><strong>{Math.round(feedback.analysis.potOdds)}%</strong></span>
        <span><small>SPR</small><strong>{feedback.analysis.spr.toFixed(1)}</strong></span>
      </div>
      <div className={styles.recommendation}>
        <span>Uma linha recomendada</span>
        <strong>{ACTION_LABELS[feedback.recommendedAction]}</strong>
      </div>
      <div className={styles.teachingPoint}>
        <Sparkles size={16} />
        <span>{feedback.teachingPoint}</span>
      </div>
      <button type="button" className={styles.teacherHideButton} onClick={onHide}>
        <EyeOff size={16} aria-hidden="true" /> Ocultar ajuda
      </button>
    </aside>
  );
}

function HandSummary({
  game,
  handFeedback,
  progress,
  onNext,
  onNewSession,
  onReview,
}: {
  game: TrainingGameState;
  handFeedback: TeacherFeedback[];
  progress: TrainingProgress;
  onNext: () => void;
  onNewSession: () => void;
  onReview: () => void;
}) {
  const good = handFeedback.filter((item) => item.grade === "good").length;
  const risky = handFeedback.filter((item) => item.grade === "risky").length;
  const hero = game.players.find((player) => player.isHero)!;
  const sessionEnded = game.status === "sessionComplete";
  const showdown = game.result?.showdown ?? [];
  const playerName = (id: string) =>
    game.players.find((player) => player.id === id)?.name ?? "Jogador";
  return (
    <div className={styles.summaryBackdrop} role="presentation">
      <section className={styles.handSummary} role="dialog" aria-modal="true" aria-labelledby="hand-summary-title">
        <span className={styles.summaryIcon}>
          {game.result?.winnerIds.includes(hero.id) ? <Trophy size={24} /> : <Brain size={24} />}
        </span>
        <span className={styles.eyebrow}>{sessionEnded ? "Sessão concluída" : `Mão ${game.handNumber} concluída`}</span>
        <h2 id="hand-summary-title">{game.result?.summary}</h2>
        <div className={styles.summaryStats}>
          <span>
            <small>Resultado</small>
            <strong className={(game.result?.heroNet ?? 0) >= 0 ? styles.positive : styles.negative}>
              {(game.result?.heroNet ?? 0) >= 0 ? "+" : ""}{formatChips(game.result?.heroNet ?? 0)}
            </strong>
          </span>
          <span><small>Boas decisões</small><strong>{good}</strong></span>
          <span><small>Arriscadas</small><strong>{risky}</strong></span>
        </div>
        {showdown.length > 0 && (
          <div className={styles.decisionReview}>
            <div className={styles.reviewHeading}>
              <span>Por que ganhou</span>
              <small>Cartas reveladas</small>
            </div>
            {/* tabIndex permite rolar a lista pelo teclado quando ela transborda. */}
            <div
              className={styles.showdownList}
              role="group"
              aria-label="Mãos reveladas no showdown"
              tabIndex={0}
            >
              {showdown.map((hand) => (
                <div
                  className={`${styles.showdownItem} ${hand.won ? styles.showdownWinner : ""}`}
                  key={hand.playerId}
                >
                  <span className={styles.showdownPlayer}>
                    <strong>
                      {hand.won && <Trophy size={14} aria-label="Venceu" />}
                      {playerName(hand.playerId)}
                    </strong>
                    <em className={styles.showdownHand}>{hand.description}</em>
                  </span>
                  <span className={styles.showdownCards}>
                    {hand.cards.map((card) => (
                      <TrainingCard
                        key={`${card.rank}-${card.suit}`}
                        card={card}
                      />
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {handFeedback.length > 0 && (
          <div className={styles.decisionReview}>
            <div className={styles.reviewHeading}>
              <span>Revisão das decisões</span>
              <small>{trainingSolidRate(progress)}% sólidas no total</small>
            </div>
            <div
              className={styles.reviewList}
              role="group"
              aria-label="Revisão das suas decisões nesta mão"
              tabIndex={0}
            >
              {handFeedback.map((item) => (
                <div className={styles.reviewItem} key={item.id}>
                  <span className={`${styles.reviewGrade} ${styles[item.grade ?? "acceptable"]}`}>
                    {item.grade === "good" ? <Check size={16} /> : item.grade === "risky" ? <X size={16} /> : <Gauge size={16} />}
                  </span>
                  <span>
                    <strong>{STREET_LABELS[item.street]}</strong>
                    <small>
                      Você: {ACTION_LABELS[item.actualAction!]} · Professor: {ACTION_LABELS[item.recommendedAction]}
                    </small>
                  </span>
                  <em>{GRADE_LABELS[item.grade ?? "acceptable"]}</em>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className={styles.summaryNote}>
          O resultado de uma mão não determina a qualidade da decisão. Continue procurando linhas lucrativas no longo prazo.
        </p>
        <div className={styles.summaryActions}>
          <button type="button" className={styles.secondaryAction} onClick={onReview}>
            <History size={16} /> Rever mão
          </button>
          <button type="button" className={styles.secondaryAction} onClick={onNewSession}>
            <RotateCcw size={16} /> Nova sessão
          </button>
          {!sessionEnded && (
            <button type="button" className={styles.primaryAction} onClick={onNext}>
              Próxima mão <ChevronRight size={16} />
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function TrainingHistoryDialog({
  history,
  initialHandId,
  onClose,
}: {
  history: TrainingHandHistory[];
  initialHandId?: string;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(
    initialHandId && history.some((hand) => hand.id === initialHandId)
      ? initialHandId
      : history[0]?.id,
  );
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const selected = history.find((hand) => hand.id === selectedId) ?? history[0];
  const frame = selected?.replay[Math.min(step, selected.replay.length - 1)];

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    if (!playing || !selected) return;
    if (step >= selected.replay.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setStep((current) => current + 1), 850);
    return () => window.clearTimeout(timer);
  }, [playing, selected, step]);

  if (!selected || !frame) return null;

  const heroActionFrames = selected.replay.filter(
    (item) => item.event === "action" && item.action?.playerId === "hero",
  );
  const feedbackIndex = heroActionFrames.findIndex((item) => item.id === frame.id);
  const replayFeedback =
    feedbackIndex >= 0 ? selected.feedback[feedbackIndex] ?? null : null;
  const eventDescription = frame.action
    ? `${frame.action.playerName}: ${ACTION_LABELS[frame.action.action]}${
        frame.action.amount > 0 ? ` · ${formatChips(frame.action.amount)} fichas` : ""
      }`
    : frame.event === "deal"
      ? "Cartas distribuídas e blinds colocados"
      : frame.event === "result"
        ? selected.summary
        : `${STREET_LABELS[frame.street]} aberto`;

  const selectHand = (id: string) => {
    setSelectedId(id);
    setStep(0);
    setPlaying(false);
  };

  return (
    <div className={`${styles.summaryBackdrop} ${styles.historyBackdrop}`} role="presentation">
      <section
        className={styles.historyDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="training-history-title"
      >
        <header className={styles.historyHeader}>
          <span>
            <span className={styles.eyebrow}><History size={16} /> Histórico local</span>
            <h2 id="training-history-title">Reveja cada decisão da mão</h2>
          </span>
          <button type="button" onClick={onClose} aria-label="Fechar histórico">
            <X size={18} />
          </button>
        </header>

        <div className={styles.historyLayout}>
          <nav className={styles.handHistoryList} aria-label="Mãos anteriores">
            {history.map((hand) => (
              <button
                type="button"
                key={hand.id}
                className={hand.id === selected.id ? styles.selectedHistoryHand : ""}
                onClick={() => selectHand(hand.id)}
              >
                <span>
                  <strong>Mão {hand.handNumber}</strong>
                  <small>{new Date(hand.playedAt).toLocaleDateString("pt-BR")}</small>
                </span>
                <em className={hand.heroNet >= 0 ? styles.positive : styles.negative}>
                  {hand.heroNet >= 0 ? "+" : ""}{formatChips(hand.heroNet)}
                </em>
              </button>
            ))}
          </nav>

          <div className={styles.replayPanel}>
            <div className={styles.replayTopline}>
              <span>{STREET_LABELS[frame.street]} · passo {step + 1} de {selected.replay.length}</span>
              <strong>Pote {formatChips(frame.pot)}</strong>
            </div>
            <div className={styles.replayEvent} aria-live="polite">
              <span className={styles.replayEventIcon}>
                {frame.event === "result" ? <Trophy size={16} /> : <Play size={16} />}
              </span>
              <span>
                <small>{frame.event === "action" ? "Ação" : "Momento da mão"}</small>
                <strong>{eventDescription}</strong>
              </span>
            </div>

            <div className={styles.replayBoard}>
              {Array.from({ length: 5 }, (_, index) => (
                <TrainingCard key={index} card={frame.board[index]} />
              ))}
            </div>

            <div className={styles.replayPlayers}>
              {frame.players.map((player) => {
                const reveal =
                  player.isHero ||
                  (frame.event === "result" && selected.wentToShowdown && !player.folded);
                const role =
                  player.seat === selected.dealerSeat
                    ? "D"
                    : player.seat === selected.smallBlindSeat
                      ? "SB"
                      : player.seat === selected.bigBlindSeat
                        ? "BB"
                        : null;
                const position = trainingTablePosition(
                  frame.players,
                  player.seat,
                  selected.dealerSeat,
                  selected.smallBlindSeat,
                  selected.bigBlindSeat,
                );
                return (
                  <div
                    key={player.id}
                    className={`${styles.replayPlayer} ${
                      frame.currentPlayerSeat === player.seat ? styles.currentReplayPlayer : ""
                    } ${player.folded ? styles.foldedReplayPlayer : ""}`}
                  >
                    <div className={styles.replayHoleCards}>
                      {player.holeCards.map((card, index) => (
                        <TrainingCard
                          key={index}
                          card={reveal ? card : undefined}
                          hidden={!reveal}
                        />
                      ))}
                    </div>
                    <span>
                      <strong>
                        {player.name}
                        {position && <span className={styles.positionLabel}>{position}</span>}
                        {role && <em>{role}</em>}
                      </strong>
                      <small>
                        {formatChips(player.stack)} fichas
                        {player.committedStreet > 0
                          ? ` · colocou ${formatChips(player.committedStreet)}`
                          : ""}
                      </small>
                    </span>
                  </div>
                );
              })}
            </div>

            {replayFeedback && (
              <div className={`${styles.replayFeedback} ${styles[replayFeedback.grade ?? "acceptable"]}`}>
                <span><Brain size={16} /> Avaliação do professor</span>
                <strong>{replayFeedback.title}</strong>
                <p>{replayFeedback.explanation}</p>
              </div>
            )}

            <div className={styles.replayControls}>
              <button
                type="button"
                onClick={() => { setPlaying(false); setStep((current) => Math.max(0, current - 1)); }}
                disabled={step === 0}
                aria-label="Passo anterior"
              >
                <StepBack size={16} />
              </button>
              <button
                type="button"
                className={styles.playReplayButton}
                onClick={() => {
                  if (step >= selected.replay.length - 1) setStep(0);
                  setPlaying((current) => !current);
                }}
                aria-label={playing ? "Pausar replay" : "Reproduzir replay"}
              >
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(0, selected.replay.length - 1)}
                value={step}
                onChange={(event) => {
                  setPlaying(false);
                  setStep(Number(event.target.value));
                }}
                aria-label="Posição do replay"
              />
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setStep((current) => Math.min(selected.replay.length - 1, current + 1));
                }}
                disabled={step >= selected.replay.length - 1}
                aria-label="Próximo passo"
              >
                <StepForward size={16} />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function TrainingProgressDialog({
  progress,
  onClose,
  onStartRecommended,
}: {
  progress: TrainingProgress;
  onClose: () => void;
  onStartRecommended?: () => void;
}) {
  const focus = recommendedTrainingFocus(progress);
  const errors = trainingErrorInsights(progress);
  const trend = trainingTrend(progress);
  const highestErrorCount = Math.max(1, ...errors.map((item) => item.count));

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className={`${styles.summaryBackdrop} ${styles.historyBackdrop}`} role="presentation">
      <section
        className={`${styles.historyDialog} ${styles.progressDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="training-progress-title"
      >
        <header className={styles.historyHeader}>
          <span>
            <span className={styles.eyebrow}><BarChart3 size={16} /> Aprendizado local</span>
            <h2 id="training-progress-title">Seu dashboard de evolução</h2>
          </span>
          <button type="button" onClick={onClose} aria-label="Fechar dashboard">
            <X size={18} />
          </button>
        </header>

        <div className={styles.progressDashboard}>
          <section className={styles.dashboardOverview} aria-label="Resumo do progresso">
            <span><small>Mãos</small><strong>{progress.handsPlayed}</strong></span>
            <span><small>Decisões</small><strong>{progress.decisions}</strong></span>
            <span><small>Decisões sólidas</small><strong>{trainingSolidRate(progress)}%</strong></span>
            <span>
              <small>Resultado didático</small>
              <strong className={progress.totalResult >= 0 ? styles.positive : styles.negative}>
                {progress.totalResult >= 0 ? "+" : ""}{formatChips(progress.totalResult)}
              </strong>
            </span>
          </section>

          <div className={styles.dashboardGrid}>
            <section className={styles.dashboardCard} aria-labelledby="street-progress-title">
              <div className={styles.dashboardCardHeading}>
                <span><Target size={16} /> Desempenho por street</span>
                <small>boas + defensáveis</small>
              </div>
              <h3 id="street-progress-title">Onde suas decisões estão mais fortes</h3>
              <div className={styles.streetProgressList}>
                {PRACTICE_STREETS.map((street) => {
                  const stats = progress.byStreet[street];
                  const rate = trainingSolidRate(stats);
                  return (
                    <div key={street} className={styles.streetProgressItem}>
                      <span>
                        <strong>{STREET_LABELS[street]}</strong>
                        <small>{stats.decisions} decisões</small>
                      </span>
                      <span className={styles.streetProgressTrack} aria-hidden="true">
                        <i style={{ width: `${rate}%` }} />
                      </span>
                      <em>{stats.decisions ? `${rate}%` : "—"}</em>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={styles.dashboardCard} aria-labelledby="trend-progress-title">
              <div className={styles.dashboardCardHeading}>
                <span><Activity size={16} /> Evolução recente</span>
                <small>últimas {trend.points.length || 0} mãos com decisões</small>
              </div>
              <h3 id="trend-progress-title">{trend.label}</h3>
              {trend.points.length > 0 ? (
                <div className={styles.trendChart} aria-label="Taxa de decisões sólidas por mão">
                  {trend.points.map((point, index) => (
                    <span
                      key={`${point.playedAt}-${index}`}
                      title={`Mão ${point.handNumber}: ${point.rate}%`}
                    >
                      <i style={{ height: `${Math.max(8, point.rate)}%` }} />
                      <small>{point.rate}%</small>
                    </span>
                  ))}
                </div>
              ) : (
                <p className={styles.emptyDashboardState}>
                  Suas próximas mãos aparecerão aqui para mostrar a evolução.
                </p>
              )}
              {trend.direction !== "new" && (
                <span className={`${styles.trendBadge} ${styles[trend.direction]}`}>
                  {trend.delta > 0 ? "+" : ""}{trend.delta} pontos
                </span>
              )}
            </section>

            <section className={`${styles.dashboardCard} ${styles.errorDashboardCard}`} aria-labelledby="error-progress-title">
              <div className={styles.dashboardCardHeading}>
                <span><Gauge size={16} /> Tipos de erro</span>
                <small>decisões arriscadas</small>
              </div>
              <h3 id="error-progress-title">Padrões que merecem atenção</h3>
              {errors.some((item) => item.count > 0) ? (
                <div className={styles.errorInsightList}>
                  {errors.filter((item) => item.count > 0).map((item) => (
                    <div key={item.kind}>
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                      </span>
                      <span className={styles.errorCountTrack} aria-hidden="true">
                        <i style={{ width: `${(item.count / highestErrorCount) * 100}%` }} />
                      </span>
                      <em>{item.count}</em>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.emptyDashboardState}>
                  Ainda não há erros recorrentes. Continue jogando para formar um diagnóstico.
                </p>
              )}
            </section>

            <aside className={styles.focusDashboardCard}>
              <span className={styles.recommendedExerciseIcon}><Sparkles size={18} /></span>
              <small>Próximo exercício recomendado</small>
              <h3>{focus.title}</h3>
              <p>{focus.description}</p>
              <span className={styles.focusTags}>
                <em>{focus.streetLabel}</em>
                {focus.errorLabel && <em>{focus.errorLabel}</em>}
              </span>
              {onStartRecommended && (
                <button type="button" onClick={onStartRecommended}>
                  Começar exercício <ChevronRight size={16} />
                </button>
              )}
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}

function ResetTrainingDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  return (
    <div className={styles.summaryBackdrop} role="presentation" onMouseDown={onCancel}>
      <section
        className={styles.resetDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-training-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className={styles.summaryIcon}><RotateCcw size={21} /></span>
        <span className={styles.eyebrow}>Nova sessão</span>
        <h2 id="reset-training-title">Descartar a mesa atual?</h2>
        <p>
          A mão e os stacks atuais serão removidos. Seu progresso permanente e
          as estatísticas já registradas continuarão salvos.
        </p>
        <div className={styles.summaryActions}>
          <button type="button" className={styles.secondaryAction} onClick={onCancel}>
            Continuar jogando
          </button>
          <button type="button" className={styles.resetAction} onClick={onConfirm}>
            Descartar sessão
          </button>
        </div>
      </section>
    </div>
  );
}

function GameTable({
  game,
  thinking,
  legal,
  teacherFeedback,
  teacherMode,
  teacherVisible,
  revealing,
  onAskHint,
  onHideTeacher,
  onShowTeacher,
  onShowSummary,
  onAction,
}: {
  game: TrainingGameState;
  thinking: boolean;
  legal: TrainingLegalActions | null;
  teacherFeedback: TeacherFeedback | null;
  teacherMode: TeacherMode;
  teacherVisible: boolean;
  revealing: boolean;
  onAskHint: () => void;
  onHideTeacher: () => void;
  onShowTeacher: () => void;
  onShowSummary: () => void;
  onAction: (decision: TrainingDecision) => void;
}) {
  const hero = game.players.find((player) => player.isHero)!;
  const heroTurn = legal?.playerId === hero.id;
  const recentActions = game.actions
    .filter((action) => action.handNumber === game.handNumber)
    .slice(-5)
    .reverse();
  const latestAction = recentActions[0];
  const pot = trainingPotTotal(game);

  return (
    <section className={styles.tableColumn}>
      <div className={styles.tableStatus}>
        <span>{STREET_LABELS[game.street]} · mão {game.handNumber}</span>
        <strong key={`${thinking}-${revealing}-${heroTurn}-${game.currentPlayerSeat}`} className={styles.statusChanged} aria-live="polite">
          {thinking ? <><LoaderCircle className={styles.spinner} size={16} /> Adversário pensando</> : revealing ? "Cartas reveladas" : heroTurn ? "Sua vez" : "Mão em andamento"}
        </strong>
      </div>
      <div
        className={`${styles.pokerTable} ${revealing ? styles.revealingTable : ""}`}
        role="group"
        aria-label="Mesa de poker"
      >
        <div className={styles.feltMark}><Spade size={18} /> MESA CERTA</div>
        {game.players.map((player) => (
          <PlayerSeat key={player.id} player={player} game={game} />
        ))}
        <div className={styles.tableCenter}>
          <span key={pot} className={`${styles.potLabel} ${styles.potChanged}`}>
            <Coins size={16} aria-hidden="true" /> Pote <strong>{formatChips(pot)}</strong>
          </span>
          <div className={styles.boardCards}>
            {Array.from({ length: 5 }, (_, index) => {
              const card = game.board[index];
              const key = card
                ? `${game.handNumber}-${index}-${card.rank}-${card.suit}`
                : `${game.handNumber}-${index}-empty`;
              return (
                <TrainingCard
                  key={key}
                  card={card}
                  animation={card ? "reveal" : undefined}
                  animationDelay={index < 3 ? index * 110 : 0}
                />
              );
            })}
          </div>
          <span key={game.street} className={`${styles.streetLabel} ${styles.streetChanged}`}>
            {STREET_LABELS[game.street]}
          </span>
          {revealing ? (
            <div className={styles.showdownBanner} role="status" aria-live="assertive">
              <span><Sparkles size={15} aria-hidden="true" /> Revelação didática</span>
              <strong>{game.result?.summary}</strong>
              <small>
                {game.street === "showdown"
                  ? "Compare as cartas e observe por que essa mão venceu."
                  : "No treino, mostramos as cartas mesmo quando a mão termina antes do showdown."}
              </small>
            </div>
          ) : latestAction && (
            <span key={latestAction.id} className={styles.lastAction} aria-live="polite">
              <small>Última ação</small>
              <strong>{latestAction.playerName}</strong> {ACTION_LABELS[latestAction.action]}
              {latestAction.amount > 0 ? ` ${formatChips(latestAction.amount)}` : ""}
            </span>
          )}
        </div>
      </div>

      <div className={styles.decisionDock}>
        {heroTurn && legal ? (
          <>
            {teacherVisible ? (
              <DecisionLesson
                game={game}
                legal={legal}
                latestAction={latestAction}
                feedback={teacherFeedback}
                mode={teacherMode}
                onAsk={onAskHint}
                onHide={onHideTeacher}
              />
            ) : (
              <button type="button" className={styles.teacherRestoreButton} onClick={onShowTeacher}>
                <Eye size={16} aria-hidden="true" /> Mostrar ajuda nesta decisão
              </button>
            )}
            <ActionControls legal={legal} onAction={onAction} />
          </>
        ) : revealing ? (
          <section className={styles.revealWaitingPanel} aria-label="Cartas sendo reveladas">
            <Sparkles size={18} aria-hidden="true" />
            <span>Observe as mãos abertas antes do resumo.</span>
            <button type="button" onClick={onShowSummary}>
              Entendi, ver resumo <ChevronRight size={15} aria-hidden="true" />
            </button>
          </section>
        ) : (
          <section className={styles.waitingPanel}>
            {thinking ? <LoaderCircle className={styles.spinner} size={18} /> : <Bot size={18} />}
            <span>{thinking ? "Os bots estão avaliando a mesa…" : "Aguardando a próxima ação…"}</span>
          </section>
        )}
        {recentActions.length > 0 && <RecentActions actions={recentActions} />}
      </div>
    </section>
  );
}

function ActiveTraining({
  game,
  feedback,
  progress,
  onGameChange,
  onFeedbackChange,
  onNewSession,
  onOpenHistory,
  onOpenProgress,
  onOpenRanges,
  overlayPending,
}: {
  game: TrainingGameState;
  feedback: TeacherFeedback[];
  progress: TrainingProgress;
  onGameChange: (game: TrainingGameState) => void;
  onFeedbackChange: (feedback: TeacherFeedback[]) => void;
  onNewSession: () => void;
  onOpenHistory: (handId?: string) => void;
  onOpenProgress: () => void;
  onOpenRanges: () => void;
  overlayPending: boolean;
}) {
  const [thinking, setThinking] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [teacherVisible, setTeacherVisible] = useState(true);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [latestFeedback, setLatestFeedback] = useState<TeacherFeedback | null>(
    feedback.at(-1) ?? null,
  );
  const legal = useMemo(() => getTrainingLegalActions(game), [game]);
  const hero = game.players.find((player) => player.isHero)!;
  const heroTurn = legal?.playerId === hero.id;
  const hint = useMemo(
    () => (heroTurn ? createTeacherHint(game) : null),
    [game, heroTurn],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    if (
      overlayPending ||
      game.status !== "playing" ||
      !legal ||
      legal.playerId === hero.id
    ) {
      setThinking(false);
      return;
    }
    setThinking(true);
    const expectedPlayer = legal.playerId;
    const expectedActions = game.actions.length;
    const timer = window.setTimeout(() => {
      try {
        const decision = chooseBotAction(game);
        if (
          getTrainingLegalActions(game)?.playerId === expectedPlayer &&
          game.actions.length === expectedActions
        ) {
          onGameChange(applyTrainingAction(game, decision));
        }
      } catch {
        const fallbackLegal = getTrainingLegalActions(game);
        if (fallbackLegal?.playerId === expectedPlayer) {
          const fallback: TrainingDecision = fallbackLegal.canCheck
            ? { type: "check" }
            : fallbackLegal.canCall
              ? { type: "call" }
              : { type: "fold" };
          onGameChange(applyTrainingAction(game, fallback));
        }
      } finally {
        setThinking(false);
      }
    }, game.config.actionSpeed === "slow" ? 1_150 : game.config.actionSpeed === "fast" ? 260 : 650);
    return () => window.clearTimeout(timer);
  }, [game, hero.id, legal, onGameChange, overlayPending]);

  useEffect(() => {
    if (heroTurn) setShowHint(false);
  }, [game.handNumber, game.street, game.actions.length, heroTurn]);

  const handFinished =
    game.status === "handComplete" || game.status === "sessionComplete";

  const performAction = (decision: TrainingDecision) => {
    const evaluation = evaluateHeroDecision(game, decision);
    if (evaluation) {
      const nextFeedback = [...feedback, evaluation].slice(-300);
      onFeedbackChange(nextFeedback);
      setLatestFeedback(evaluation);
    }
    setShowHint(false);
    onGameChange(applyTrainingAction(game, decision));
  };

  const visibleTeacher =
    heroTurn &&
    (game.config.teacherMode === "guided" ||
      (game.config.teacherMode === "hints" && showHint))
      ? hint
      : latestFeedback;
  const handFeedback = feedback.filter(
    (item) => item.handNumber === game.handNumber && item.actualAction,
  );

  const nextHand = () => {
    setLatestFeedback(null);
    setShowHint(false);
    setSummaryVisible(false);
    onGameChange(startNextTrainingHand(game));
  };

  return (
    <main className={styles.gameShell}>
      <header className={styles.gameHeader}>
        <div>
          <Link href="/" className={styles.brandLink}><Spade size={16} /> <strong>Mesa Certa</strong></Link>
          <span className={styles.modeLabel}>
            Mesa de treino · {game.config.botStrategy === "adaptive" ? "bots adaptativos" : "GTO aproximado"}
          </span>
        </div>
        <div className={styles.sessionStats}>
          <span><small>Stack</small><strong>{formatChips(hero.stack)}</strong></span>
          <span><small>Mãos</small><strong>{game.handNumber}</strong></span>
          <span>
            <small>{game.config.format === "cash" ? "Blinds" : `Nível ${game.blindLevel}`}</small>
            <strong>{game.smallBlind}/{game.bigBlind}{game.ante > 0 ? ` · ${game.ante}` : ""}</strong>
          </span>
          {progress.history.length > 0 && (
            <button type="button" onClick={() => onOpenHistory()}>
              <History size={16} /> Histórico
            </button>
          )}
          <button type="button" onClick={onOpenRanges}>
            <Grid3X3 size={16} /> Ranges
          </button>
          <button type="button" onClick={onOpenProgress}>
            <BarChart3 size={16} /> Evolução
          </button>
          <button type="button" onClick={onNewSession}><RotateCcw size={16} /> Nova sessão</button>
        </div>
      </header>

      <div className={`${styles.gameLayout} ${!teacherVisible ? styles.teacherHiddenLayout : ""}`}>
        <GameTable
          game={game}
          thinking={thinking}
          legal={legal}
          teacherFeedback={visibleTeacher}
          teacherMode={game.config.teacherMode}
          teacherVisible={teacherVisible}
          revealing={handFinished && !summaryVisible && !overlayPending}
          onAskHint={() => setShowHint(true)}
          onHideTeacher={() => setTeacherVisible(false)}
          onShowTeacher={() => setTeacherVisible(true)}
          onShowSummary={() => setSummaryVisible(true)}
          onAction={performAction}
        />
        {teacherVisible && (
          <TeacherPanel
            feedback={visibleTeacher}
            mode={game.config.teacherMode}
            canAsk={heroTurn}
            onAsk={() => setShowHint(true)}
            onHide={() => setTeacherVisible(false)}
          />
        )}
      </div>

      {!overlayPending && handFinished && summaryVisible && (
        <HandSummary
          game={game}
          handFeedback={handFeedback}
          progress={progress}
          onNext={nextHand}
          onNewSession={onNewSession}
          onReview={() => onOpenHistory(`${game.id}:${game.handNumber}`)}
        />
      )}
    </main>
  );
}

export default function TrainingGame() {
  const [hydrated, setHydrated] = useState(false);
  const [game, setGame] = useState<TrainingGameState | null>(null);
  const [feedback, setFeedback] = useState<TeacherFeedback[]>([]);
  const [progress, setProgress] = useState<TrainingProgress>(
    createEmptyTrainingProgress,
  );
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [historyRequest, setHistoryRequest] = useState<{ handId?: string } | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [showRanges, setShowRanges] = useState(false);

  useEffect(() => {
    const saved = loadTrainingSession();
    setProgress(loadTrainingProgress());
    if (saved) {
      setGame(saved.game);
      setFeedback(saved.feedback);
    }
    setHydrated(true);
  }, []);

  const progressWithCurrentHand = useMemo(
    () =>
      game
        ? recordCompletedTrainingHand(progress, game, feedback)
        : progress,
    [feedback, game, progress],
  );

  useEffect(() => {
    if (progressWithCurrentHand !== progress) {
      setProgress(progressWithCurrentHand);
    }
  }, [progress, progressWithCurrentHand]);

  useEffect(() => {
    if (!hydrated || !game) return;
    saveTrainingSession({
      version: 1,
      game,
      feedback,
      savedAt: new Date().toISOString(),
    });
  }, [feedback, game, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveTrainingProgress(progressWithCurrentHand);
  }, [hydrated, progressWithCurrentHand]);

  const changeGame = useCallback((next: TrainingGameState) => {
    setGame(next);
  }, []);
  const changeFeedback = useCallback((next: TeacherFeedback[]) => {
    setFeedback(next);
  }, []);

  const confirmNewSession = useCallback(() => {
    clearTrainingSession();
    setGame(null);
    setFeedback([]);
    setShowResetConfirm(false);
  }, []);

  if (!hydrated) {
    return (
      <main className={styles.loadingShell}>
        <LoaderCircle className={styles.spinner} size={24} />
        <span>Preparando a mesa de treino…</span>
      </main>
    );
  }

  if (!game) {
    return (
      <>
        <TrainingSetup
          progress={progressWithCurrentHand}
          onOpenHistory={() => setHistoryRequest({})}
          onOpenProgress={() => setShowProgress(true)}
          onOpenRanges={() => setShowRanges(true)}
          onImportProgress={(imported) => {
            setProgress(imported);
            saveTrainingProgress(imported);
          }}
          onStart={(config) => {
            setFeedback([]);
            setGame(
              createTrainingGame({
                ...config,
                heroModel: heroModelFromProgress(progressWithCurrentHand),
                seed: createSessionSeed(),
              }),
            );
          }}
        />
        {historyRequest && progressWithCurrentHand.history.length > 0 && (
          <TrainingHistoryDialog
            history={progressWithCurrentHand.history}
            initialHandId={historyRequest.handId}
            onClose={() => setHistoryRequest(null)}
          />
        )}
        {showProgress && (
          <TrainingProgressDialog
            progress={progressWithCurrentHand}
            onClose={() => setShowProgress(false)}
            onStartRecommended={() => {
              setShowProgress(false);
              setFeedback([]);
              setGame(
                createTrainingGame({
                  ...recommendedTrainingConfig(progressWithCurrentHand),
                  heroModel: heroModelFromProgress(progressWithCurrentHand),
                  seed: createSessionSeed(),
                }),
              );
            }}
          />
        )}
        {showRanges && (
          <StartingHandChartDialog onClose={() => setShowRanges(false)} />
        )}
      </>
    );
  }

  return (
    <>
      <ActiveTraining
        game={game}
        feedback={feedback}
        progress={progressWithCurrentHand}
        onGameChange={changeGame}
        onFeedbackChange={changeFeedback}
        onNewSession={() => setShowResetConfirm(true)}
        onOpenHistory={(handId) => setHistoryRequest({ handId })}
        onOpenProgress={() => setShowProgress(true)}
        onOpenRanges={() => setShowRanges(true)}
        overlayPending={showResetConfirm || Boolean(historyRequest) || showProgress || showRanges}
      />
      {showResetConfirm && (
        <ResetTrainingDialog
          onConfirm={confirmNewSession}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}
      {historyRequest && progressWithCurrentHand.history.length > 0 && (
        <TrainingHistoryDialog
          history={progressWithCurrentHand.history}
          initialHandId={historyRequest.handId}
          onClose={() => setHistoryRequest(null)}
        />
      )}
      {showProgress && (
        <TrainingProgressDialog
          progress={progressWithCurrentHand}
          onClose={() => setShowProgress(false)}
        />
      )}
      {showRanges && (
        <StartingHandChartDialog onClose={() => setShowRanges(false)} />
      )}
    </>
  );
}
