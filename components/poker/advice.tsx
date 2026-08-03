"use client";

import {
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Lightbulb,
  Scale,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { formatMoney } from "@/lib/app-state";
import type { PokerAnalysis } from "@/lib/poker";

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

type AdviceProps = {
  enabled: boolean;
  analysis: PokerAnalysis | null;
  complete: boolean;
  /** Há uma simulação em andamento; os números visíveis são do spot anterior. */
  recalculating?: boolean;
  onEnable: () => void;
};

export function actionRecommendationLabel(action: string) {
  return ACTION_RECOMMENDATION_LABELS[action] ?? action;
}

function recommendation(analysis: PokerAnalysis) {
  return actionRecommendationLabel(analysis.action);
}

function recommendationAmount(analysis: PokerAnalysis) {
  if (analysis.action === "CALL" && analysis.amount > 0) {
    return ` ${formatMoney(analysis.amount)}`;
  }
  return (analysis.action === "RAISE" || analysis.action === "ALL_IN") &&
    analysis.amount > 0
    ? ` para ${formatMoney(analysis.amount)}`
    : "";
}

function AdviceIcon({ analysis }: { analysis: PokerAnalysis }) {
  if (analysis.action === "FOLD") return <X size={24} />;
  if (analysis.action === "CHECK") return <Check size={24} />;
  return <Target size={24} />;
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

export function AdviceCard({
  enabled,
  analysis,
  complete,
  recalculating = false,
  onEnable,
}: AdviceProps) {
  if (!enabled) {
    return (
      <section className="adviceCard paused">
        <div className="adviceIcon">
          <EyeOff size={21} />
        </div>
        <div>
          <span className="eyebrow">Copilot pausado</span>
          <h2>Você está jogando por conta própria.</h2>
          <p>
            A mão continua sendo registrada, mas nenhum conselho fica visível.
          </p>
        </div>
        <button type="button" className="inlineButton" onClick={onEnable}>
          <Eye size={16} /> Ativar agora
        </button>
      </section>
    );
  }

  if (!complete || !analysis) {
    const computing = complete && recalculating;
    return (
      <section className="adviceCard waiting">
        <div className="adviceIcon">
          {computing ? <span className="miniSpinner" /> : <Sparkles size={21} />}
        </div>
        <div>
          <span className="eyebrow">
            {computing ? "Calculando" : "Copilot pronto"}
          </span>
          <h2>
            {computing ? "Analisando a situação." : "Adicione suas duas cartas."}
          </h2>
          <p>
            {computing
              ? "A simulação roda fora da interface para não travar o aplicativo."
              : "A recomendação aparece assim que a situação estiver completa."}
          </p>
        </div>
      </section>
    );
  }

  const action = recommendation(analysis);
  const amount = recommendationAmount(analysis).toUpperCase();
  const equityTone =
    analysis.equity >= analysis.potOdds ? "good" : ("warning" as const);

  return (
    <section
      className={`adviceCard live action-${analysis.action.toLowerCase()} ${
        recalculating ? "recalculating" : ""
      }`}
    >
      <div className="adviceTop">
        <span className="eyebrow">
          <Sparkles size={16} />
          Melhor decisão agora
        </span>
        {recalculating ? (
          <span className="confidencePill recalculatingPill">
            <span className="miniSpinner" />
            Recalculando
          </span>
        ) : (
          <span className="confidencePill">
            Confiança{" "}
            {CONFIDENCE_LABELS[String(analysis.confidence).toLowerCase()] ??
              analysis.confidence}
          </span>
        )}
      </div>
      <div className="adviceDecision">
        <div className="adviceIcon">
          <AdviceIcon analysis={analysis} />
        </div>
        <div>
          <span>Recomendação</span>
          <h2>
            {action}
            {amount}
          </h2>
        </div>
      </div>
      {analysis.marginal && (
        <p className="marginalBadge">
          <Scale size={14} aria-hidden="true" />
          Decisão marginal ·{" "}
          {Math.abs(analysis.margin).toLocaleString("pt-BR", {
            maximumFractionDigits: 1,
          })}{" "}
          ponto{Math.abs(analysis.margin) === 1 ? "" : "s"} de diferença
        </p>
      )}
      <p className="adviceReason">{analysis.reason}</p>
      <div className="metricGrid">
        <Metric
          label="Sua equidade"
          value={`${Math.round(analysis.equity)}%`}
          tone={equityTone}
        />
        <Metric label="Pot odds" value={`${Math.round(analysis.potOdds)}%`} />
        <Metric label="Outs" value={String(analysis.outs)} />
        <Metric label="SPR" value={analysis.spr.toFixed(1)} />
      </div>
      <div className="equityTrack" aria-hidden="true">
        <span style={{ width: `${Math.round(analysis.equity)}%` }} />
        <i style={{ left: `${Math.round(analysis.potOdds)}%` }} />
      </div>
      <p className="equityLegend">
        <span className="legendEquity">
          Sua equidade {Math.round(analysis.equity)}%
        </span>
        <span className="legendOdds">
          Pot odds {Math.round(analysis.potOdds)}%
        </span>
      </p>
      <details className="explanation">
        <summary>
          <Lightbulb size={16} />
          Entender esta decisão
          <ChevronRight size={16} />
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

/**
 * Resumo sempre visível no celular. O `details` cresce para cima por estar
 * ancorado acima da navegação inferior, sem empurrar a mesa para fora da tela.
 */
export function MobileDecisionBar({
  enabled,
  analysis,
  complete,
  recalculating = false,
  onEnable,
}: AdviceProps) {
  if (!enabled) {
    return (
      <section className="mobileDecisionBar paused" aria-label="Copilot pausado">
        <span><EyeOff size={16} aria-hidden="true" /> Copilot pausado</span>
        <button type="button" onClick={onEnable}>Ativar</button>
      </section>
    );
  }

  if (!complete || !analysis) {
    return (
      <section
        className="mobileDecisionBar waiting"
        aria-label={recalculating ? "Recalculando decisão" : "Complete sua mão"}
      >
        <span>
          {recalculating ? <span className="miniSpinner" /> : <Sparkles size={16} />}
          {recalculating ? "Analisando a situação" : "Adicione suas duas cartas"}
        </span>
      </section>
    );
  }

  const action = recommendation(analysis);
  const amount = recommendationAmount(analysis);

  return (
    <details
      className={`mobileDecisionBar live ${recalculating ? "recalculating" : ""}`}
    >
      <summary aria-label="Melhor decisão agora; abrir explicação">
        <span className="mobileDecisionLabel">Melhor agora</span>
        <strong>{action}{amount}</strong>
        <span className="mobileDecisionEquity">
          <small>Equidade</small> {Math.round(analysis.equity)}%
        </span>
        {recalculating ? (
          <span className="miniSpinner" aria-label="Recalculando" />
        ) : (
          <ChevronRight size={17} aria-hidden="true" />
        )}
      </summary>
      <div className="mobileDecisionDetails">
        <p>{analysis.reason}</p>
        <div>
          <span>Pot odds <strong>{Math.round(analysis.potOdds)}%</strong></span>
          <span>Outs <strong>{analysis.outs}</strong></span>
          <span>SPR <strong>{analysis.spr.toFixed(1)}</strong></span>
        </div>
        <small><Lightbulb size={14} aria-hidden="true" /> {analysis.teachingPoint}</small>
      </div>
    </details>
  );
}
