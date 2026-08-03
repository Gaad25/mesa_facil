# Estratégia dos bots de treino

## O que foi aproveitado do Poker-AI

O projeto [Gongsta/Poker-AI](https://github.com/Gongsta/Poker-AI) usa CFR
(Counterfactual Regret Minimization) em uma abstração heads-up de Texas Hold'em.
Ele serviu como referência conceitual para três decisões do Mesa Certa:

- amostrar estratégias mistas, evitando uma política totalmente determinística;
- reduzir o espaço de apostas no-limit a poucos tamanhos baseados no pote;
- decidir a partir de informações disponíveis ao jogador, sem consultar cartas
  privadas dos adversários.

O repositório possui [licença MIT](https://github.com/Gongsta/Poker-AI/blob/main/LICENSE),
mas seus modelos são arquivos Python/joblib treinados para heads-up e o próprio
README descreve partes do CFR pós-flop como trabalho em andamento. Nenhum modelo
ou trecho Python foi incorporado ao bundle web.

## Implementação local

Os bots calculam uma política mista a partir de:

- equidade Monte Carlo e pot odds;
- frequência mínima de defesa (MDF);
- posição, SPR e pressão pré-flop;
- raises abstraídos em aproximadamente 33%, 66% ou 100% do pote;
- frequências de valor, blefe, call, check e fold;
- tendências agregadas do jogador: VPIP aproximado, agressão, calls e folds
  enfrentando apostas.

No modo **GTO aproximado**, essas frequências permanecem balanceadas. No modo
**adaptativo**, os bots fazem pequenos ajustes exploratórios: blefam mais contra
folds excessivos, apostam valor mais fino contra calls frequentes e armam mais
traps contra agressão elevada.

Essa política é adequada ao objetivo didático e funciona totalmente offline,
mas não é um equilíbrio de Nash calculado por um solver. Uma evolução futura
poderá importar um blueprint CFR próprio, versionado e validado para os formatos
multiplayer suportados pelo app.

## Precisão e incerteza da estimativa

A equidade vem de amostragem Monte Carlo, então ela carrega erro. A semente é
derivada do próprio spot — cartas, adversários, perfis e pressão — de modo que
a mesma situação devolve sempre o mesmo número: sem isso, cada novo render
sorteava outros valores e a recomendação podia virar sozinha na tela.

O erro restante é tratado explicitamente. A faixa marginal vale
1,96 × √(0,25/n) pontos percentuais, a meia-largura do intervalo de 95%:

| simulações | faixa marginal | onde é usado |
| --- | --- | --- |
| 260 | ±6,1 pontos | professor do treino |
| 850 | ±3,4 pontos | queda para o main thread |
| 2500 | ±2,0 pontos | mesa ao vivo, em Web Worker |

Quando a diferença entre equidade e preço cabe nessa faixa, a decisão é
apresentada como marginal em vez de aparentar uma certeza que os números não
sustentam, e um raise de valor fino deixa de ser recomendado — aumentar o pote
ali seria apostar numa vantagem que a estimativa não consegue confirmar.

## Portabilidade do progresso

O arquivo JSON exportado contém o progresso e os replays locais. Para respeitar
o limite do cofre na nuvem, a sincronização envia estatísticas, evolução por
street, mãos recentes e o perfil adaptativo; replays completos permanecem no
aparelho ou no arquivo exportado. Ao recuperar uma cópia no mesmo aparelho, os
replays locais correspondentes são preservados.
