import { BookOpen, ChevronRight, History, Lightbulb } from "lucide-react";
import { actionRecommendationLabel } from "@/components/poker/advice";
import {
  CardFace,
  SUITS,
  cardKey,
} from "@/components/poker/table-controls";
import {
  formatMoney,
  type AppData,
  type TableAction,
} from "@/lib/app-state";
import type { Card } from "@/lib/poker";

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

export function HistoryView({ data }: { data: AppData }) {
  const hands = data.archivedHands;
  const total = hands.reduce((sum, hand) => sum + hand.result, 0);
  const withAdvice = hands.filter((hand) => hand.recommendedAction);
  const followed = withAdvice.filter((hand) => {
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
  }).length;
  const discipline = withAdvice.length
    ? Math.round((followed / withAdvice.length) * 100)
    : 0;

  return (
    <section className="contentPage historyPage pageEnter">
      <div className="pageHeading">
        <div>
          <span className="eyebrow gold">
            <History size={16} />
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
          <span><BookOpen size={24} /></span>
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
                      ? actionRecommendationLabel(hand.recommendedAction)
                      : "Sem análise"}
                  </small>
                </div>
                <strong
                  className={`handResult ${hand.result >= 0 ? "positive" : "negative"}`}
                >
                  {hand.result >= 0 ? "+" : ""}
                  {formatMoney(hand.result)}
                </strong>
                <ChevronRight size={18} />
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
                    {hand.equity === undefined ? "—" : `${Math.round(hand.equity)}%`}
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
