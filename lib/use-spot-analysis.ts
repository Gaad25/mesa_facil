"use client";

import { useEffect, useRef, useState } from "react";

import {
  WORKER_SIMULATIONS,
  type SpotInput,
  type SpotRequest,
  type SpotResponse,
} from "./analysis-protocol";
import { analyzeSpot, type PokerAnalysis } from "./poker";

/**
 * Espera o jogador parar de mexer antes de gastar uma análise. Sem isso, cada
 * dígito do pote enfileira uma simulação inteira no worker.
 */
const DEBOUNCE_MS = 220;

export interface SpotAnalysisState {
  analysis: PokerAnalysis | null;
  /**
   * Existe um cálculo em andamento — os números na tela ainda descrevem o spot
   * anterior. A interface precisa dizer isso em vez de apresentá-los como
   * atuais.
   */
  pending: boolean;
}

/**
 * Calcula a recomendação fora do main thread. A análise leva de dezenas a
 * centenas de milissegundos: rodando durante o render, ela trava a digitação
 * no celular.
 */
export function useSpotAnalysis(input: SpotInput | null): SpotAnalysisState {
  const [analysis, setAnalysis] = useState<PokerAnalysis | null>(null);
  const [pending, setPending] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const latestInputRef = useRef<SpotInput | null>(null);
  const lastRequestRef = useRef(0);

  useEffect(() => {
    if (typeof Worker === "undefined") return;

    let worker: Worker;
    try {
      worker = new Worker(new URL("./analysis-worker.ts", import.meta.url));
    } catch {
      return; // O cálculo síncrono assume quando o worker não pode ser criado.
    }

    const resolveLocally = () => {
      const spot = latestInputRef.current;
      try {
        setAnalysis(spot ? analyzeSpot(spot) : null);
      } catch {
        setAnalysis(null);
      }
      setPending(false);
    };

    worker.onmessage = (event: MessageEvent<SpotResponse>) => {
      // Resposta de um spot já substituído não pode sobrescrever o atual.
      if (event.data.id !== lastRequestRef.current) return;
      setAnalysis(event.data.analysis ?? null);
      setPending(false);
    };

    worker.onerror = () => {
      // Um worker que não carrega (offline sem cache, CSP) não pode deixar a
      // recomendação presa em "calculando": o main thread assume a conta.
      worker.terminate();
      workerRef.current = null;
      resolveLocally();
    };

    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Resume todo o conteúdo do spot: evita reenviar quando só a identidade do
  // objeto mudou de um render para o outro.
  const key = input ? JSON.stringify(input) : null;

  useEffect(() => {
    latestInputRef.current = input;

    if (!key || !input) {
      setAnalysis(null);
      setPending(false);
      return;
    }

    setPending(true);
    const timer = window.setTimeout(() => {
      const id = lastRequestRef.current + 1;
      lastRequestRef.current = id;
      const worker = workerRef.current;

      if (worker) {
        worker.postMessage({
          id,
          context: {
            ...input,
            simulations: input.simulations ?? WORKER_SIMULATIONS,
          },
        } satisfies SpotRequest);
        return;
      }

      // Sem worker o cálculo volta ao main thread, com o custo padrão do motor
      // em vez das 2500 simulações — travar a digitação seria pior que perder
      // precisão.
      try {
        setAnalysis(analyzeSpot(input));
      } catch {
        setAnalysis(null);
      }
      setPending(false);
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
    // `key` já cobre todo o conteúdo de `input`.
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { analysis, pending };
}
