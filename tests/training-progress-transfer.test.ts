import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyTrainingProgress } from "../lib/training/progress";
import {
  parseTrainingProgressBackup,
  serializeTrainingProgress,
  trainingProgressFilename,
} from "../lib/training/progress-transfer";

test("exporta e importa progresso em formato versionado", () => {
  const progress = createEmptyTrainingProgress();
  progress.handsPlayed = 3;
  progress.decisions = 7;
  progress.good = 4;
  const serialized = serializeTrainingProgress(
    progress,
    "2026-08-02T12:00:00.000Z",
  );
  const imported = parseTrainingProgressBackup(serialized);

  assert.equal(imported?.handsPlayed, 3);
  assert.equal(imported?.decisions, 7);
  assert.equal(imported?.good, 4);
  assert.equal(
    trainingProgressFilename(new Date("2026-08-02T12:00:00.000Z")),
    "mesa-certa-progresso-2026-08-02.json",
  );
});

test("recusa JSON comum que não seja um backup de treino", () => {
  assert.equal(parseTrainingProgressBackup("{\"version\":1}"), null);
  assert.equal(parseTrainingProgressBackup("inválido"), null);
});
