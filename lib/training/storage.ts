import {
  createEmptyTrainingProgress,
  normalizeTrainingProgress,
} from "./progress";
import {
  normalizeTrainingConfig,
  restoreTrainingGameState,
} from "./game-engine";
import type { SavedTrainingSession, TrainingProgress } from "./types";

export const TRAINING_STORAGE_KEY = "mesa-certa:training:v1";
export const TRAINING_PROGRESS_KEY = "mesa-certa:training-progress:v1";

function isSavedSession(value: unknown): value is SavedTrainingSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SavedTrainingSession>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.feedback) &&
    Boolean(candidate.game) &&
    candidate.game?.version === 1 &&
    Array.isArray(candidate.game.players) &&
    Array.isArray(candidate.game.deck) &&
    Array.isArray(candidate.game.board) &&
    typeof candidate.game.handNumber === "number"
  );
}

export function loadTrainingSession(): SavedTrainingSession | null {
  try {
    const stored = window.localStorage.getItem(TRAINING_STORAGE_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!isSavedSession(parsed)) {
      window.localStorage.removeItem(TRAINING_STORAGE_KEY);
      return null;
    }
    return {
      ...parsed,
      game: restoreTrainingGameState({
        ...parsed.game,
        config: normalizeTrainingConfig(parsed.game.config),
      }),
    };
  } catch {
    return null;
  }
}

export function saveTrainingSession(session: SavedTrainingSession) {
  try {
    window.localStorage.setItem(TRAINING_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // A partida continua na memória quando o armazenamento não está disponível.
  }
}

export function clearTrainingSession() {
  try {
    window.localStorage.removeItem(TRAINING_STORAGE_KEY);
  } catch {
    // Não há ação adicional necessária.
  }
}

export function loadTrainingProgress(): TrainingProgress {
  try {
    const stored = window.localStorage.getItem(TRAINING_PROGRESS_KEY);
    return stored
      ? normalizeTrainingProgress(JSON.parse(stored) as unknown)
      : createEmptyTrainingProgress();
  } catch {
    return createEmptyTrainingProgress();
  }
}

export function saveTrainingProgress(progress: TrainingProgress) {
  try {
    window.localStorage.setItem(
      TRAINING_PROGRESS_KEY,
      JSON.stringify(progress),
    );
  } catch {
    // O progresso segue disponível em memória nesta execução.
  }
}
