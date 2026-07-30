import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Uso responsável — Mesa Certa",
};

export default function TermsPage() {
  return (
    <main className="legalPage">
      <a className="legalBrand" href="/">
        ♠ <strong>Mesa Certa</strong>
      </a>
      <article>
        <span className="eyebrow gold">Uso responsável</span>
        <h1>Uma ferramenta de estudo, não uma promessa de ganho.</h1>
        <p>
          O Mesa Certa oferece estimativas matemáticas e orientação educacional.
          Poker envolve variância, informação incompleta e risco de perda.
        </p>
        <h2>O que o aplicativo não faz</h2>
        <p>
          Não recebe apostas, depósitos ou buy-ins; não distribui prêmios; não
          organiza partidas e não movimenta dinheiro.
        </p>
        <h2>Copilot</h2>
        <p>
          Use recomendações em tempo real apenas quando todos os participantes
          estiverem de acordo. Não utilize o Copilot em plataformas ou eventos
          que proíbam assistência externa.
        </p>
        <h2>Maiores de 18 anos</h2>
        <p>
          O aplicativo é destinado a adultos. Defina um limite de perda, evite
          tentar recuperar prejuízos impulsivamente e faça uma pausa quando
          estiver cansado ou irritado.
        </p>
        <a className="secondaryButton" href="/">
          Voltar ao aplicativo
        </a>
      </article>
    </main>
  );
}
