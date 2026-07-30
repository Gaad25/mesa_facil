export default function OfflinePage() {
  return (
    <main className="legalPage">
      <a className="legalBrand" href="/">
        ♠ <strong>Mesa Certa</strong>
      </a>
      <article>
        <span className="eyebrow gold">Sem conexão</span>
        <h1>A mesa continua com você.</h1>
        <p>
          Volte à tela principal. Suas configurações, cartas e mãos recentes
          ficam salvas neste aparelho. Quando a internet retornar, você poderá
          tocar em “Salvar na nuvem” para atualizar sua cópia.
        </p>
        <a className="primaryButton" href="/">
          Voltar para a mesa
        </a>
      </article>
    </main>
  );
}
