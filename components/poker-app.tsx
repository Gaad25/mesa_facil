"use client";

import {
  Activity,
  BarChart3,
  BookOpen,
  Brain,
  Check,
  ChevronRight,
  CircleDollarSign,
  Cloud,
  CloudDownload,
  CloudUpload,
  Copy,
  Eye,
  EyeOff,
  Gauge,
  HeartPulse,
  History,
  Info,
  Lightbulb,
  LockKeyhole,
  LogOut,
  Minus,
  Moon,
  Plus,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Spade,
  Target,
  Trophy,
  Trash2,
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
  ACTION_LABELS,
  APP_STORAGE_KEY,
  MOOD_LABELS,
  STYLE_LABELS,
  createPlayers,
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
import {
  analyzeSpot,
  type BettingContext,
  type Card,
  type EmotionalState,
  type OpponentStyle,
  type PokerAnalysis,
  type PreflopPressure,
  type Rank,
  type Suit,
  type TablePosition,
} from "@/lib/poker";

type AppTab = "table" | "training" | "history" | "profile";
type Pressure = "unopened" | "limp" | "raise" | "threeBet" | "allIn";
type CardTarget = { zone: "hero" | "board"; index: number } | null;
type SyncFeedback = {
  state: "idle" | "working" | "success" | "error";
  message: string;
};
type HeroDecisionSnapshot = {
  actualAction: TableAction;
  recommendedAction?: string;
  equity?: number;
  lesson?: string;
};

const RANKS: Rank[] = [
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

const SUITS: Array<{ value: Suit; symbol: string; label: string }> = [
  { value: "spades", symbol: "♠", label: "Espadas" },
  { value: "hearts", symbol: "♥", label: "Copas" },
  { value: "diamonds", symbol: "♦", label: "Ouros" },
  { value: "clubs", symbol: "♣", label: "Paus" },
];

const PRESSURE_LABELS: Record<Pressure, string> = {
  unopened: "Ninguém aumentou",
  limp: "Entraram pagando",
  raise: "Houve raise",
  threeBet: "Houve 3-bet",
  allIn: "Há um all-in",
};

const ACTION_RECOMMENDATION_LABELS: Record<string, string> = {
  FOLD: "DESISTA",
  CHECK: "DÊ CHECK",
  CALL: "PAGUE",
  RAISE: "AUMENTE",
  ALL_IN: "VÁ ALL-IN",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  alta: "Alta",
  media: "Média",
  média: "Média",
  baixa: "Baixa",
};

const TRAINING_QUESTIONS = [
  {
    eyebrow: "Posição",
    question:
      "Por que jogar no botão costuma ser melhor do que jogar nas primeiras posições?",
    options: [
      "Você age depois da maioria dos adversários",
      "O botão sempre recebe cartas melhores",
      "Você não precisa pagar apostas",
    ],
    correct: 0,
    explanation:
      "Agir por último traz mais informação antes de você tomar a decisão.",
  },
  {
    eyebrow: "Pot odds",
    question:
      "O pote tem R$ 100 e custa R$ 25 para pagar. Qual é aproximadamente sua pot odd?",
    options: ["20%", "25%", "33%"],
    correct: 0,
    explanation:
      "Você investe R$ 25 para disputar um pote final de R$ 125: 25 ÷ 125 = 20%.",
  },
  {
    eyebrow: "Draw",
    question:
      "No flop, um flush draw com 9 outs tem aproximadamente qual chance de completar até o river?",
    options: ["18%", "36%", "54%"],
    correct: 1,
    explanation:
      "A regra rápida é multiplicar os outs por 4 no flop: 9 × 4 ≈ 36%.",
  },
  {
    eyebrow: "Disciplina",
    question:
      "Você perdeu dois potes grandes e está irritado. Qual é a melhor resposta?",
    options: [
      "Aumentar a agressividade para recuperar",
      "Fazer uma pausa curta e reduzir decisões marginais",
      "Jogar todas as mãos até ganhar uma",
    ],
    correct: 1,
    explanation:
      "Tilt aumenta erros. Uma pausa protege a banca e melhora a qualidade das decisões.",
  },
];

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampNumber(value: number, min = 0, max = 1_000_000) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function cardKey(card: Card) {
  return `${card.rank}-${card.suit}`;
}

function suitSymbol(suit: Suit) {
  return SUITS.find((item) => item.value === suit)?.symbol ?? "?";
}

function isRedSuit(suit: Suit) {
  return suit === "hearts" || suit === "diamonds";
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
    <div className="brand" aria-label="Mesa Certa">
      <span className="brandMark" aria-hidden="true">
        <Spade size={19} strokeWidth={2.2} />
      </span>
      <span>
        <strong>Mesa</strong>
        <em>Certa</em>
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
        <Sparkles size={14} />
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
        <span className={`connectionDot ${online ? "online" : ""}`}>
          {online ? <Cloud size={14} /> : <CloudOffIcon />}
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
  return <Cloud size={14} aria-hidden="true" className="cloudOff" />;
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
    id: AppTab;
    label: string;
    icon: ReactNode;
    badge?: number;
  }> = [
    { id: "table", label: "Mesa", icon: <Spade size={21} /> },
    { id: "training", label: "Treino", icon: <Brain size={21} /> },
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
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          className={active === item.id ? "active" : ""}
          aria-current={active === item.id ? "page" : undefined}
          onClick={() => onChange(item.id)}
        >
          <span className="navIcon">
            {item.icon}
            {!!item.badge && <small>{Math.min(99, item.badge)}</small>}
          </span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function CardFace({
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
    <>
      <Plus size={size === "small" ? 16 : 19} />
      <small>carta</small>
    </>
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

function NumberField({
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
        <input
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={value}
          onChange={(event) =>
            onChange(clampNumber(Number(event.target.value), min))
          }
        />
      </span>
    </label>
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
}: {
  onStart: (session: Session) => void;
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
          <Sparkles size={14} />
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
                <Spade size={22} />
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
      </div>
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
      }`}
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
            <X size={20} />
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
  return (
    <section className="mobileCardsDock" aria-label="Acesso rápido às cartas">
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
          <LogOut size={22} />
        </span>
        <span className="eyebrow">Encerrar mesa</span>
        <h2 id="end-session-title">Terminou por hoje?</h2>
        <p>
          As {session.hands.length} mãos concluídas e o histórico continuarão
          salvos neste aparelho.
        </p>
        {hasUnfinishedHand && (
          <div className="unfinishedHandWarning">
            <Info size={17} />
            A mão atual ainda não foi concluída e será descartada.
          </div>
        )}
        <div className="endSessionActions">
          <button type="button" className="secondaryButton" onClick={onClose}>
            Continuar jogando
          </button>
          <button type="button" className="dangerButton" onClick={onConfirm}>
            <LogOut size={17} />
            Encerrar mesa
          </button>
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warning";
}) {
  return (
    <div className={`metric ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AdviceCard({
  enabled,
  analysis,
  complete,
  onEnable,
}: {
  enabled: boolean;
  analysis: PokerAnalysis | null;
  complete: boolean;
  onEnable: () => void;
}) {
  if (!enabled) {
    return (
      <section className="adviceCard paused">
        <div className="adviceIcon">
          <EyeOff size={22} />
        </div>
        <div>
          <span className="eyebrow">Copilot pausado</span>
          <h2>Você está jogando por conta própria.</h2>
          <p>
            A mão continua sendo registrada, mas nenhum conselho fica visível.
          </p>
        </div>
        <button type="button" className="inlineButton" onClick={onEnable}>
          <Eye size={17} /> Ativar agora
        </button>
      </section>
    );
  }

  if (!complete || !analysis) {
    return (
      <section className="adviceCard waiting">
        <div className="adviceIcon">
          <Sparkles size={22} />
        </div>
        <div>
          <span className="eyebrow">Copilot pronto</span>
          <h2>Adicione suas duas cartas.</h2>
          <p>A recomendação aparece assim que a situação estiver completa.</p>
        </div>
      </section>
    );
  }

  const action = ACTION_RECOMMENDATION_LABELS[analysis.action] ?? analysis.action;
  const amount =
    (analysis.action === "RAISE" || analysis.action === "ALL_IN") &&
    analysis.amount > 0
      ? ` PARA ${formatMoney(analysis.amount)}`
      : "";
  const equityTone =
    analysis.equity >= analysis.potOdds ? "good" : ("warning" as const);

  return (
    <section className={`adviceCard live action-${analysis.action.toLowerCase()}`}>
      <div className="adviceTop">
        <span className="eyebrow">
          <Sparkles size={13} />
          Melhor decisão agora
        </span>
        <span className="confidencePill">
          Confiança{" "}
          {CONFIDENCE_LABELS[String(analysis.confidence).toLowerCase()] ??
            analysis.confidence}
        </span>
      </div>
      <div className="adviceDecision">
        <div className="adviceIcon">
          {analysis.action === "FOLD" ? (
            <X size={23} />
          ) : analysis.action === "CHECK" ? (
            <Check size={23} />
          ) : (
            <Target size={23} />
          )}
        </div>
        <div>
          <span>Recomendação</span>
          <h2>
            {action}
            {amount}
          </h2>
        </div>
      </div>
      <p className="adviceReason">{analysis.reason}</p>
      <div className="metricGrid">
        <Metric
          label="Sua equidade"
          value={`${Math.round(analysis.equity)}%`}
          tone={equityTone}
        />
        <Metric
          label="Pot odds"
          value={`${Math.round(analysis.potOdds)}%`}
        />
        <Metric label="Outs" value={String(analysis.outs)} />
        <Metric label="SPR" value={analysis.spr.toFixed(1)} />
      </div>
      <div className="equityTrack" aria-hidden="true">
        <span style={{ width: `${Math.round(analysis.equity)}%` }} />
        <i style={{ left: `${Math.round(analysis.potOdds)}%` }} />
      </div>
      <details className="explanation">
        <summary>
          <Lightbulb size={17} />
          Entender esta decisão
          <ChevronRight size={17} />
        </summary>
        <div>
          <p>
            <strong>{analysis.handName}.</strong> {analysis.teachingPoint}
          </p>
          <div className="analysisTags">
            <span>{analysis.texture.label}</span>
            <span>{analysis.rangeLabel}</span>
          </div>
        </div>
      </details>
    </section>
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
}: {
  data: AppData;
  updateData: (updater: (current: AppData) => AppData) => void;
  notify: (message: string) => void;
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

  const analysis = useMemo(() => {
    if (
      heroCards.length !== 2 ||
      ![0, 3, 4, 5].includes(board.length)
    ) {
      return null;
    }
    const context: BettingContext = {
      holeCards: heroCards,
      board,
      pot,
      callAmount: toCall,
      effectiveStack,
      opponents,
      position: enginePosition(heroPosition),
      preflopPressure: enginePressure(pressure),
      emotionalState: engineMood(data.mood),
      opponentStyle: getDominantOpponentStyle(session),
      bigBlind: session.bigBlind,
    };
    return analyzeSpot(context);
  }, [
    board,
    data.mood,
    effectiveStack,
    heroCards,
    heroPosition,
    opponents,
    pot,
    pressure,
    session,
    toCall,
  ]);

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
    };

    window.localStorage.removeItem(handDraftKey);
    setDraftRestored(false);
    updateData((current) => {
      if (!current.session) return current;
      const nextPlayers = current.session.players.map((player) =>
        player.id === current.session?.heroId
          ? { ...player, stack: Math.max(0, player.stack + result) }
          : player,
      );
      const withRecord = {
        ...current.session,
        players: nextPlayers,
        hands: [...current.session.hands, record],
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
            <ShieldCheck size={19} />
            <div>
              <strong>Seu limite de perda foi atingido.</strong>
              <span>Uma pausa agora protege sua banca e suas decisões.</span>
            </div>
          </div>
        )}

        <div className="pokerTableWrap">
          <div className="pokerTable">
            <div className="feltTexture" />
            <div className="tableRail" />
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
              <Users size={17} />
              Adversários na mão
            </span>
            <div>
              <IconButton
                label="Diminuir adversários"
                onClick={() => setOpponents(Math.max(1, opponents - 1))}
              >
                <Minus size={17} />
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
                <Plus size={17} />
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
          complete={
            heroCards.length === 2 && [0, 3, 4, 5].includes(board.length)
          }
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
            <RotateCcw size={14} />
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

  return (
    <section className="sessionEndedPage pageEnter">
      <div className="sessionEndedMark">
        <Check size={30} />
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
          <RotateCcw size={17} />
          Reabrir esta mesa
        </button>
      </div>
    </section>
  );
}

function TrainingView({
  data,
  updateData,
}: {
  data: AppData;
  updateData: (updater: (current: AppData) => AppData) => void;
}) {
  const [questionIndex, setQuestionIndex] = useState(
    data.trainingAnswered % TRAINING_QUESTIONS.length,
  );
  const [answer, setAnswer] = useState<number | null>(null);
  const question = TRAINING_QUESTIONS[questionIndex];
  const accuracy = data.trainingAnswered
    ? Math.round((data.trainingCorrect / data.trainingAnswered) * 100)
    : 0;

  const chooseAnswer = (index: number) => {
    if (answer !== null) return;
    setAnswer(index);
    updateData((current) => ({
      ...current,
      trainingAnswered: current.trainingAnswered + 1,
      trainingCorrect:
        current.trainingCorrect + (index === question.correct ? 1 : 0),
    }));
  };

  const nextQuestion = () => {
    setQuestionIndex((current) => (current + 1) % TRAINING_QUESTIONS.length);
    setAnswer(null);
  };

  return (
    <section className="contentPage trainingPage pageEnter">
      <div className="pageHeading">
        <div>
          <span className="eyebrow gold">
            <Brain size={14} />
            Treinador pessoal
          </span>
          <h1>Pratique decisões, não decore respostas.</h1>
          <p>Exercícios curtos baseados nos conceitos que mais ganham fichas.</p>
        </div>
        <div
          className="scoreRing"
          style={{ "--score": `${accuracy}%` } as CSSProperties}
        >
          <span>
            <strong>{accuracy}%</strong>
            <small>acertos</small>
          </span>
        </div>
      </div>

      <div className="trainingGrid">
        <article className="quizCard surfaceCard">
          <div className="quizTop">
            <span className="eyebrow">{question.eyebrow}</span>
            <span>
              Questão {(questionIndex % TRAINING_QUESTIONS.length) + 1}/
              {TRAINING_QUESTIONS.length}
            </span>
          </div>
          <h2>{question.question}</h2>
          <div className="quizOptions">
            {question.options.map((option, index) => {
              const revealed = answer !== null;
              const correct = index === question.correct;
              const selected = index === answer;
              return (
                <button
                  type="button"
                  key={option}
                  className={`${selected ? "selected" : ""} ${
                    revealed && correct ? "correct" : ""
                  } ${revealed && selected && !correct ? "wrong" : ""}`}
                  onClick={() => chooseAnswer(index)}
                >
                  <span>{String.fromCharCode(65 + index)}</span>
                  {option}
                  {revealed && correct && <Check size={18} />}
                  {revealed && selected && !correct && <X size={18} />}
                </button>
              );
            })}
          </div>
          {answer !== null && (
            <div className="quizFeedback">
              <Lightbulb size={20} />
              <div>
                <strong>
                  {answer === question.correct ? "Boa decisão." : "Quase lá."}
                </strong>
                <p>{question.explanation}</p>
              </div>
            </div>
          )}
          <button
            type="button"
            className="primaryButton"
            disabled={answer === null}
            onClick={nextQuestion}
          >
            Próxima situação <ChevronRight size={18} />
          </button>
        </article>

        <aside className="lessonStack">
          <article className="lessonCard preflop">
            <span className="lessonIcon">
              <Spade size={20} />
            </span>
            <div>
              <small>Trilha 01 · 6 min</small>
              <h3>Seleção de mãos pré-flop</h3>
              <p>Saiba quando entrar, aumentar ou abandonar pela posição.</p>
            </div>
            <ChevronRight size={20} />
          </article>
          <article className="lessonCard math">
            <span className="lessonIcon">
              <Gauge size={20} />
            </span>
            <div>
              <small>Trilha 02 · 8 min</small>
              <h3>Outs, equidade e pot odds</h3>
              <p>Transforme probabilidades em decisões simples.</p>
            </div>
            <ChevronRight size={20} />
          </article>
          <article className="lessonCard mindset">
            <span className="lessonIcon">
              <HeartPulse size={20} />
            </span>
            <div>
              <small>Trilha 03 · 4 min</small>
              <h3>Disciplina contra o tilt</h3>
              <p>Reconheça quando a emoção começa a decidir por você.</p>
            </div>
            <ChevronRight size={20} />
          </article>
        </aside>
      </div>
    </section>
  );
}

function MiniCardRow({ cards }: { cards: Card[] }) {
  return (
    <div className="miniCardRow">
      {cards.map((card, index) => (
        <CardFace
          key={`${cardKey(card)}-${index}`}
          card={card}
          size="small"
          label={`${card.rank} de ${
            SUITS.find((suit) => suit.value === card.suit)?.label
          }`}
        />
      ))}
    </div>
  );
}

function HistoryView({ data }: { data: AppData }) {
  const hands = data.archivedHands;
  const total = hands.reduce((sum, hand) => sum + hand.result, 0);
  const withAdvice = hands.filter((hand) => hand.recommendedAction);
  const followed = withAdvice.filter(
    (hand) => {
      if (!hand.actualAction || !hand.recommendedAction) return false;
      const actualMap: Record<TableAction, string> = {
        fold: "FOLD",
        check: "CHECK",
        call: "CALL",
        bet: "RAISE",
        raise: "RAISE",
        allIn: "ALL_IN",
      };
      return actualMap[hand.actualAction] === hand.recommendedAction;
    },
  ).length;
  const discipline = withAdvice.length
    ? Math.round((followed / withAdvice.length) * 100)
    : 0;

  return (
    <section className="contentPage historyPage pageEnter">
      <div className="pageHeading">
        <div>
          <span className="eyebrow gold">
            <History size={14} />
            Sua evolução
          </span>
          <h1>Cada mão deixa uma lição.</h1>
          <p>Revise decisões importantes sem precisar lembrar dos detalhes.</p>
        </div>
      </div>

      <div className="summaryCards">
        <article>
          <span>Resultado registrado</span>
          <strong className={total >= 0 ? "positive" : "negative"}>
            {total >= 0 ? "+" : ""}
            {formatMoney(total)}
          </strong>
          <small>{hands.length} mãos salvas</small>
        </article>
        <article>
          <span>Disciplina</span>
          <strong>{discipline}%</strong>
          <small>decisões alinhadas ao plano</small>
        </article>
        <article>
          <span>Foco sugerido</span>
          <strong>Pré-flop</strong>
          <small>melhor oportunidade de evolução</small>
        </article>
      </div>

      {!hands.length ? (
        <div className="emptyState surfaceCard">
          <span>
            <BookOpen size={25} />
          </span>
          <h2>Seu histórico começa na próxima mão.</h2>
          <p>
            Salve o resultado ao tocar em “Próxima mão” e volte aqui para
            revisar.
          </p>
        </div>
      ) : (
        <div className="handHistoryList">
          {hands.map((hand) => (
            <details className="handHistoryCard surfaceCard" key={hand.id}>
              <summary>
                <div className="handIndex">
                  <span>#{hand.handNumber}</span>
                  <small>
                    {new Intl.DateTimeFormat("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(hand.playedAt))}
                  </small>
                </div>
                <MiniCardRow cards={hand.heroCards} />
                <div className="handSummary">
                  <strong>{hand.position}</strong>
                  <small>
                    {hand.recommendedAction
                      ? ACTION_RECOMMENDATION_LABELS[
                          hand.recommendedAction
                        ] ?? hand.recommendedAction
                      : "Sem análise"}
                  </small>
                </div>
                <strong
                  className={`handResult ${
                    hand.result >= 0 ? "positive" : "negative"
                  }`}
                >
                  {hand.result >= 0 ? "+" : ""}
                  {formatMoney(hand.result)}
                </strong>
                <ChevronRight size={19} />
              </summary>
              <div className="handDetails">
                <div>
                  <span>Mesa</span>
                  {hand.board.length ? (
                    <MiniCardRow cards={hand.board} />
                  ) : (
                    <strong>Pré-flop</strong>
                  )}
                </div>
                <div>
                  <span>Equidade estimada</span>
                  <strong>
                    {hand.equity === undefined
                      ? "—"
                      : `${Math.round(hand.equity)}%`}
                  </strong>
                </div>
                <div className="lessonNote">
                  <Lightbulb size={18} />
                  <p>{hand.lesson ?? "Revise o contexto antes da próxima sessão."}</p>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function MoodSelector({
  value,
  onChange,
}: {
  value: Mood;
  onChange: (mood: Mood) => void;
}) {
  const options: Array<{
    id: Mood;
    icon: ReactNode;
    description: string;
  }> = [
    {
      id: "focused",
      icon: <Target size={20} />,
      description: "Plano normal",
    },
    {
      id: "tired",
      icon: <Moon size={20} />,
      description: "Mais seletivo",
    },
    {
      id: "tilted",
      icon: <HeartPulse size={20} />,
      description: "Proteção máxima",
    },
  ];
  return (
    <div className="moodSelector">
      {options.map((option) => (
        <button
          type="button"
          key={option.id}
          className={value === option.id ? "active" : ""}
          onClick={() => onChange(option.id)}
        >
          {option.icon}
          <span>
            <strong>{MOOD_LABELS[option.id]}</strong>
            <small>{option.description}</small>
          </span>
          {value === option.id && <Check size={17} />}
        </button>
      ))}
    </div>
  );
}

function ProfileView({
  data,
  updateData,
  notify,
}: {
  data: AppData;
  updateData: (updater: (current: AppData) => AppData) => void;
  notify: (message: string) => void;
}) {
  const session = data.session;
  const [syncCodeDraft, setSyncCodeDraft] = useState(data.syncCode ?? "");
  const [showSyncCode, setShowSyncCode] = useState(false);
  const [confirmCloudDelete, setConfirmCloudDelete] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<SyncFeedback>({
    state: "idle",
    message: data.lastCloudSync
      ? `Última cópia em ${new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(data.lastCloudSync))}`
      : "Ainda não sincronizado",
  });

  const updatePlayer = (
    playerId: string,
    patch: { style?: PlayerStyle; notes?: string; active?: boolean },
  ) => {
    if (
      patch.active === false &&
      session &&
      session.players.filter((player) => player.active).length <= 2
    ) {
      notify("A mesa precisa manter pelo menos dois jogadores ativos.");
      return;
    }
    updateData((current) => {
      if (!current.session) return current;
      return {
        ...current,
        session: {
          ...current.session,
          players: current.session.players.map((player) =>
            player.id === playerId ? { ...player, ...patch } : player,
          ),
        },
      };
    });
  };

  const ensureSyncCode = async () => {
    const existing = syncCodeDraft.trim() || data.syncCode;
    if (existing) {
      if (existing !== data.syncCode) {
        updateData((current) => ({ ...current, syncCode: existing }));
      }
      return existing;
    }
    const { createSyncCode } = await import("@/lib/cloud-sync");
    const code = createSyncCode();
    setSyncCodeDraft(code);
    updateData((current) => ({ ...current, syncCode: code }));
    return code;
  };

  const saveCloud = async () => {
    setSyncFeedback({ state: "working", message: "Salvando cópia segura…" });
    try {
      const code = await ensureSyncCode();
      const { saveToCloud } = await import("@/lib/cloud-sync");
      const { syncCode: _secret, ...withoutSecret } = data;
      const result = await saveToCloud(code, withoutSecret);
      if (!result.ok) throw new Error(result.message);
      const now = new Date().toISOString();
      updateData((current) => ({ ...current, lastCloudSync: now }));
      setSyncFeedback({
        state: "success",
        message: "Tudo salvo na nuvem.",
      });
    } catch (error) {
      setSyncFeedback({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível sincronizar agora.",
      });
    }
  };

  const loadCloud = async () => {
    const code = syncCodeDraft.trim() || data.syncCode;
    if (!code) {
      setSyncFeedback({
        state: "error",
        message: "Informe ou gere um código de sincronização primeiro.",
      });
      return;
    }
    setSyncFeedback({ state: "working", message: "Buscando sua cópia…" });
    try {
      const { loadFromCloud } = await import("@/lib/cloud-sync");
      const result = await loadFromCloud<AppData>(code);
      if (!result.ok) throw new Error(result.message);
      const normalized = normalizeAppData(result.payload);
      if (!normalized) {
        throw new Error("O backup não contém dados válidos do Mesa Certa.");
      }
      updateData(() => ({
        ...normalized,
        syncCode: code,
        lastCloudSync: new Date().toISOString(),
      }));
      setSyncFeedback({
        state: "success",
        message: "Dados recuperados da nuvem.",
      });
    } catch (error) {
      setSyncFeedback({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível recuperar a cópia.",
      });
    }
  };

  const copySyncCode = async () => {
    const code = await ensureSyncCode();
    await navigator.clipboard.writeText(code);
    notify("Código copiado. Guarde-o em um lugar seguro.");
  };

  const deleteCloud = async () => {
    const code = syncCodeDraft.trim() || data.syncCode;
    if (!code) {
      setSyncFeedback({
        state: "error",
        message: "Informe o código do backup que você quer apagar.",
      });
      return;
    }
    if (!confirmCloudDelete) {
      setConfirmCloudDelete(true);
      setSyncFeedback({
        state: "idle",
        message: "Toque novamente em “Apagar backup” para confirmar.",
      });
      return;
    }

    setSyncFeedback({ state: "working", message: "Apagando a cópia…" });
    try {
      const { deleteFromCloud } = await import("@/lib/cloud-sync");
      const result = await deleteFromCloud(code);
      if (!result.ok) throw new Error(result.message);
      setConfirmCloudDelete(false);
      updateData((current) => ({
        ...current,
        lastCloudSync: undefined,
      }));
      setSyncFeedback({
        state: "success",
        message:
          "Backup apagado da nuvem. Os dados deste aparelho continuam aqui.",
      });
    } catch (error) {
      setSyncFeedback({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível apagar o backup.",
      });
    }
  };

  const sessionResult = session ? totalSessionResult(session) : 0;
  const bankroll = session
    ? session.initialBankroll + sessionResult
    : 0;
  const lossPercent =
    session && session.stopLoss > 0
      ? Math.min(
          100,
          Math.round(
            (Math.abs(Math.min(0, sessionResult)) / session.stopLoss) * 100,
          ),
        )
      : 0;

  return (
    <section className="contentPage profilePage pageEnter">
      <div className="pageHeading">
        <div>
          <span className="eyebrow gold">
            <Settings size={14} />
            Seu jogo, suas regras
          </span>
          <h1>Disciplina também é uma vantagem.</h1>
          <p>
            Ajuste seu estado, acompanhe a banca e aprenda como cada amigo joga.
          </p>
        </div>
      </div>

      <div className="profileGrid">
        <div className="profileMain">
          <article className="bankrollCard surfaceCard">
            <div className="cardHeading">
              <span className="sectionIcon">
                <CircleDollarSign size={20} />
              </span>
              <div>
                <span className="eyebrow">Gestão de banca</span>
                <h2>{session ? formatMoney(bankroll) : "Configure uma mesa"}</h2>
              </div>
            </div>
            {session && (
              <>
                <div className="bankrollStats">
                  <span>
                    <small>Início</small>
                    <strong>{formatMoney(session.initialBankroll)}</strong>
                  </span>
                  <span>
                    <small>Sessão</small>
                    <strong
                      className={
                        sessionResult >= 0 ? "positive" : "negative"
                      }
                    >
                      {sessionResult >= 0 ? "+" : ""}
                      {formatMoney(sessionResult)}
                    </strong>
                  </span>
                  <span>
                    <small>Stop-loss</small>
                    <strong>{formatMoney(session.stopLoss)}</strong>
                  </span>
                </div>
                <div className="lossMeter">
                  <span>
                    <i style={{ width: `${lossPercent}%` }} />
                  </span>
                  <small>{lossPercent}% do limite de perda utilizado</small>
                </div>
              </>
            )}
          </article>

          <article className="mindsetCard surfaceCard">
            <div className="cardHeading">
              <span className="sectionIcon">
                <HeartPulse size={20} />
              </span>
              <div>
                <span className="eyebrow">Controle emocional</span>
                <h2>Como você está agora?</h2>
              </div>
            </div>
            <MoodSelector
              value={data.mood}
              onChange={(mood) =>
                updateData((current) => ({ ...current, mood }))
              }
            />
            <p className="mindsetNote">
              <Info size={16} />
              O Copilot aumenta a margem de segurança quando você está cansado
              ou irritado.
            </p>
          </article>

          <article className="opponentsCard surfaceCard">
            <div className="cardHeading">
              <span className="sectionIcon">
                <Users size={20} />
              </span>
              <div>
                <span className="eyebrow">Diário dos adversários</span>
                <h2>Transforme observações em leitura.</h2>
              </div>
            </div>
            {!session ? (
              <p className="sectionHint">
                Crie uma mesa para começar a observar seus adversários.
              </p>
            ) : (
              <div className="opponentList">
                {session.players
                  .filter((player) => player.id !== session.heroId)
                  .map((player) => (
                    <details key={player.id} className="opponentRow">
                      <summary>
                        <span className="seatAvatar">
                          {player.name.slice(0, 1)}
                        </span>
                        <span>
                          <strong>{player.name}</strong>
                          <small>{STYLE_LABELS[player.style]}</small>
                        </span>
                        <em
                          className={player.active ? "active" : "inactive"}
                        >
                          {player.active ? "Na mesa" : "Pausado"}
                        </em>
                        <ChevronRight size={18} />
                      </summary>
                      <div className="opponentEditor">
                        <label className="selectField">
                          <span>Estilo observado</span>
                          <select
                            value={player.style}
                            onChange={(event) =>
                              updatePlayer(player.id, {
                                style: event.target.value as PlayerStyle,
                              })
                            }
                          >
                            {(
                              Object.keys(STYLE_LABELS) as PlayerStyle[]
                            ).map((style) => (
                              <option key={style} value={style}>
                                {STYLE_LABELS[style]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="textAreaField">
                          <span>Notas rápidas</span>
                          <textarea
                            value={player.notes}
                            placeholder="Ex.: blefa muito no river, só faz 3-bet forte…"
                            onChange={(event) =>
                              updatePlayer(player.id, {
                                notes: event.target.value.slice(0, 500),
                              })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="secondaryButton"
                          onClick={() =>
                            updatePlayer(player.id, {
                              active: !player.active,
                            })
                          }
                        >
                          {player.active
                            ? "Pausar nesta mesa"
                            : "Voltar para a mesa"}
                        </button>
                      </div>
                    </details>
                  ))}
              </div>
            )}
          </article>
        </div>

        <aside className="profileAside">
          <article className="cloudCard surfaceCard">
            <div className="cloudIllustration">
              <Cloud size={25} />
              <LockKeyhole size={15} />
            </div>
            <span className="eyebrow">Cofre na nuvem</span>
            <h2>Seu jogo em qualquer aparelho.</h2>
            <p>
              Um código privado protege suas sessões, notas e progresso. Não
              usamos nomes reais como chave.
            </p>
            <label className="syncCodeLabel">
              <span>Código privado</span>
              <span className="syncCodeField">
                <input
                  type={showSyncCode ? "text" : "password"}
                  value={syncCodeDraft}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Cole o código de outro aparelho"
                  onChange={(event) => setSyncCodeDraft(event.target.value)}
                />
                <IconButton
                  label={showSyncCode ? "Ocultar código" : "Mostrar código"}
                  onClick={() => setShowSyncCode((current) => !current)}
                >
                  {showSyncCode ? <EyeOff size={16} /> : <Eye size={16} />}
                </IconButton>
                <IconButton label="Copiar código" onClick={copySyncCode}>
                  <Copy size={16} />
                </IconButton>
              </span>
            </label>
            {!syncCodeDraft && !data.syncCode && (
              <button
                type="button"
                className="secondaryButton fullButton"
                onClick={copySyncCode}
              >
                <LockKeyhole size={17} />
                Gerar código privado
              </button>
            )}
            <div className="cloudActions">
              <button
                type="button"
                onClick={saveCloud}
                disabled={syncFeedback.state === "working"}
              >
                <CloudUpload size={17} /> Salvar
              </button>
              <button
                type="button"
                onClick={loadCloud}
                disabled={syncFeedback.state === "working"}
              >
                <CloudDownload size={17} /> Recuperar
              </button>
            </div>
            <button
              type="button"
              className={`cloudDeleteButton ${
                confirmCloudDelete ? "confirming" : ""
              }`}
              onClick={deleteCloud}
              disabled={syncFeedback.state === "working"}
            >
              <Trash2 size={14} />
              {confirmCloudDelete
                ? "Confirmar exclusão"
                : "Apagar backup da nuvem"}
            </button>
            <small className={`syncFeedback ${syncFeedback.state}`}>
              {syncFeedback.state === "working" && (
                <span className="miniSpinner" />
              )}
              {syncFeedback.message}
            </small>
            <div className="legalLinks">
              <a href="/privacidade">Privacidade</a>
              <span>·</span>
              <a href="/termos">Uso responsável</a>
            </div>
          </article>

          <article className="responsibleCard">
            <ShieldCheck size={22} />
            <span className="eyebrow">Jogo responsável</span>
            <h3>O melhor fold também protege sua banca.</h3>
            <p>
              O Mesa Certa não recebe apostas nem promete ganhos. Use limites e
              faça pausas.
            </p>
          </article>
        </aside>
      </div>
    </section>
  );
}

function LoadingApp() {
  return (
    <main className="boot">
      <div className="bootMark">
        <Spade size={25} />
      </div>
      <p>Mesa Certa</p>
      <span>Preparando sua mesa…</span>
    </main>
  );
}

export default function PokerApp() {
  const { data, setData, hydrated } = usePersistentData();
  const [tab, setTab] = useState<AppTab>("table");
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
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then((registration) => {
          const urls = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .filter((candidate) => {
              const url = new URL(candidate, window.location.origin);
              return (
                url.origin === window.location.origin &&
                url.pathname.startsWith("/_next/static/")
              );
            });
          registration.active?.postMessage({
            type: "CACHE_URLS",
            urls: [
              ...urls,
              "/icon-192.png",
              "/icon-512.png",
              "/manifest.webmanifest",
            ],
          });
        })
        .catch(() => undefined);
    }
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
          (data.session?.active ? (
            <LiveTable
              data={data}
              updateData={updateData}
              notify={notify}
            />
          ) : data.session ? (
            <SessionEndedView
              session={data.session}
              updateData={updateData}
              notify={notify}
            />
          ) : (
            <SetupTable
              onStart={(session) => {
                updateData((current) => ({ ...current, session }));
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

      <BottomNav active={tab} onChange={setTab} handCount={handCount} />

      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </main>
  );
}
