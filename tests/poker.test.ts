import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeBoardTexture,
  analyzeSpot,
  calculateEquity,
  calculatePotOdds,
  describeHand,
  evaluateBestHand,
  type Card,
  type Rank,
  type Suit,
} from "../lib/poker";

const card = (rank: Rank, suit: Suit): Card => ({ rank, suit });

function seededRandom(seed = 123456789): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test("avalia todas as categorias de mão", () => {
  const cases: Array<{
    expected: string;
    cards: Card[];
  }> = [
    {
      expected: "high_card",
      cards: [
        card("A", "spades"),
        card("J", "diamonds"),
        card("8", "clubs"),
        card("5", "hearts"),
        card("2", "clubs"),
      ],
    },
    {
      expected: "pair",
      cards: [
        card("A", "spades"),
        card("A", "diamonds"),
        card("8", "clubs"),
        card("5", "hearts"),
        card("2", "clubs"),
      ],
    },
    {
      expected: "two_pair",
      cards: [
        card("A", "spades"),
        card("A", "diamonds"),
        card("8", "clubs"),
        card("8", "hearts"),
        card("2", "clubs"),
      ],
    },
    {
      expected: "three_of_a_kind",
      cards: [
        card("A", "spades"),
        card("A", "diamonds"),
        card("A", "clubs"),
        card("8", "hearts"),
        card("2", "clubs"),
      ],
    },
    {
      expected: "straight",
      cards: [
        card("9", "spades"),
        card("8", "diamonds"),
        card("7", "clubs"),
        card("6", "hearts"),
        card("5", "clubs"),
      ],
    },
    {
      expected: "flush",
      cards: [
        card("A", "clubs"),
        card("J", "clubs"),
        card("8", "clubs"),
        card("5", "clubs"),
        card("2", "clubs"),
      ],
    },
    {
      expected: "full_house",
      cards: [
        card("A", "spades"),
        card("A", "diamonds"),
        card("A", "clubs"),
        card("8", "hearts"),
        card("8", "clubs"),
      ],
    },
    {
      expected: "four_of_a_kind",
      cards: [
        card("A", "spades"),
        card("A", "diamonds"),
        card("A", "clubs"),
        card("A", "hearts"),
        card("8", "clubs"),
      ],
    },
    {
      expected: "straight_flush",
      cards: [
        card("9", "hearts"),
        card("8", "hearts"),
        card("7", "hearts"),
        card("6", "hearts"),
        card("5", "hearts"),
      ],
    },
  ];

  for (const current of cases) {
    assert.equal(evaluateBestHand(current.cards).category, current.expected);
  }
});

test("escolhe a melhor combinação entre sete cartas e reconhece wheel", () => {
  const bestOfSeven = evaluateBestHand([
    card("A", "spades"),
    card("A", "diamonds"),
    card("K", "clubs"),
    card("K", "hearts"),
    card("K", "spades"),
    card("2", "clubs"),
    card("3", "diamonds"),
  ]);
  assert.equal(bestOfSeven.category, "full_house");
  assert.deepEqual(bestOfSeven.tiebreakers, [13, 14]);

  const wheel = evaluateBestHand([
    card("A", "spades"),
    card("2", "diamonds"),
    card("3", "clubs"),
    card("4", "hearts"),
    card("5", "spades"),
  ]);
  assert.equal(wheel.category, "straight");
  assert.equal(wheel.tiebreakers[0], 5);
});

test("desempata mãos por kickers e rejeita cartas repetidas", () => {
  const aceKicker = evaluateBestHand([
    card("10", "clubs"),
    card("10", "diamonds"),
    card("A", "hearts"),
    card("7", "spades"),
    card("3", "clubs"),
  ]);
  const kingKicker = evaluateBestHand([
    card("10", "hearts"),
    card("10", "spades"),
    card("K", "hearts"),
    card("7", "diamonds"),
    card("3", "diamonds"),
  ]);
  assert.ok(aceKicker.score > kingKicker.score);

  assert.throws(
    () =>
      evaluateBestHand([
        card("A", "spades"),
        card("A", "spades"),
        card("K", "clubs"),
        card("Q", "hearts"),
        card("J", "clubs"),
      ]),
    /duplicada/,
  );
});

test("calcula pot odds na escala percentual", () => {
  assert.equal(calculatePotOdds(100, 50), 33.3);
  assert.equal(calculatePotOdds(300, 100), 25);
  assert.equal(calculatePotOdds(100, 0), 0);
  assert.equal(calculatePotOdds(-10, 20), 100);
});

test("equidade respeita mãos invencíveis, empates e múltiplos oponentes", () => {
  const unbeatable = calculateEquity(
    [card("A", "hearts"), card("K", "hearts")],
    [
      card("Q", "hearts"),
      card("J", "hearts"),
      card("10", "hearts"),
      card("2", "clubs"),
      card("3", "diamonds"),
    ],
    { opponents: 3, simulations: 120, random: seededRandom(1) },
  );
  assert.equal(unbeatable, 100);

  const boardPlays = calculateEquity(
    [card("2", "clubs"), card("3", "diamonds")],
    [
      card("A", "hearts"),
      card("K", "hearts"),
      card("Q", "hearts"),
      card("J", "hearts"),
      card("10", "hearts"),
    ],
    { opponents: 1, simulations: 100, random: seededRandom(2) },
  );
  assert.equal(boardPlays, 50);
});

test("pressão e estilo estreitam aproximadamente o range adversário", () => {
  const randomRange = calculateEquity(
    [card("A", "clubs"), card("Q", "diamonds")],
    [],
    {
      opponents: 1,
      opponentStyle: "loose",
      preflopPressure: "none",
      simulations: 900,
      random: seededRandom(11),
    },
  );
  const premiumRange = calculateEquity(
    [card("A", "clubs"), card("Q", "diamonds")],
    [],
    {
      opponents: 1,
      opponentStyle: "tight",
      preflopPressure: "threeBet",
      simulations: 900,
      random: seededRandom(11),
    },
  );
  assert.ok(
    randomRange > premiumRange,
    `${randomRange}% deveria superar ${premiumRange}%`,
  );
});

test("classifica boards secos, conectados, monotone e pareados", () => {
  const dry = analyzeBoardTexture([
    card("A", "spades"),
    card("7", "diamonds"),
    card("2", "clubs"),
  ]);
  assert.equal(dry.danger, "LOW");
  assert.match(dry.label, /Seco/);

  const wet = analyzeBoardTexture(
    [
      card("9", "hearts"),
      card("10", "hearts"),
      card("J", "hearts"),
    ],
    [card("Q", "clubs"), card("2", "hearts")],
  );
  assert.equal(wet.danger, "HIGH");
  assert.equal(wet.monotone, true);
  assert.equal(wet.straightPossible, true);
  assert.equal(wet.heroFlushDraw, true);
  assert.equal(wet.heroStraightDraw, true);

  const paired = analyzeBoardTexture([
    card("K", "spades"),
    card("K", "diamonds"),
    card("4", "clubs"),
  ]);
  assert.equal(paired.paired, true);
  assert.ok(paired.features.includes("Mesa pareada"));
});

test("analyzeSpot retorna conselho completo e tamanho de ação", () => {
  const analysis = analyzeSpot({
    holeCards: [card("A", "spades"), card("A", "diamonds")],
    board: [],
    pot: 15,
    callAmount: 10,
    bigBlind: 10,
    effectiveStack: 990,
    opponents: 2,
    position: "BTN",
    opponentStyle: "balanced",
    preflopPressure: "raised",
    simulations: 220,
    random: seededRandom(4),
  });

  assert.ok(["RAISE", "ALL_IN"].includes(analysis.action));
  assert.ok(analysis.amount > 10);
  assert.ok(analysis.equity >= 0 && analysis.equity <= 100);
  assert.equal(analysis.potOdds, 40);
  assert.equal(analysis.spr, 66);
  assert.equal(analysis.handName, "Par de ases");
  assert.equal(typeof analysis.texture.label, "string");
  assert.equal(typeof analysis.rangeLabel, "string");
  assert.ok(["LOW", "MEDIUM", "HIGH"].includes(analysis.confidence));
  assert.ok(analysis.reason.length > 20);
  assert.ok(analysis.teachingPoint.length > 20);
});

test("cansaço e tilt tornam recomendações marginais mais conservadoras", () => {
  const base = {
    holeCards: [card("A", "clubs"), card("10", "diamonds")],
    board: [
      card("10", "clubs"),
      card("7", "hearts"),
      card("2", "spades"),
      card("K", "diamonds"),
    ],
    pot: 100,
    callAmount: 70,
    bigBlind: 10,
    effectiveStack: 400,
    opponents: 1,
    simulations: 400,
  } as const;

  const calm = analyzeSpot({
    ...base,
    emotionalState: "calm",
    random: seededRandom(99),
  });
  const tilted = analyzeSpot({
    ...base,
    emotionalState: "tilted",
    random: seededRandom(99),
  });

  const aggression: Record<string, number> = {
    FOLD: 0,
    CHECK: 1,
    CALL: 2,
    RAISE: 3,
    ALL_IN: 4,
  };
  assert.ok(aggression[tilted.action] <= aggression[calm.action]);
  assert.match(tilted.reason, /tilt/);
});

test("não recomenda check pré-flop quando ainda é preciso completar o big blind", () => {
  const base = {
    holeCards: [card("A", "spades"), card("K", "spades")],
    board: [],
    pot: 15,
    callAmount: 10,
    bigBlind: 10,
    effectiveStack: 500,
    opponents: 2,
    position: "BTN" as const,
    preflopPressure: "none" as const,
    simulations: 120,
    random: seededRandom(91),
  };

  const recommendation = analyzeSpot(base);
  assert.equal(recommendation.action, "RAISE");

  const weak = analyzeSpot({
    ...base,
    holeCards: [card("7", "clubs"), card("2", "diamonds")],
    position: "UTG",
    random: seededRandom(92),
  });
  assert.notEqual(weak.action, "CHECK");
});

test("a mesma situação devolve sempre a mesma recomendação", () => {
  const spot = {
    holeCards: [card("9", "spades"), card("8", "spades")],
    board: [card("K", "hearts"), card("7", "spades"), card("2", "diamonds")],
    pot: 100,
    callAmount: 22,
    bigBlind: 10,
    effectiveStack: 400,
    opponents: 2,
  };

  const first = analyzeSpot(spot);
  for (let repeat = 0; repeat < 15; repeat += 1) {
    const again = analyzeSpot(spot);
    assert.equal(again.equity, first.equity);
    assert.equal(again.action, first.action);
  }

  // A ordem em que o jogador digitou as cartas não pode mudar a estimativa.
  const swapped = analyzeSpot({
    ...spot,
    holeCards: [card("8", "spades"), card("9", "spades")],
    board: [card("2", "diamonds"), card("K", "hearts"), card("7", "spades")],
  });
  assert.equal(swapped.equity, first.equity);

  // O pote altera o preço da decisão, nunca a equidade da mão.
  const biggerPot = analyzeSpot({ ...spot, pot: 101 });
  assert.equal(biggerPot.equity, first.equity);
});

test("marca como marginal quando equidade e preço ficam dentro do erro", () => {
  const marginal = analyzeSpot({
    holeCards: [card("9", "spades"), card("8", "spades")],
    board: [card("K", "hearts"), card("7", "spades"), card("2", "diamonds")],
    pot: 100,
    callAmount: 22,
    bigBlind: 10,
    effectiveStack: 400,
    opponents: 2,
  });
  assert.equal(marginal.marginal, true);
  assert.ok(Math.abs(marginal.margin) <= 3, `margem ${marginal.margin}`);
  assert.equal(marginal.confidence, "LOW");
  assert.match(marginal.reason, /marginal/);

  const clear = analyzeSpot({
    holeCards: [card("A", "spades"), card("A", "hearts")],
    board: [card("A", "clubs"), card("7", "spades"), card("2", "diamonds")],
    pot: 100,
    callAmount: 20,
    bigBlind: 10,
    effectiveStack: 400,
    opponents: 1,
  });
  assert.equal(clear.marginal, false);
  assert.ok(clear.margin > 3, `margem ${clear.margin}`);
});

test("não aumenta por valor fino dentro da faixa marginal", () => {
  const spot = {
    holeCards: [card("A", "hearts"), card("Q", "clubs")],
    board: [card("A", "spades"), card("K", "diamonds"), card("9", "hearts")],
    bigBlind: 10,
    effectiveStack: 400,
    opponents: 3,
  };

  const thin = analyzeSpot({ ...spot, pot: 100, callAmount: 62 });
  if (thin.marginal) {
    assert.ok(
      thin.action !== "RAISE" && thin.action !== "ALL_IN",
      `esperava linha passiva num spot marginal, veio ${thin.action}`,
    );
  }
});

test("descreve a combinação que venceu o showdown", () => {
  const cases: Array<[Card[], string]> = [
    [
      [
        card("A", "spades"), card("K", "spades"), card("9", "spades"),
        card("5", "spades"), card("2", "spades"),
      ],
      "Flush de espadas, ás alto",
    ],
    [
      [
        card("K", "hearts"), card("K", "diamonds"), card("7", "spades"),
        card("7", "clubs"), card("A", "spades"),
      ],
      "Dois pares: reis e 7",
    ],
    [
      [
        card("Q", "hearts"), card("J", "diamonds"), card("10", "spades"),
        card("9", "clubs"), card("8", "spades"),
      ],
      "Sequência até a dama",
    ],
    [
      [
        card("A", "hearts"), card("J", "diamonds"), card("8", "spades"),
        card("5", "clubs"), card("2", "spades"),
      ],
      "Carta alta ás",
    ],
    [
      [
        card("A", "hearts"), card("A", "diamonds"), card("A", "spades"),
        card("K", "clubs"), card("K", "spades"),
      ],
      "Full house de ases com reis",
    ],
    [
      [
        card("5", "hearts"), card("4", "hearts"), card("3", "hearts"),
        card("2", "hearts"), card("A", "hearts"),
      ],
      "Straight flush de copas até o 5",
    ],
    [
      [
        card("A", "clubs"), card("K", "clubs"), card("Q", "clubs"),
        card("J", "clubs"), card("10", "clubs"),
      ],
      "Royal flush de paus",
    ],
  ];

  for (const [cards, expected] of cases) {
    assert.equal(describeHand(evaluateBestHand(cards)), expected);
  }
});

test("não rotula raise nem check como decisão marginal", () => {
  // Pré-flop caro com mão de abertura: a linha vem da força da mão, não do
  // preço, mesmo quando equidade e pot odds quase empatam.
  const opening = analyzeSpot({
    holeCards: [card("A", "spades"), card("K", "diamonds")],
    board: [],
    pot: 15,
    callAmount: 14,
    bigBlind: 10,
    effectiveStack: 500,
    opponents: 2,
    position: "BTN",
  });
  assert.equal(opening.action, "RAISE");
  assert.equal(opening.marginal, false);

  // Sem aposta para pagar não existe preço a comparar.
  const free = analyzeSpot({
    holeCards: [card("9", "spades"), card("8", "spades")],
    board: [card("K", "hearts"), card("7", "spades"), card("2", "diamonds")],
    pot: 100,
    callAmount: 0,
    bigBlind: 10,
    effectiveStack: 400,
    opponents: 2,
  });
  assert.equal(free.marginal, false);
  assert.equal(free.margin, free.equity);
});

test("mais simulações estreitam a faixa de decisão marginal", () => {
  const ranks: Rank[] = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
  const suits: Suit[] = ["clubs", "diamonds", "hearts", "spades"];
  const deck: Card[] = suits.flatMap((suit) =>
    ranks.map((rank) => card(rank, suit)),
  );

  function marginalRate(simulations: number) {
    let marginal = 0;
    const total = 150;
    for (let index = 1; index <= total; index += 1) {
      const random = seededRandom(index * 7919);
      const pool = [...deck];
      const take = () => pool.splice(Math.floor(random() * pool.length), 1)[0];
      const holeCards = [take(), take()];
      const board = [take(), take(), take()];
      const pot = 60 + Math.floor(random() * 120);
      const analysis = analyzeSpot({
        holeCards,
        board,
        pot,
        callAmount: Math.max(1, Math.floor(pot * (0.2 + random() * 0.6))),
        bigBlind: 10,
        effectiveStack: 400,
        opponents: 2,
        simulations,
      });
      if (analysis.marginal) marginal += 1;
    }
    return marginal / total;
  }

  // A faixa vale 1,96 × √(0,25/n): quanto mais simulações, menos spots ficam
  // dentro do erro da estimativa e menos decisões precisam do aviso.
  const coarse = marginalRate(260);
  const fine = marginalRate(2500);
  assert.ok(
    fine < coarse,
    `com 2500 simulações a taxa marginal (${fine}) deveria cair abaixo da de 260 (${coarse})`,
  );
});
