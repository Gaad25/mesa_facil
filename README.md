# Mesa Certa

Assistente responsivo de Texas Hold’em para partidas entre amigos. O app foi
desenhado para entrada rápida pelo celular, aprendizado durante a sessão e jogo
responsável.

## O que já está incluído

- configuração de mesa, assentos e rotação automática de botão/blinds;
- registro rápido de cartas, pote, valor para pagar e ações da mesa;
- recomendações com equidade estimada, pot odds, textura do board, ranges, SPR
  e tamanho sugerido;
- Copilot opcional, explicações simples e modo de treino;
- histórico de mãos, diário de adversários, humor, stop-loss e banca;
- rascunho da mão salvo no aparelho, instalação PWA e suporte offline;
- backup privado opcional na nuvem, com recuperação e exclusão por código.

O Mesa Certa não processa apostas, não garante ganhos e não substitui decisões
do jogador. Use apenas onde a partida for permitida e com o consentimento das
pessoas à mesa.

## Desenvolvimento

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

Validação:

```bash
npm test
npm run typecheck
npm run build
```

## Backup na nuvem

Copie `.env.example` para `.env.local` e configure um par de credenciais REST
do Vercel KV ou Upstash Redis. As instruções completas estão em
[`docs/cloud-setup.md`](docs/cloud-setup.md).

O código privado não é armazenado no servidor: a API deriva uma chave SHA-256,
limita tentativas, mantém somente a cópia mais recente e expira backups sem
atualização após 180 dias.

## Deploy

O projeto é compatível com a Vercel:

```bash
npx vercel --prod
```
