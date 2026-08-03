"use client";

import {
  Check,
  ChevronRight,
  CircleDollarSign,
  Cloud,
  CloudDownload,
  CloudUpload,
  Copy,
  Eye,
  EyeOff,
  HeartPulse,
  Info,
  LockKeyhole,
  Moon,
  Settings,
  ShieldCheck,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  MOOD_LABELS,
  STYLE_LABELS,
  deriveOpponentStats,
  formatMoney,
  normalizeAppData,
  totalSessionResult,
  type AppData,
  type Mood,
} from "@/lib/app-state";
import { normalizeTrainingProgress } from "@/lib/training/progress";
import { trainingProgressForSync } from "@/lib/training/progress-transfer";
import {
  loadTrainingProgress,
  saveTrainingProgress,
} from "@/lib/training/storage";

type SyncFeedback = {
  state: "idle" | "working" | "success" | "error";
  message: string;
};

function IconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="iconButton"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
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
    { id: "focused", icon: <Target size={21} />, description: "Plano normal" },
    { id: "tired", icon: <Moon size={21} />, description: "Mais seletivo" },
    { id: "tilted", icon: <HeartPulse size={21} />, description: "Proteção máxima" },
  ];
  return (
    <div className="moodSelector">
      {options.map((option) => (
        <button
          type="button"
          key={option.id}
          className={value === option.id ? "active" : ""}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.icon}
          <span>
            <strong>{MOOD_LABELS[option.id]}</strong>
            <small>{option.description}</small>
          </span>
          {value === option.id && <Check size={16} />}
        </button>
      ))}
    </div>
  );
}

export function ProfileView({
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
    patch: { notes?: string; active?: boolean },
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
      const result = await saveToCloud(code, {
        ...withoutSecret,
        trainingProgress: trainingProgressForSync(loadTrainingProgress()),
      });
      if (!result.ok) throw new Error(result.message);
      const now = new Date().toISOString();
      updateData((current) => ({ ...current, lastCloudSync: now }));
      setSyncFeedback({
        state: "success",
        message: "Sessões e progresso do treino salvos na nuvem.",
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
      const result = await loadFromCloud<AppData & { trainingProgress?: unknown }>(code);
      if (!result.ok) throw new Error(result.message);
      const normalized = normalizeAppData(result.payload);
      if (!normalized) {
        throw new Error("O backup não contém dados válidos do Mesa Certa.");
      }
      if (result.payload.trainingProgress) {
        const remoteProgress = normalizeTrainingProgress(result.payload.trainingProgress);
        const localProgress = loadTrainingProgress();
        saveTrainingProgress({
          ...remoteProgress,
          history: localProgress.history.filter((hand) =>
            remoteProgress.recordedHandIds.includes(hand.id),
          ),
        });
      }
      updateData(() => ({
        ...normalized,
        syncCode: code,
        lastCloudSync: new Date().toISOString(),
      }));
      setSyncFeedback({
        state: "success",
        message: "Sessões e progresso do treino recuperados da nuvem.",
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
      updateData((current) => ({ ...current, lastCloudSync: undefined }));
      setSyncFeedback({
        state: "success",
        message: "Backup apagado da nuvem. Os dados deste aparelho continuam aqui.",
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
  const bankroll = session ? session.initialBankroll + sessionResult : 0;
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
            <Settings size={16} />
            Seu jogo, suas regras
          </span>
          <h1>Disciplina também é uma vantagem.</h1>
          <p>Ajuste seu estado, acompanhe a banca e aprenda como cada amigo joga.</p>
        </div>
      </div>

      <div className="profileGrid">
        <div className="profileMain">
          <article className="bankrollCard surfaceCard">
            <div className="cardHeading">
              <span className="sectionIcon"><CircleDollarSign size={21} /></span>
              <div>
                <span className="eyebrow">Gestão de banca</span>
                <h2>{session ? formatMoney(bankroll) : "Configure uma mesa"}</h2>
              </div>
            </div>
            {session && (
              <>
                <div className="bankrollStats">
                  <span><small>Início</small><strong>{formatMoney(session.initialBankroll)}</strong></span>
                  <span>
                    <small>Sessão</small>
                    <strong className={sessionResult >= 0 ? "positive" : "negative"}>
                      {sessionResult >= 0 ? "+" : ""}{formatMoney(sessionResult)}
                    </strong>
                  </span>
                  <span><small>Stop-loss</small><strong>{formatMoney(session.stopLoss)}</strong></span>
                </div>
                <div className="lossMeter">
                  <span><i style={{ width: `${lossPercent}%` }} /></span>
                  <small>{lossPercent}% do limite de perda utilizado</small>
                </div>
              </>
            )}
          </article>

          <article className="mindsetCard surfaceCard">
            <div className="cardHeading">
              <span className="sectionIcon"><HeartPulse size={21} /></span>
              <div>
                <span className="eyebrow">Controle emocional</span>
                <h2>Como você está agora?</h2>
              </div>
            </div>
            <MoodSelector
              value={data.mood}
              onChange={(mood) => updateData((current) => ({ ...current, mood }))}
            />
            <p className="mindsetNote">
              <Info size={16} />
              O Copilot aumenta a margem de segurança quando você está cansado ou irritado.
            </p>
          </article>

          <article className="opponentsCard surfaceCard">
            <div className="cardHeading">
              <span className="sectionIcon"><Users size={21} /></span>
              <div>
                <span className="eyebrow">Diário dos adversários</span>
                <h2>Transforme observações em leitura.</h2>
              </div>
            </div>
            {!session ? (
              <p className="sectionHint">Crie uma mesa para começar a observar seus adversários.</p>
            ) : (
              <div className="opponentList">
                {session.players
                  .filter((player) => player.id !== session.heroId)
                  .map((player) => {
                    const stats = deriveOpponentStats(session.hands, player.id);
                    return (
                    <details key={player.id} className="opponentRow">
                      <summary>
                        <span className="seatAvatar">{player.name.slice(0, 1)}</span>
                        <span>
                          <strong>{player.name}</strong>
                          <small>{STYLE_LABELS[stats.style]} · leitura automática</small>
                        </span>
                        <em className={player.active ? "active" : "inactive"}>
                          {player.active ? "Na mesa" : "Pausado"}
                        </em>
                        <ChevronRight size={18} />
                      </summary>
                      <div className="opponentEditor">
                        <div className="opponentAutoStats" aria-label={`Estatísticas automáticas de ${player.name}`}>
                          <span><small>Mãos observadas</small><strong>{stats.observedHands}</strong></span>
                          <span><small>Participação</small><strong>{stats.participation}%</strong></span>
                          <span><small>Agressão</small><strong>{stats.aggression}%</strong></span>
                        </div>
                        <label className="textAreaField">
                          <span>Notas rápidas</span>
                          <textarea
                            value={player.notes}
                            placeholder="Ex.: blefa muito no river, só faz 3-bet forte…"
                            onChange={(event) =>
                              updatePlayer(player.id, { notes: event.target.value.slice(0, 500) })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="secondaryButton"
                          onClick={() => updatePlayer(player.id, { active: !player.active })}
                        >
                          {player.active ? "Pausar nesta mesa" : "Voltar para a mesa"}
                        </button>
                      </div>
                    </details>
                    );
                  })}
              </div>
            )}
          </article>
        </div>

        <aside className="profileAside">
          <article className="cloudCard surfaceCard">
            <div className="cloudIllustration"><Cloud size={24} /><LockKeyhole size={16} /></div>
            <span className="eyebrow">Cofre na nuvem</span>
            <h2>Seu jogo em qualquer aparelho.</h2>
            <p>
              Um código privado protege suas sessões, notas, quiz, estatísticas e perfil de
              aprendizagem. Não usamos nomes reais como chave.
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
                <IconButton label="Copiar código" onClick={copySyncCode}><Copy size={16} /></IconButton>
              </span>
            </label>
            {!syncCodeDraft && !data.syncCode && (
              <button type="button" className="secondaryButton fullButton" onClick={copySyncCode}>
                <LockKeyhole size={16} /> Gerar código privado
              </button>
            )}
            <div className="cloudActions">
              <button type="button" onClick={saveCloud} disabled={syncFeedback.state === "working"}>
                <CloudUpload size={16} /> Salvar
              </button>
              <button type="button" onClick={loadCloud} disabled={syncFeedback.state === "working"}>
                <CloudDownload size={16} /> Recuperar
              </button>
            </div>
            <button
              type="button"
              className={`cloudDeleteButton ${confirmCloudDelete ? "confirming" : ""}`}
              onClick={deleteCloud}
              disabled={syncFeedback.state === "working"}
            >
              <Trash2 size={16} />
              {confirmCloudDelete ? "Confirmar exclusão" : "Apagar backup da nuvem"}
            </button>
            <small className={`syncFeedback ${syncFeedback.state}`} role="status">
              {syncFeedback.state === "working" && <span className="miniSpinner" />}
              {syncFeedback.message}
            </small>
            <div className="legalLinks">
              <a href="/privacidade">Privacidade</a><span>·</span><a href="/termos">Uso responsável</a>
            </div>
          </article>

          <article className="responsibleCard">
            <ShieldCheck size={21} />
            <span className="eyebrow">Jogo responsável</span>
            <h3>O melhor fold também protege sua banca.</h3>
            <p>O Mesa Certa não recebe apostas nem promete ganhos. Use limites e faça pausas.</p>
          </article>
        </aside>
      </div>
    </section>
  );
}
