import type { BettingContext, PokerAnalysis } from "./poker";

/**
 * O contexto atravessa o structured clone até o worker, então não pode
 * carregar funções — `random` fica de fora e o motor deriva a semente do
 * próprio spot.
 */
export type SpotInput = Omit<BettingContext, "random">;

export interface SpotRequest {
  id: number;
  context: SpotInput;
}

export interface SpotResponse {
  id: number;
  analysis?: PokerAnalysis;
  error?: string;
}

/**
 * Fora do main thread o custo deixa de travar a digitação, então vale pagar o
 * máximo de simulações: o erro da estimativa cai de ~1,7 para ~1,0 ponto e a
 * faixa marginal encolhe junto.
 */
export const WORKER_SIMULATIONS = 2500;
