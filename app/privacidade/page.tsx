import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacidade — Mesa Certa",
};

export default function PrivacyPage() {
  return (
    <main className="legalPage">
      <a className="legalBrand" href="/">
        ♠ <strong>Mesa Certa</strong>
      </a>
      <article>
        <span className="eyebrow gold">Privacidade</span>
        <h1>Seus dados pertencem a você.</h1>
        <p>
          O Mesa Certa armazena configurações da mesa, mãos, resultados,
          progresso de treino e notas de adversários para oferecer o histórico
          solicitado.
        </p>
        <h2>Armazenamento local</h2>
        <p>
          Por padrão, os dados ficam no armazenamento do seu navegador. Você
          pode apagá-los limpando os dados do site.
        </p>
        <h2>Sincronização opcional</h2>
        <p>
          Ao ativar o cofre na nuvem, os dados são associados ao hash de um
          código privado. O código bruto não é salvo no banco. Quem possuir
          esse código poderá acessar e substituir o backup; trate-o como uma
          senha. Backups sem atualização expiram automaticamente após 180
          dias.
        </p>
        <h2>Dados de outras pessoas</h2>
        <p>
          Prefira apelidos nas notas dos adversários e não registre informações
          sensíveis. Exclua observações quando elas não forem mais necessárias.
        </p>
        <h2>Exclusão</h2>
        <p>
          Os dados locais podem ser apagados pelo navegador. Na tela “Perfil”,
          o botão “Apagar backup da nuvem” exclui imediatamente a cópia
          associada ao código informado.
        </p>
        <a className="secondaryButton" href="/">
          Voltar ao aplicativo
        </a>
      </article>
    </main>
  );
}
