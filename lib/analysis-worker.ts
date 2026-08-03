/// <reference lib="webworker" />

/**
 * Roda a análise de Monte Carlo fora do main thread. Cada mensagem carrega um
 * id para que uma resposta atrasada de um spot antigo possa ser descartada em
 * vez de sobrescrever a recomendação atual na tela.
 */
import { analyzeSpot } from "./poker";
import type { SpotRequest, SpotResponse } from "./analysis-protocol";

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.addEventListener("message", (event: MessageEvent<SpotRequest>) => {
  const { id, context } = event.data;
  try {
    worker.postMessage({ id, analysis: analyzeSpot(context) } satisfies SpotResponse);
  } catch (error) {
    worker.postMessage({
      id,
      error: error instanceof Error ? error.message : "Falha ao analisar a mão.",
    } satisfies SpotResponse);
  }
});
