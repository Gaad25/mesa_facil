"use client";

import {
  Activity,
  Brain,
  Check,
  ChevronRight,
  Cloud,
  Gauge,
  HeartPulse,
  History,
  Info,
  LogOut,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Spade,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  actionRecommendationLabel,
  AdviceCard,
  MobileDecisionBar,
} from "@/components/poker/advice";
import { HistoryView } from "@/components/poker/history-view";
import { ProfileView } from "@/components/poker/profile-view";
import { TrainingView } from "@/components/poker/training-view";
import {
  CardFace,
  NumberField,
  RANKS,
  SUITS,
  cardKey,
  isRedSuit,
} from "@/components/poker/table-controls";
import {
  ACTION_LABELS,
  APP_STORAGE_KEY,
  MOOD_LABELS,
  createPlayers,
  deriveOpponentStats,
  emptyAppData,
  formatMoney,
  getSeatRoles,
  normalizeAppData,
  rotateButton,
  seatForHeroAsBigBlind,
  totalSessionResult,
  type AppData,
  type HandRecord,
  type Mood,
  type PlayerStyle,
  type RecordedAction,
  type Session,
  type TableAction,
} from "@/lib/app-state";
import type { SpotInput } from "@/lib/analysis-protocol";
import {
  type Card,
  type EmotionalState,
  type OpponentStyle,
  type PreflopPressure,
  type Rank,
  type TablePosition,
} from "@/lib/poker";
import { useSpotAnalysis } from "@/lib/use-spot-analysis";

type AppTab = "table" | "training" | "history" | "profile";
type Pressure = "unopened" | "limp" | "raise" | "threeBet" | "allIn";
type CardTarget = { zone: "hero" | "board"; index: number } | null;
type HeroDecisionSnapshot = {
  actualAction: TableAction;
  recommendedAction?: string;
  equity?: number;
  lesson?: string;
};

const PRESSURE_LABELS: Record<Pressure, string> = {
  unopened: "Ninguém aumentou",
  limp: "Entraram pagando",
  raise: "Houve raise",
  threeBet: "Houve 3-bet",
  allIn: "Há um all-in",
};

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampNumber(value: number, min = 0, max = 1_000_000) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function friendlyPosition(position?: string) {
  if (!position) return "Sem posição";
  if (position === "BTN") return "Dealer · BTN";
  return position;
}

function unopenedCallAmount(
  role: string,
  smallBlind: number,
  bigBlind: number,
) {
  if (role === "BB") return 0;
  if (role.includes("SB")) return Math.max(0, bigBlind - smallBlind);
  return bigBlind;
}

function getDominantOpponentStyle(session: Session): OpponentStyle {
  const opponent = session.players.find(
    (player) => player.active && player.id !== session.heroId,
  );
  const map: Record<PlayerStyle, OpponentStyle> = {
    unknown: "balanced",
    tight: "tight",
    loose: "loose",
    aggressive: "aggressive",
    passive: "passive",
  };
  return map[opponent?.style ?? "unknown"];
}

function enginePosition(role: string): TablePosition {
  if (role.includes("BTN")) return "BTN";
  if (role === "SB") return "SB";
  if (role === "BB") return "BB";
  if (role === "CO") return "CO";
  if (role === "HJ" || role.startsWith("MP")) return "MIDDLE";
  if (role.startsWith("UTG")) return "UTG";
  return "MIDDLE";
}

function enginePressure(pressure: Pressure): PreflopPressure {
  const map: Record<Pressure, PreflopPressure> = {
    unopened: "none",
    limp: "limped",
    raise: "raised",
    threeBet: "threeBet",
    allIn: "allIn",
  };
  return map[pressure];
}

function engineMood(mood: Mood): EmotionalState {
  return mood === "focused" ? "calm" : mood;
}

function usePersistentData() {
  const [data, setData] = useState<AppData>(emptyAppData);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(APP_STORAGE_KEY);
      if (stored) {
        const parsed = normalizeAppData(JSON.parse(stored));
        if (parsed) setData(parsed);
        else window.localStorage.removeItem(APP_STORAGE_KEY);
      }
    } catch {
      // A versão local continua funcional mesmo se o armazenamento estiver indisponível.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(data));
  }, [data, hydrated]);

  return { data, setData, hydrated };
}

function IconButton({
  label,
  children,
  onClick,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`iconButton ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Brand() {
  return (
    <div className="brand" role="img" aria-label="Mesa Certa">
      <span className="brandMark" aria-hidden="true">
        <Spade size={24} strokeWidth={2.75} />
      </span>
      <span>
        <strong>Mesa Certa</strong>
      </span>
    </div>
  );
}

function CopilotSwitch({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? "Desativar Copilot" : "Ativar Copilot"}
      className={`copilotSwitch ${enabled ? "isOn" : ""}`}
      onClick={() => onChange(!enabled)}
    >
      <span className="copilotPulse" aria-hidden="true">
        <Sparkles size={16} />
      </span>
      <span className="copilotWords">
        <small>Copilot</small>
        <strong>{enabled ? "Ativo" : "Pausado"}</strong>
      </span>
      <span className="switchTrack" aria-hidden="true">
        <span />
      </span>
    </button>
  );
}

function TopBar({
  copilotEnabled,
  onCopilotChange,
  online,
}: {
  copilotEnabled: boolean;
  onCopilotChange: (enabled: boolean) => void;
  online: boolean;
}) {
  return (
    <header className="topBar">
      <Brand />
      <div className="topBarActions">
        <a className="playPokerCta" href="/treino">
          <Play size={16} fill="currentColor" aria-hidden="true" />
          <span>
            <strong>Jogar poker</strong>
            <small>Modo offline</small>
          </span>
        </a>
        <span className={`connectionDot ${online ? "online" : ""}`}>
          {online ? <Cloud size={16} /> : <CloudOffIcon />}
          <span>{online ? "Online" : "Offline"}</span>
        </span>
        <CopilotSwitch
          enabled={copilotEnabled}
          onChange={onCopilotChange}
        />
      </div>
    </header>
  );
}

function CloudOffIcon() {
  return <Cloud size={16} aria-hidden="true" className="cloudOff" />;
}

function BottomNav({
  active,
  onChange,
  handCount,
}: {
  active: AppTab;
  onChange: (tab: AppTab) => void;
  handCount: number;
}) {
  const items: Array<{
    id: AppTab | "play";
    label: string;
    icon: ReactNode;
    badge?: number;
    href?: string;
  }> = [
    { id: "table", label: "Mesa", icon: <Spade size={21} /> },
    {
      id: "play",
      label: "Jogar",
      icon: <Play size={21} fill="currentColor" />,
      href: "/treino",
    },
    { id: "training", label: "Aprender", icon: <Brain size={21} /> },
    {
      id: "history",
      label: "Histórico",
      icon: <History size={21} />,
      badge: handCount,
    },
    { id: "profile", label: "Perfil", icon: <UserRound size={21} /> },
  ];

  return (
    <nav className="bottomNav" aria-label="Navegação principal">
      {items.map((item) => {
        const content = (
          <>
            <span className="navIcon">
              {item.icon}
              {!!item.badge && <small>{Math.min(99, item.badge)}</small>}
            </span>
            {item.label}
          </>
        );

        if (item.href) {
          return (
            <a key={item.id} className="playNavItem" href={item.href}>
              {content}
            </a>
          );
        }

        return (
          <button
            type="button"
            key={item.id}
            className={active === item.id ? "active" : ""}
            aria-current={active === item.id ? "page" : undefined}
            onClick={() => onChange(item.id as AppTab)}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}

interface SetupDraft {
  name: string;
  playerCount: number;
  heroSeat: number;
  playerNames: string[];
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  heroStack: number;
  bankroll: number;
  stopLoss: number;
  startAtBigBlind: boolean;
  buttonSeat: number;
}

const DEFAULT_SETUP: SetupDraft = {
  name: "Mesa dos amigos",
  playerCount: 6,
  heroSeat: 0,
  playerNames: ["Você", "João", "Ana", "Pedro", "Bia", "Lucas"],
  smallBlind: 5,
  bigBlind: 10,
  buyIn: 500,
  heroStack: 500,
  bankroll: 1_500,
  stopLoss: 500,
  startAtBigBlind: true,
  buttonSeat: 4,
};

function SetupTable({
  onStart,
  onSimpleMode,
}: {
  onStart: (session: Session) => void;
  onSimpleMode: () => void;
}) {
  const [draft, setDraft] = useState<SetupDraft>(DEFAULT_SETUP);
  const [step, setStep] = useState<1 | 2>(1);

  const updatePlayerCount = (count: number) => {
    const nextCount = clampNumber(count, 2, 9);
    const nextNames = Array.from(
      { length: nextCount },
      (_, index) =>
        draft.playerNames[index] ||
        (index === draft.heroSeat ? "Você" : `Jogador ${index + 1}`),
    );
    setDraft((current) => ({
      ...current,
      playerCount: nextCount,
      heroSeat: Math.min(current.heroSeat, nextCount - 1),
      buttonSeat: Math.min(current.buttonSeat, nextCount - 1),
      playerNames: nextNames,
    }));
  };

  const startSession = () => {
    const players = createPlayers(
      draft.playerCount,
      draft.heroSeat,
      draft.heroStack,
      draft.playerNames,
    );
    players.forEach((player) => {
      if (player.id !== "hero") player.stack = draft.buyIn;
    });
    const buttonSeat = draft.startAtBigBlind
      ? seatForHeroAsBigBlind(players, draft.heroSeat)
      : draft.buttonSeat;

    onStart({
      id: makeId("session"),
      name: draft.name.trim() || "Mesa dos amigos",
      active: true,
      startedAt: new Date().toISOString(),
      handNumber: 1,
      smallBlind: draft.smallBlind,
      bigBlind: Math.max(draft.bigBlind, draft.smallBlind),
      buyIn: draft.buyIn,
      initialBankroll: draft.bankroll,
      stopLoss: draft.stopLoss,
      heroId: "hero",
      buttonSeat,
      players,
      hands: [],
    });
  };

  return (
    <section className="setupPage pageEnter">
      <div className="setupHero">
        <span className="eyebrow gold">
          <Sparkles size={16} />
          Sua vantagem começa aqui
        </span>
        <h1>Monte a mesa uma vez.<br />Jogue sem perder o ritmo.</h1>
        <p>
          O Mesa Certa gira as posições, acompanha a banca e prepara o Copilot
          para cada decisão.
        </p>
        <div className="setupTrust">
          <span>
            <ShieldCheck size={16} /> Seus dados são privados
          </span>
          <span>
            <Activity size={16} /> Funciona mesmo sem sinal
          </span>
        </div>
      </div>

      <div className="setupCard surfaceCard">
        <div className="stepHeader">
          <div>
            <span>Configuração inicial</span>
            <h2>{step === 1 ? "A mesa" : "Jogadores e posições"}</h2>
          </div>
          <div className="stepDots" aria-label={`Etapa ${step} de 2`}>
            <span className="active" />
            <span className={step === 2 ? "active" : ""} />
          </div>
        </div>

        {step === 1 ? (
          <div className="setupFields">
            <label className="textField full">
              <span>Nome da sessão</span>
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                placeholder="Mesa dos amigos"
              />
            </label>

            <div className="playerStepper full">
              <span>
                <Users size={18} />
                Jogadores na mesa
              </span>
              <div>
                <IconButton
                  label="Remover jogador"
                  onClick={() => updatePlayerCount(draft.playerCount - 1)}
                >
                  <Minus size={18} />
                </IconButton>
                <strong>{draft.playerCount}</strong>
                <IconButton
                  label="Adicionar jogador"
                  onClick={() => updatePlayerCount(draft.playerCount + 1)}
                >
                  <Plus size={18} />
                </IconButton>
              </div>
            </div>

            <NumberField
              label="Small blind"
              value={draft.smallBlind}
              onChange={(smallBlind) => setDraft({ ...draft, smallBlind })}
            />
            <NumberField
              label="Big blind"
              value={draft.bigBlind}
              onChange={(bigBlind) => setDraft({ ...draft, bigBlind })}
            />
            <NumberField
              label="Buy-in"
              value={draft.buyIn}
              onChange={(buyIn) =>
                setDraft({ ...draft, buyIn, heroStack: buyIn })
              }
            />
            <NumberField
              label="Seu stack"
              hint="fichas agora"
              value={draft.heroStack}
              onChange={(heroStack) => setDraft({ ...draft, heroStack })}
            />
            <NumberField
              label="Banca total"
              value={draft.bankroll}
              onChange={(bankroll) => setDraft({ ...draft, bankroll })}
            />
            <NumberField
              label="Limite de perda"
              value={draft.stopLoss}
              onChange={(stopLoss) => setDraft({ ...draft, stopLoss })}
            />
          </div>
        ) : (
          <div className="seatSetup">
            <p className="sectionHint">
              Toque no seu assento. Você sempre aparecerá na parte inferior da
              mesa durante o jogo.
            </p>
            <div className="seatPicker">
              <div className="seatPickerFelt">
                <Spade size={21} />
                <span>Mesa {draft.playerCount}-max</span>
              </div>
              {Array.from({ length: draft.playerCount }, (_, index) => {
                const angle =
                  -90 + (index * 360) / Math.max(2, draft.playerCount);
                const radians = (angle * Math.PI) / 180;
                const style = {
                  "--seat-left": `${50 + Math.cos(radians) * 45}%`,
                  "--seat-top": `${50 + Math.sin(radians) * 43}%`,
                } as CSSProperties;
                return (
                  <button
                    type="button"
                    className={`setupSeat ${
                      draft.heroSeat === index ? "hero" : ""
                    }`}
                    style={style}
                    key={index}
                    onClick={() => {
                      const names = [...draft.playerNames];
                      const previousHero = draft.heroSeat;
                      if (names[previousHero] === "Você") {
                        names[previousHero] = `Jogador ${previousHero + 1}`;
                      }
                      names[index] = "Você";
                      setDraft({ ...draft, heroSeat: index, playerNames: names });
                    }}
                    aria-label={`Assento ${index + 1}${
                      draft.heroSeat === index ? ", seu assento" : ""
                    }`}
                  >
                    {draft.heroSeat === index ? "Você" : index + 1}
                  </button>
                );
              })}
            </div>

            <div className="positionChoice">
              <button
                type="button"
                className={draft.startAtBigBlind ? "selected" : ""}
                onClick={() =>
                  setDraft({ ...draft, startAtBigBlind: true })
                }
              >
                <span className="choiceRadio" />
                <span>
                  <strong>Eu começo no Big Blind</strong>
                  <small>Recomendado para a partida de amanhã</small>
                </span>
                {draft.startAtBigBlind && <Check size={18} />}
              </button>
              <button
                type="button"
                className={!draft.startAtBigBlind ? "selected" : ""}
                onClick={() =>
                  setDraft({ ...draft, startAtBigBlind: false })
                }
              >
                <span className="choiceRadio" />
                <span>
                  <strong>Escolher o Dealer/Button</strong>
                  <small>Marque manualmente quem começa no botão</small>
                </span>
                {!draft.startAtBigBlind && <Check size={18} />}
              </button>
              {!draft.startAtBigBlind && (
                <label className="selectField">
                  <span>Dealer/Button inicial</span>
                  <select
                    value={draft.buttonSeat}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        buttonSeat: Number(event.target.value),
                      })
                    }
                  >
                    {draft.playerNames
                      .slice(0, draft.playerCount)
                      .map((name, index) => (
                        <option key={index} value={index}>
                          {name || `Jogador ${index + 1}`}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>

            <div className="playerNames">
              {draft.playerNames
                .slice(0, draft.playerCount)
                .map((name, index) => (
                  <label key={index}>
                    <span>Assento {index + 1}</span>
                    <input
                      disabled={index === draft.heroSeat}
                      value={index === draft.heroSeat ? "Você" : name}
                      onChange={(event) => {
                        const playerNames = [...draft.playerNames];
                        playerNames[index] = event.target.value;
                        setDraft({ ...draft, playerNames });
                      }}
                    />
                  </label>
                ))}
            </div>
          </div>
        )}

        <div className="setupActions">
          {step === 2 && (
            <button
              type="button"
              className="secondaryButton"
              onClick={() => setStep(1)}
            >
              Voltar
            </button>
          )}
          <button
            type="button"
            className="primaryButton"
            onClick={() => (step === 1 ? setStep(2) : startSession())}
          >
            {step === 1 ? "Escolher assentos" : "Começar a sessão"}
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="setupModeShortcut">
          <div>
            <Gauge size={18} />
            <span>
              <strong>Quer decidir sem configurar uma mesa?</strong>
              <small>Informe só suas cartas, a mesa e o valor para jogar.</small>
            </span>
          </div>
          <button type="button" onClick={onSimpleMode}>
            Usar modo simplificado
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

function SimpleMode({
  copilotEnabled,
  onEnableCopilot,
  onBack,
}: {
  copilotEnabled: boolean;
  onEnableCopilot: () => void;
  onBack: () => void;
}) {
  const [heroCards, setHeroCards] = useState<Card[]>([]);
  const [board, setBoard] = useState<Card[]>([]);
  const [amountToPlay, setAmountToPlay] = useState(0);
  const [cardTarget, setCardTarget] = useState<CardTarget>(null);

  const spot = useMemo<SpotInput | null>(() => {
    if (heroCards.length !== 2 || ![0, 3, 4, 5].includes(board.length)) {
      return null;
    }

    const safeAmount = Math.max(0, amountToPlay);
    return {
      holeCards: heroCards,
      board,
      pot: safeAmount * 4,
      callAmount: safeAmount,
      effectiveStack: Math.max(100, safeAmount * 20),
      opponents: 1,
      position: "MIDDLE",
      opponentStyle: "balanced",
      preflopPressure: safeAmount > 0 ? "raised" : "none",
      emotionalState: "calm",
      bigBlind: Math.max(1, safeAmount),
    };
  }, [amountToPlay, board, heroCards]);

  const { analysis, pending: analysisPending } = useSpotAnalysis(spot);

  const usedCards = useMemo(
    () => new Set([...heroCards, ...board].map(cardKey)),
    [heroCards, board],
  );

  const setSelectedCard = (card: Card) => {
    if (!cardTarget) return;
    if (cardTarget.zone === "hero") {
      const next = [...heroCards];
      next[cardTarget.index] = card;
      const compactCards = next.filter(Boolean);
      setHeroCards(compactCards);
      setCardTarget(
        compactCards.length < 2
          ? { zone: "hero", index: compactCards.length }
          : null,
      );
      return;
    }

    const next = [...board];
    next[cardTarget.index] = card;
    const nextBoard = next.filter(Boolean);
    setBoard(nextBoard);
    setCardTarget(
      nextBoard.length > 0 && nextBoard.length < 3
        ? { zone: "board", index: nextBoard.length }
        : null,
    );
  };

  const removeSelectedCard = () => {
    if (!cardTarget) return;
    if (cardTarget.zone === "hero") {
      setHeroCards((cards) =>
        cards.filter((_, index) => index !== cardTarget.index),
      );
    } else {
      setBoard((cards) =>
        cards.filter((_, index) => index !== cardTarget.index),
      );
    }
    setCardTarget(null);
  };

  const clearSimpleMode = () => {
    setHeroCards([]);
    setBoard([]);
    setAmountToPlay(0);
    setCardTarget(null);
  };

  const boardLabel =
    board.length < 3
      ? "Pré-flop"
      : board.length === 3
        ? "Flop"
        : board.length === 4
          ? "Turn"
          : "River";

  return (
    <section className="simpleModePage pageEnter">
      <div className="simpleModeHeader">
        <div>
          <span className="eyebrow gold">
            <Gauge size={16} />
            Entrada rápida
          </span>
          <h1>Cartas, valor e decisão.</h1>
          <p>
            Sem sessão, posições ou histórico: coloque as cartas conhecidas e
            veja a melhor linha para esta jogada.
          </p>
        </div>
        <div className="simpleModeHeaderActions">
          <button type="button" className="secondaryButton" onClick={clearSimpleMode}>
            <RotateCcw size={16} />
            Limpar
          </button>
          <button type="button" className="secondaryButton" onClick={onBack}>
            Configurar mesa completa
          </button>
        </div>
      </div>

      <div className="simpleModeLayout">
        <section className="simpleModeForm surfaceCard">
          <div className="simpleModeSectionHeader">
            <div>
              <span className="eyebrow">1 · Suas cartas</span>
              <h2>O que você tem na mão?</h2>
            </div>
            <span className="simpleModeProgress">{heroCards.length}/2</span>
          </div>
          <div className="simpleHeroCards">
            {Array.from({ length: 2 }, (_, index) => (
              <CardFace
                key={index}
                card={heroCards[index]}
                size="large"
                label={
                  heroCards[index]
                    ? `Trocar carta ${index + 1}`
                    : `Adicionar carta ${index + 1}`
                }
                onClick={() => setCardTarget({ zone: "hero", index })}
              />
            ))}
          </div>

          <div className="simpleModeDivider" />

          <div className="simpleModeSectionHeader">
            <div>
              <span className="eyebrow">2 · Mesa</span>
              <h2>Quais cartas já apareceram?</h2>
            </div>
            <span className="simpleModeProgress">{board.length}/5</span>
          </div>
          <div className="simpleBoardCards">
            {Array.from({ length: 5 }, (_, index) => (
              <CardFace
                key={index}
                card={board[index]}
                size="medium"
                label={
                  board[index]
                    ? `Trocar carta ${index + 1} da mesa`
                    : `Adicionar carta ${index + 1} da mesa`
                }
                onClick={() => setCardTarget({ zone: "board", index })}
              />
            ))}
          </div>
          <span className="simpleBoardStage">{boardLabel} · deixe vazias as cartas que ainda não saíram</span>

          <div className="simpleModeDivider" />

          <div className="simpleModeAmount">
            <div>
              <span className="eyebrow">3 · Valor para jogar</span>
              <h2>Quanto você precisa colocar agora?</h2>
              <p>Use o valor adicional para pagar ou continuar na mão.</p>
            </div>
            <NumberField
              label="Valor para jogar"
              value={amountToPlay}
              min={0}
              onChange={setAmountToPlay}
            />
          </div>
          <div className="simpleModeNote">
            <Info size={16} />
            A estimativa considera 1 adversário, posição neutra e um pote de
            aproximadamente 4× o valor informado.
          </div>
        </section>

        <aside className="simpleModeAdvice">
          <AdviceCard
            enabled={copilotEnabled}
            analysis={analysis}
            complete={
              heroCards.length === 2 && [0, 3, 4, 5].includes(board.length)
            }
            recalculating={analysisPending}
            onEnable={onEnableCopilot}
          />
          {!analysis && (
            <div className="simpleModeHint surfaceCard">
              <Sparkles size={16} />
              <span>Preencha suas duas cartas e escolha 0, 3, 4 ou 5 cartas da mesa.</span>
            </div>
          )}
        </aside>
      </div>

      {cardTarget &&
        createPortal(
          <CardPicker
            key={`${cardTarget.zone}-${cardTarget.index}`}
            target={cardTarget}
            selectedCard={
              cardTarget.zone === "hero"
                ? heroCards[cardTarget.index]
                : board[cardTarget.index]
            }
            usedCards={usedCards}
            onSelect={setSelectedCard}
            onRemove={removeSelectedCard}
            onClose={() => setCardTarget(null)}
          />,
          document.body,
        )}
    </section>
  );
}

function TableSeat({
  name,
  stack,
  role,
  hero,
  style,
  selected,
  onClick,
}: {
  name: string;
  stack: number;
  role?: string;
  hero: boolean;
  style: CSSProperties;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`tableSeat ${hero ? "hero" : ""} ${
        selected ? "selected" : ""
      } ${role === "BTN" ? "btn" : ""}`}
      style={style}
      onClick={onClick}
      aria-label={`${name}, ${role ?? "sem posição"}, ${formatMoney(stack)}`}
    >
      <span className="seatAvatar">{hero ? "EU" : name.slice(0, 1)}</span>
      <span className="seatMeta">
        <strong>{name}</strong>
        <small>{formatMoney(stack)}</small>
      </span>
      {role && <em>{role}</em>}
    </button>
  );
}

function CardPicker({
  target,
  selectedCard,
  usedCards,
  onSelect,
  onRemove,
  onClose,
}: {
  target: Exclude<CardTarget, null>;
  selectedCard?: Card;
  usedCards: Set<string>;
  onSelect: (card: Card) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [rank, setRank] = useState<Rank | null>(selectedCard?.rank ?? null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="cardPickerSheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-picker-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheetHandle" />
        <div className="sheetHeader">
          <div>
            <span className="eyebrow">
              {target.zone === "hero" ? "Sua mão" : "Cartas comunitárias"}
            </span>
            <h2 id="card-picker-title">
              {rank ? `Escolha o naipe do ${rank}` : "Escolha o valor"}
            </h2>
          </div>
          <IconButton label="Fechar seletor" onClick={onClose}>
            <X size={21} />
          </IconButton>
        </div>

        {!rank ? (
          <div className="rankGrid">
            {RANKS.map((item) => (
              <button type="button" key={item} onClick={() => setRank(item)}>
                {item}
              </button>
            ))}
          </div>
        ) : (
          <>
            <button
              type="button"
              className="backRank"
              onClick={() => setRank(null)}
            >
              <RotateCcw size={16} /> Trocar o valor
            </button>
            <div className="suitGrid">
              {SUITS.map((suit) => {
                const card: Card = { rank, suit: suit.value };
                const unavailable =
                  usedCards.has(cardKey(card)) &&
                  (!selectedCard ||
                    cardKey(selectedCard) !== cardKey(card));
                return (
                  <button
                    type="button"
                    key={suit.value}
                    className={isRedSuit(suit.value) ? "red" : ""}
                    disabled={unavailable}
                    onClick={() => onSelect(card)}
                  >
                    <span>{suit.symbol}</span>
                    <strong>{rank}</strong>
                    <small>{unavailable ? "Já usada" : suit.label}</small>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {selectedCard && (
          <button type="button" className="removeCard" onClick={onRemove}>
            Remover esta carta
          </button>
        )}
      </section>
    </div>
  );
}

function MobileCardsDock({
  heroCards,
  board,
  onHeroCard,
  onBoardCard,
}: {
  heroCards: Card[];
  board: Card[];
  onHeroCard: (index: number) => void;
  onBoardCard: (index: number) => void;
}) {
  const preflop = board.length === 0;

  return (
    <section
      className={`mobileCardsDock ${preflop ? "preflop" : ""}`}
      aria-label="Acesso rápido às cartas"
    >
      <div className="mobileCardGroup heroQuickCards">
        <span>Sua mão</span>
        <div>
          {Array.from({ length: 2 }, (_, index) => (
            <CardFace
              key={index}
              card={heroCards[index]}
              size="small"
              label={
                heroCards[index]
                  ? `Trocar sua carta ${index + 1}`
                  : `Adicionar sua carta ${index + 1}`
              }
              onClick={() => onHeroCard(index)}
            />
          ))}
        </div>
      </div>
      {preflop ? (
        <button
          type="button"
          className="addBoardShortcut"
          onClick={() => onBoardCard(0)}
        >
          <Plus size={16} aria-hidden="true" />
          Adicionar flop
        </button>
      ) : (
        <>
          <i aria-hidden="true" />
          <div className="mobileCardGroup boardQuickCards">
            <span>Mesa</span>
            <div>
              {Array.from({ length: 5 }, (_, index) => (
                <CardFace
                  key={index}
                  card={board[index]}
                  size="small"
                  label={
                    board[index]
                      ? `Trocar carta ${index + 1} da mesa`
                      : `Adicionar carta ${index + 1} da mesa`
                  }
                  onClick={() => onBoardCard(index)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function EndSessionDialog({
  session,
  hasUnfinishedHand,
  onConfirm,
  onClose,
}: {
  session: Session;
  hasUnfinishedHand: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="modalBackdrop confirmationBackdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="endSessionDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-session-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="endSessionIcon" aria-hidden="true">
          <LogOut size={21} />
        </span>
        <span className="eyebrow">Encerrar mesa</span>
        <h2 id="end-session-title">Terminou por hoje?</h2>
        <p>
          As {session.hands.length} mãos concluídas e o histórico continuarão
          salvos neste aparelho.
        </p>
        {hasUnfinishedHand && (
          <div className="unfinishedHandWarning">
            <Info size={16} />
            A mão atual ainda não foi concluída e será descartada.
          </div>
        )}
        <div className="endSessionActions">
          <button type="button" className="secondaryButton" onClick={onClose}>
            Continuar jogando
          </button>
          <button type="button" className="dangerButton" onClick={onConfirm}>
            <LogOut size={16} />
            Encerrar mesa
          </button>
        </div>
      </section>
    </div>
  );
}

function QuickValueButtons({
  bigBlind,
  pot,
  onSelect,
}: {
  bigBlind: number;
  pot: number;
  onSelect: (value: number) => void;
}) {
  const values = [
    { label: "1 BB", value: bigBlind },
    { label: "2,5 BB", value: bigBlind * 2.5 },
    { label: "½ pote", value: pot / 2 },
    { label: "¾ pote", value: pot * 0.75 },
    { label: "Pote", value: pot },
  ];
  return (
    <div className="quickValues">
      {values.map((item) => (
        <button
          type="button"
          key={item.label}
          onClick={() => onSelect(Math.round(item.value * 100) / 100)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function LiveTable({
  data,
  updateData,
  notify,
  onSimpleMode,
}: {
  data: AppData;
  updateData: (updater: (current: AppData) => AppData) => void;
  notify: (message: string) => void;
  onSimpleMode: () => void;
}) {
  const session = data.session!;
  const roles = useMemo(() => getSeatRoles(session), [session]);
  const hero = session.players.find((player) => player.id === session.heroId)!;
  const heroPosition = roles[hero.seat] ?? "—";
  const openingCall = unopenedCallAmount(
    heroPosition,
    session.smallBlind,
    session.bigBlind,
  );
  const defaultOpponents = Math.max(
    1,
    Math.min(2, session.players.filter((player) => player.active).length - 1),
  );
  const defaultActorId =
    session.players.find(
      (player) => player.active && player.id !== session.heroId,
    )?.id ?? session.heroId;
  const [heroCards, setHeroCards] = useState<Card[]>([]);
  const [board, setBoard] = useState<Card[]>([]);
  const [pot, setPot] = useState(
    session.smallBlind + session.bigBlind,
  );
  const [toCall, setToCall] = useState(openingCall);
  const [pressure, setPressure] = useState<Pressure>("unopened");
  const [opponents, setOpponents] = useState(defaultOpponents);
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [actorId, setActorId] = useState(defaultActorId);
  const [actionAmount, setActionAmount] = useState(session.bigBlind * 2.5);
  const [result, setResult] = useState(0);
  const [heroDecision, setHeroDecision] =
    useState<HeroDecisionSnapshot | null>(null);
  const [cardTarget, setCardTarget] = useState<CardTarget>(null);
  const [showEndSession, setShowEndSession] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const handDraftKey = `mesa-certa:hand:${session.id}:${session.handNumber}`;
  const automaticEffectiveStack = Math.min(
    hero.stack,
    ...session.players
      .filter((player) => player.active && player.id !== session.heroId)
      .map((player) => player.stack),
  );
  const [effectiveStack, setEffectiveStack] = useState(
    Number.isFinite(automaticEffectiveStack)
      ? automaticEffectiveStack
      : hero.stack,
  );

  const dominantStyle = useMemo(
    () => getDominantOpponentStyle(session),
    [session],
  );

  const spot = useMemo<SpotInput | null>(() => {
    if (
      heroCards.length !== 2 ||
      ![0, 3, 4, 5].includes(board.length)
    ) {
      return null;
    }
    return {
      holeCards: heroCards,
      board,
      pot,
      callAmount: toCall,
      effectiveStack,
      opponents,
      position: enginePosition(heroPosition),
      preflopPressure: enginePressure(pressure),
      emotionalState: engineMood(data.mood),
      opponentStyle: dominantStyle,
      bigBlind: session.bigBlind,
    };
  }, [
    board,
    data.mood,
    dominantStyle,
    effectiveStack,
    heroCards,
    heroPosition,
    opponents,
    pot,
    pressure,
    session.bigBlind,
    toCall,
  ]);

  const { analysis, pending: analysisPending } = useSpotAnalysis(spot);
  const spotComplete =
    heroCards.length === 2 && [0, 3, 4, 5].includes(board.length);

  const usedCards = useMemo(
    () => new Set([...heroCards, ...board].map(cardKey)),
    [heroCards, board],
  );

  const displayPlayers = useMemo(() => {
    const active = session.players
      .filter((player) => player.active)
      .sort((a, b) => a.seat - b.seat);
    const heroIndex = active.findIndex((player) => player.id === session.heroId);
    if (heroIndex < 0) return active;
    return [...active.slice(heroIndex), ...active.slice(0, heroIndex)];
  }, [session]);

  useEffect(() => {
    setDraftRestored(false);
    try {
      const stored = window.localStorage.getItem(handDraftKey);
      if (stored) {
        const draft = JSON.parse(stored) as {
          heroCards?: Card[];
          board?: Card[];
          pot?: number;
          toCall?: number;
          pressure?: Pressure;
          opponents?: number;
          actions?: RecordedAction[];
          actorId?: string;
          actionAmount?: number;
          result?: number;
          effectiveStack?: number;
          heroDecision?: HeroDecisionSnapshot | null;
        };
        if (Array.isArray(draft.heroCards)) setHeroCards(draft.heroCards);
        if (Array.isArray(draft.board)) setBoard(draft.board);
        if (typeof draft.pot === "number") setPot(draft.pot);
        if (typeof draft.toCall === "number") setToCall(draft.toCall);
        if (draft.pressure) setPressure(draft.pressure);
        if (typeof draft.opponents === "number") setOpponents(draft.opponents);
        if (Array.isArray(draft.actions)) setActions(draft.actions);
        if (draft.actorId) setActorId(draft.actorId);
        if (typeof draft.actionAmount === "number") {
          setActionAmount(draft.actionAmount);
        }
        if (typeof draft.result === "number") setResult(draft.result);
        if (typeof draft.effectiveStack === "number") {
          setEffectiveStack(draft.effectiveStack);
        }
        if (
          draft.heroDecision === null ||
          (draft.heroDecision &&
            typeof draft.heroDecision.actualAction === "string")
        ) {
          setHeroDecision(draft.heroDecision ?? null);
        }
      } else {
        setHeroCards([]);
        setBoard([]);
        setPot(session.smallBlind + session.bigBlind);
        setToCall(openingCall);
        setPressure("unopened");
        setOpponents(defaultOpponents);
        setActions([]);
        setActorId(defaultActorId);
        setActionAmount(session.bigBlind * 2.5);
        setResult(0);
        setHeroDecision(null);
        setEffectiveStack(
          Number.isFinite(automaticEffectiveStack)
            ? automaticEffectiveStack
            : hero.stack,
        );
      }
    } catch {
      window.localStorage.removeItem(handDraftKey);
    } finally {
      setDraftRestored(true);
    }
  }, [
    automaticEffectiveStack,
    defaultActorId,
    defaultOpponents,
    handDraftKey,
    hero.stack,
    openingCall,
    session.bigBlind,
    session.smallBlind,
  ]);

  useEffect(() => {
    if (!draftRestored) return;
    window.localStorage.setItem(
      handDraftKey,
      JSON.stringify({
        heroCards,
        board,
        pot,
        toCall,
        pressure,
        opponents,
        actions,
        actorId,
        actionAmount,
        result,
        effectiveStack,
        heroDecision,
      }),
    );
  }, [
    actionAmount,
    actions,
    actorId,
    board,
    draftRestored,
    handDraftKey,
    heroCards,
    heroDecision,
    effectiveStack,
    opponents,
    pot,
    pressure,
    result,
    toCall,
  ]);

  useEffect(() => {
    if (!cardTarget && !showEndSession) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [cardTarget, showEndSession]);

  const setSelectedCard = (card: Card) => {
    if (!cardTarget) return;
    if (cardTarget.zone === "hero") {
      const next = [...heroCards];
      next[cardTarget.index] = card;
      const compactCards = next.filter(Boolean);
      setHeroCards(compactCards);
      setCardTarget(
        compactCards.length < 2
          ? { zone: "hero", index: compactCards.length }
          : null,
      );
    } else {
      const next = [...board];
      next[cardTarget.index] = card;
      const nextBoard = next.filter(Boolean);
      if (
        nextBoard.length > board.length &&
        [3, 4, 5].includes(nextBoard.length)
      ) {
        setToCall(0);
        setPressure("unopened");
      }
      setBoard(nextBoard);
      setCardTarget(
        nextBoard.length > 0 && nextBoard.length < 3
          ? { zone: "board", index: nextBoard.length }
          : null,
      );
    }
  };

  const removeSelectedCard = () => {
    if (!cardTarget) return;
    if (cardTarget.zone === "hero") {
      setHeroCards((cards) =>
        cards.filter((_, index) => index !== cardTarget.index),
      );
    } else {
      setBoard((cards) =>
        cards.filter((_, index) => index !== cardTarget.index),
      );
    }
    setCardTarget(null);
  };

  const addAction = (action: TableAction) => {
    const amount =
      action === "bet" || action === "raise" || action === "allIn"
        ? actionAmount
        : action === "call"
          ? toCall
          : undefined;
    setActions((current) => [
      ...current,
      { id: makeId("action"), playerId: actorId, action, amount },
    ]);

    if (actorId === session.heroId) {
      setHeroDecision({
        actualAction: action,
        recommendedAction: analysis?.action,
        equity: analysis?.equity,
        lesson: analysis?.teachingPoint,
      });
    }

    if (actorId !== session.heroId) {
      if (action === "raise" || action === "bet") {
        setPressure((current) =>
          current === "raise" || current === "threeBet"
            ? "threeBet"
            : "raise",
        );
        setToCall(actionAmount);
      }
      if (action === "allIn") {
        setPressure("allIn");
        setToCall(actionAmount);
      }
      if (action === "call" && pressure === "unopened") setPressure("limp");
    }
    notify(`${ACTION_LABELS[action]} registrado.`);
  };

  const undoLastAction = () => {
    const remaining = actions.slice(0, -1);
    let nextPressure: Pressure = "unopened";
    let nextCall = board.length < 3 ? openingCall : 0;
    let aggressiveActions = 0;

    for (const recorded of remaining) {
      if (recorded.playerId === session.heroId) continue;
      if (recorded.action === "call" && nextPressure === "unopened") {
        nextPressure = "limp";
      }
      if (recorded.action === "bet" || recorded.action === "raise") {
        aggressiveActions += 1;
        nextPressure = aggressiveActions > 1 ? "threeBet" : "raise";
        nextCall = recorded.amount ?? nextCall;
      }
      if (recorded.action === "allIn") {
        aggressiveActions += 1;
        nextPressure = "allIn";
        nextCall = recorded.amount ?? nextCall;
      }
    }

    setActions(remaining);
    setPressure(nextPressure);
    setToCall(nextCall);
    notify("Última ação desfeita.");
  };

  const nextHand = () => {
    const actualAction =
      heroDecision?.actualAction ??
      [...actions]
        .reverse()
        .find((action) => action.playerId === session.heroId)?.action;
    const record: HandRecord = {
      id: makeId("hand"),
      handNumber: session.handNumber,
      playedAt: new Date().toISOString(),
      position: heroPosition,
      heroCards,
      board,
      pot,
      result,
      recommendedAction:
        heroDecision?.recommendedAction ?? analysis?.action,
      actualAction,
      equity: heroDecision?.equity ?? analysis?.equity,
      lesson: heroDecision?.lesson ?? analysis?.teachingPoint,
      actions,
    };

    window.localStorage.removeItem(handDraftKey);
    setDraftRestored(false);
    updateData((current) => {
      if (!current.session) return current;
      const nextHands = [...current.session.hands, record];
      const nextPlayers = current.session.players.map((player) => {
        if (player.id === current.session?.heroId) {
          return { ...player, stack: Math.max(0, player.stack + result) };
        }
        return {
          ...player,
          style: deriveOpponentStats(nextHands, player.id).style,
        };
      });
      const withRecord = {
        ...current.session,
        players: nextPlayers,
        hands: nextHands,
      };
      return {
        ...current,
        session: rotateButton(withRecord),
        archivedHands: [record, ...current.archivedHands],
      };
    });

    setHeroCards([]);
    setBoard([]);
    setPot(session.smallBlind + session.bigBlind);
    setToCall(openingCall);
    setPressure("unopened");
    setActions([]);
    setResult(0);
    setHeroDecision(null);
    notify("Mão salva. Posições atualizadas.");
  };

  const endSession = () => {
    window.localStorage.removeItem(handDraftKey);
    setShowEndSession(false);
    setCardTarget(null);
    updateData((current) => {
      if (!current.session) return current;
      return {
        ...current,
        session: {
          ...current.session,
          active: false,
        },
      };
    });
    notify("Mesa encerrada. Seu histórico foi preservado.");
  };

  const hasUnfinishedHand =
    heroCards.length > 0 ||
    board.length > 0 ||
    actions.length > 0 ||
    result !== 0;
  const sessionLoss = Math.min(0, totalSessionResult(session));
  const stopLossReached =
    session.stopLoss > 0 && Math.abs(sessionLoss) >= session.stopLoss;

  return (
    <div className="liveLayout pageEnter">
      <MobileDecisionBar
        enabled={data.copilotEnabled}
        analysis={analysis}
        complete={spotComplete}
        recalculating={analysisPending}
        onEnable={() =>
          updateData((current) => ({
            ...current,
            copilotEnabled: true,
          }))
        }
      />
      <section className="tableColumn">
        <div className="sessionHeader">
          <div>
            <span className="eyebrow">
              {session.name} · Mão {session.handNumber}
            </span>
            <h1>
              Sua vez em <strong>{friendlyPosition(heroPosition)}</strong>
            </h1>
          </div>
          <div className="sessionHeaderActions">
            <button
              type="button"
              className="simpleModeEntry"
              onClick={onSimpleMode}
            >
              <Gauge size={16} />
              <span>Simplificado</span>
            </button>
            <button
              type="button"
              className="endSessionButton"
              onClick={() => setShowEndSession(true)}
            >
              <LogOut size={16} />
              <span>Encerrar</span>
            </button>
            <button
              type="button"
              className={`moodChip mood-${data.mood}`}
              onClick={() => {
                const next: Record<Mood, Mood> = {
                  focused: "tired",
                  tired: "tilted",
                  tilted: "focused",
                };
                updateData((current) => ({
                  ...current,
                  mood: next[current.mood],
                }));
              }}
            >
              <HeartPulse size={16} />
              {MOOD_LABELS[data.mood]}
            </button>
          </div>
        </div>

        <MobileCardsDock
          heroCards={heroCards}
          board={board}
          onHeroCard={(index) => setCardTarget({ zone: "hero", index })}
          onBoardCard={(index) => setCardTarget({ zone: "board", index })}
        />

        {stopLossReached && (
          <div className="stopLossAlert" role="alert">
            <ShieldCheck size={18} />
            <div>
              <strong>Seu limite de perda foi atingido.</strong>
              <span>Uma pausa agora protege sua banca e suas decisões.</span>
            </div>
          </div>
        )}

        <div className="pokerTableWrap">
          <div className="pokerTable">
            <div className="tableCenter">
              <span className="potLabel">Pote</span>
              <strong>{formatMoney(pot)}</strong>
              <div className="boardCards">
                {Array.from({ length: 5 }, (_, index) => (
                  <CardFace
                    key={index}
                    card={board[index]}
                    size="small"
                    label={
                      board[index]
                        ? `Trocar ${board[index].rank} de ${SUITS.find((s) => s.value === board[index].suit)?.label}`
                        : `Adicionar carta ${index + 1} da mesa`
                    }
                    onClick={() => setCardTarget({ zone: "board", index })}
                  />
                ))}
              </div>
              <small>
                {board.length < 3
                  ? "Pré-flop"
                  : board.length === 3
                    ? "Flop"
                    : board.length === 4
                      ? "Turn"
                      : "River"}
              </small>
            </div>

            {displayPlayers.map((player, index) => {
              const angle = 90 + (index * 360) / displayPlayers.length;
              const radians = (angle * Math.PI) / 180;
              const style = {
                "--seat-left": `${50 + Math.cos(radians) * 46}%`,
                "--seat-top": `${50 + Math.sin(radians) * 43}%`,
              } as CSSProperties;
              return (
                <TableSeat
                  key={player.id}
                  name={player.name}
                  stack={player.stack}
                  role={roles[player.seat]}
                  hero={player.id === session.heroId}
                  style={style}
                  selected={actorId === player.id}
                  onClick={() => setActorId(player.id)}
                />
              );
            })}
          </div>
        </div>

        <section className="heroHandPanel surfaceCard">
          <div className="panelTitle">
            <div>
              <span className="eyebrow">Sua mão</span>
              <h2>
                {analysis?.handName ??
                  (heroCards.length === 2
                    ? "Calculando força…"
                    : "Selecione duas cartas")}
              </h2>
            </div>
            <div className="heroCards">
              {Array.from({ length: 2 }, (_, index) => (
                <CardFace
                  key={index}
                  card={heroCards[index]}
                  size="large"
                  label={
                    heroCards[index]
                      ? `Trocar carta ${index + 1}`
                      : `Adicionar sua carta ${index + 1}`
                  }
                  onClick={() => setCardTarget({ zone: "hero", index })}
                />
              ))}
            </div>
          </div>

          <div className="handInputs">
            <NumberField label="Pote agora" value={pot} onChange={setPot} />
            <NumberField
              label="Quanto pagar"
              value={toCall}
              onChange={setToCall}
            />
            <NumberField
              label="Stack efetivo"
              hint="menor stack"
              value={effectiveStack}
              onChange={setEffectiveStack}
            />
          </div>
          <QuickValueButtons
            bigBlind={session.bigBlind}
            pot={pot}
            onSelect={setToCall}
          />

          <div className="pressurePicker">
            <span className="fieldLabel">Ação antes de você</span>
            <div>
              {(Object.keys(PRESSURE_LABELS) as Pressure[]).map((item) => (
                <button
                  type="button"
                  key={item}
                  className={pressure === item ? "active" : ""}
                  onClick={() => setPressure(item)}
                >
                  {PRESSURE_LABELS[item]}
                </button>
              ))}
            </div>
          </div>

          <div className="opponentsRow">
            <span>
              <Users size={16} />
              Adversários na mão
            </span>
            <div>
              <IconButton
                label="Diminuir adversários"
                onClick={() => setOpponents(Math.max(1, opponents - 1))}
              >
                <Minus size={16} />
              </IconButton>
              <strong>{opponents}</strong>
              <IconButton
                label="Aumentar adversários"
                onClick={() =>
                  setOpponents(
                    Math.min(
                      session.players.filter((player) => player.active).length -
                        1,
                      opponents + 1,
                    ),
                  )
                }
              >
                <Plus size={16} />
              </IconButton>
            </div>
          </div>
        </section>

        <section className="actionRecorder surfaceCard">
          <details>
            <summary>
              <span>
                <Activity size={18} />
                Registrar ações da mão
              </span>
              <small>{actions.length} registradas</small>
            </summary>
            <div className="actionRecorderBody">
              <div className="actionActorRow">
                <label className="selectField">
                  <span>Quem agiu?</span>
                  <select
                    value={actorId}
                    onChange={(event) => setActorId(event.target.value)}
                  >
                    {session.players
                      .filter((player) => player.active)
                      .map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.name} · {roles[player.seat]}
                        </option>
                      ))}
                  </select>
                </label>
                <NumberField
                  label="Valor"
                  value={actionAmount}
                  onChange={setActionAmount}
                />
              </div>
              <div className="actionButtons">
                {(
                  [
                    "fold",
                    "check",
                    "call",
                    "bet",
                    "raise",
                    "allIn",
                  ] as TableAction[]
                ).map((action) => (
                  <button
                    type="button"
                    key={action}
                    onClick={() => addAction(action)}
                  >
                    {ACTION_LABELS[action]}
                  </button>
                ))}
              </div>
              {!!actions.length && (
                <div className="actionTimeline">
                  {actions.map((action) => {
                    const player = session.players.find(
                      (item) => item.id === action.playerId,
                    );
                    return (
                      <span key={action.id}>
                        <strong>{player?.name}</strong>{" "}
                        {ACTION_LABELS[action.action]}
                        {action.amount ? ` ${formatMoney(action.amount)}` : ""}
                      </span>
                    );
                  })}
                  <button
                    type="button"
                    onClick={undoLastAction}
                  >
                    Desfazer última
                  </button>
                </div>
              )}
            </div>
          </details>
        </section>
      </section>

      <aside className="copilotColumn">
        <AdviceCard
          enabled={data.copilotEnabled}
          analysis={analysis}
          complete={spotComplete}
          recalculating={analysisPending}
          onEnable={() =>
            updateData((current) => ({
              ...current,
              copilotEnabled: true,
            }))
          }
        />

        <section className="handFinish surfaceCard">
          <div>
            <span className="eyebrow">Encerrar a mão</span>
            <h2>Quanto você ganhou ou perdeu?</h2>
            <p>Opcional — use valor negativo quando perder.</p>
          </div>
          <NumberField
            label="Resultado"
            value={result}
            min={-1_000_000}
            onChange={(value) =>
              setResult(Math.max(-1_000_000, Math.min(1_000_000, value)))
            }
          />
          <div className="resultQuick">
            <button
              type="button"
              onClick={() => setResult(-session.bigBlind * 10)}
            >
              −10 BB
            </button>
            <button type="button" onClick={() => setResult(0)}>
              Zerado
            </button>
            <button
              type="button"
              onClick={() => setResult(session.bigBlind * 10)}
            >
              +10 BB
            </button>
          </div>
          <button type="button" className="primaryButton" onClick={nextHand}>
            <Save size={18} />
            Salvar e ir para a próxima
          </button>
          <small className="rotationHint">
            <RotateCcw size={16} />
            BTN, Small Blind e Big Blind giram automaticamente
          </small>
        </section>
      </aside>

      {cardTarget &&
        createPortal(
          <CardPicker
            key={`${cardTarget.zone}-${cardTarget.index}`}
            target={cardTarget}
            selectedCard={
              cardTarget.zone === "hero"
                ? heroCards[cardTarget.index]
                : board[cardTarget.index]
            }
            usedCards={usedCards}
            onSelect={setSelectedCard}
            onRemove={removeSelectedCard}
            onClose={() => setCardTarget(null)}
          />,
          document.body,
        )}
      {showEndSession &&
        createPortal(
          <EndSessionDialog
            session={session}
            hasUnfinishedHand={hasUnfinishedHand}
            onConfirm={endSession}
            onClose={() => setShowEndSession(false)}
          />,
          document.body,
        )}
    </div>
  );
}

function SessionEndedView({
  session,
  updateData,
  notify,
}: {
  session: Session;
  updateData: (updater: (current: AppData) => AppData) => void;
  notify: (message: string) => void;
}) {
  const sessionResult = totalSessionResult(session);
  const actualRecommendation: Record<TableAction, string> = {
    fold: "FOLD",
    check: "CHECK",
    call: "CALL",
    bet: "RAISE",
    raise: "RAISE",
    allIn: "ALL_IN",
  };
  const mistakes = session.hands
    .filter(
      (hand) =>
        hand.actualAction &&
        hand.recommendedAction &&
        actualRecommendation[hand.actualAction] !== hand.recommendedAction,
    )
    .sort((first, second) => first.result - second.result)
    .slice(0, 3);

  return (
    <section className="sessionEndedPage pageEnter">
      <div className="sessionEndedMark">
        <Check size={24} />
      </div>
      <span className="eyebrow gold">Mesa encerrada</span>
      <h1>Sessão salva. Boa decisão parar no momento certo.</h1>
      <p>
        Você pode começar uma mesa nova ou reabrir esta sessão caso tenha
        encerrado por engano.
      </p>
      <div className="sessionEndedStats">
        <span>
          <small>Mãos concluídas</small>
          <strong>{session.hands.length}</strong>
        </span>
        <span>
          <small>Resultado</small>
          <strong className={sessionResult >= 0 ? "positive" : "negative"}>
            {sessionResult >= 0 ? "+" : ""}
            {formatMoney(sessionResult)}
          </strong>
        </span>
        <span>
          <small>Mesa</small>
          <strong>{session.name}</strong>
        </span>
      </div>
      <section className="sessionReview" aria-labelledby="session-review-title">
        <div>
          <span className="eyebrow">Revisão pós-sessão</span>
          <h2 id="session-review-title">Seus 3 maiores pontos de revisão</h2>
        </div>
        {mistakes.length ? (
          <div className="sessionReviewGrid">
            {mistakes.map((hand) => (
              <article key={hand.id}>
                <span>Mão {hand.handNumber} · {hand.position}</span>
                <strong>
                  {ACTION_LABELS[hand.actualAction!]} → {actionRecommendationLabel(hand.recommendedAction!)}
                </strong>
                <p>{hand.lesson ?? "Compare preço, posição e range antes de repetir essa linha."}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="sessionReviewEmpty">
            Nenhum desvio registrado ainda. Continue salvando suas decisões para receber uma revisão útil.
          </p>
        )}
      </section>
      <div className="sessionEndedActions">
        <button
          type="button"
          className="primaryButton"
          onClick={() => {
            updateData((current) => ({ ...current, session: null }));
            notify("Pronto para configurar uma nova mesa.");
          }}
        >
          <Plus size={18} />
          Criar nova mesa
        </button>
        <button
          type="button"
          className="secondaryButton"
          onClick={() => {
            updateData((current) => ({
              ...current,
              session: current.session
                ? { ...current.session, active: true }
                : null,
            }));
            notify("Mesa reaberta.");
          }}
        >
          <RotateCcw size={16} />
          Reabrir esta mesa
        </button>
      </div>
    </section>
  );
}

function LoadingApp() {
  return (
    <main className="boot">
      <div className="bootMark">
        <Spade size={24} />
      </div>
      <p>Mesa Certa</p>
      <span>Preparando sua mesa…</span>
    </main>
  );
}

export default function PokerApp() {
  const { data, setData, hydrated } = usePersistentData();
  const [tab, setTab] = useState<AppTab>("table");
  const [simpleMode, setSimpleMode] = useState(false);
  const [online, setOnline] = useState(true);
  const [toast, setToast] = useState("");

  const updateData = useCallback(
    (updater: (current: AppData) => AppData) => setData(updater),
    [setData],
  );

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (!hydrated) return <LoadingApp />;

  const handCount = data.archivedHands.length;

  return (
    <main className="appShell">
      <TopBar
        copilotEnabled={data.copilotEnabled}
        onCopilotChange={(copilotEnabled) => {
          updateData((current) => ({ ...current, copilotEnabled }));
          notify(copilotEnabled ? "Copilot ativado." : "Copilot pausado.");
        }}
        online={online}
      />

      <div className="appContent">
        {tab === "table" &&
          (simpleMode ? (
            <SimpleMode
              copilotEnabled={data.copilotEnabled}
              onEnableCopilot={() =>
                updateData((current) => ({ ...current, copilotEnabled: true }))
              }
              onBack={() => setSimpleMode(false)}
            />
          ) : data.session?.active ? (
            <LiveTable
              data={data}
              updateData={updateData}
              notify={notify}
              onSimpleMode={() => setSimpleMode(true)}
            />
          ) : data.session ? (
            <SessionEndedView
              session={data.session}
              updateData={updateData}
              notify={notify}
            />
          ) : (
            <SetupTable
              onSimpleMode={() => setSimpleMode(true)}
              onStart={(session) => {
                updateData((current) => ({ ...current, session }));
                setSimpleMode(false);
                notify("Mesa pronta. Você começa no Big Blind.");
              }}
            />
          ))}
        {tab === "training" && (
          <TrainingView data={data} updateData={updateData} />
        )}
        {tab === "history" && <HistoryView data={data} />}
        {tab === "profile" && (
          <ProfileView
            data={data}
            updateData={updateData}
            notify={notify}
          />
        )}
      </div>

      <BottomNav
        active={tab}
        onChange={(nextTab) => {
          setTab(nextTab);
          window.scrollTo({ top: 0, behavior: "auto" });
        }}
        handCount={handCount}
      />

      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </main>
  );
}
