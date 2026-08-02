import { normalizeTrainingProgress } from "./progress";
import type { TrainingProgress } from "./types";

export interface TrainingProgressBackup {
  kind: "mesa-certa-training-progress";
  version: 1;
  exportedAt: string;
  progress: TrainingProgress;
}

export function serializeTrainingProgress(
  progress: TrainingProgress,
  exportedAt = new Date().toISOString(),
) {
  const backup: TrainingProgressBackup = {
    kind: "mesa-certa-training-progress",
    version: 1,
    exportedAt,
    progress: normalizeTrainingProgress(progress),
  };
  return JSON.stringify(backup, null, 2);
}

export function parseTrainingProgressBackup(
  value: string | unknown,
): TrainingProgress | null {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const backup = parsed as Partial<TrainingProgressBackup>;
  if (
    backup.kind !== "mesa-certa-training-progress" ||
    backup.version !== 1 ||
    !backup.progress ||
    typeof backup.progress !== "object"
  ) {
    return null;
  }
  return normalizeTrainingProgress(backup.progress);
}

export function trainingProgressFilename(date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  return `mesa-certa-progresso-${day}.json`;
}

/** Mantém estatísticas e perfil adaptativo sem enviar replays volumosos. */
export function trainingProgressForSync(progress: TrainingProgress) {
  return {
    ...normalizeTrainingProgress(progress),
    history: [],
  } satisfies TrainingProgress;
}
