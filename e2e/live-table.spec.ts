import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

function formatViolations(
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"],
) {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.flatMap((node) => node.target),
  }));
}

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(formatViolations(results.violations)).toEqual([]);
}

/**
 * Cria uma sessão e semeia um spot conhecido no rascunho da mão. Digitar as
 * cinco cartas pelo seletor levaria dezenas de cliques sem testar nada de
 * novo — o que interessa aqui é como a recomendação é calculada.
 */
async function openSeededHand(page: Page) {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: /Escolher assentos/ }).click();
  await page.getByRole("button", { name: /Começar a sessão/ }).click();
  await expect(page.getByText(/Sua vez em/)).toBeVisible();

  await page.evaluate(() => {
    const raw = window.localStorage.getItem("mesa-certa:v1");
    const data = JSON.parse(raw!) as {
      session: { id: string; handNumber: number };
    };
    const key = `mesa-certa:hand:${data.session.id}:${data.session.handNumber}`;
    window.localStorage.setItem(
      key,
      JSON.stringify({
        heroCards: [
          { rank: "9", suit: "spades" },
          { rank: "8", suit: "spades" },
        ],
        board: [
          { rank: "K", suit: "hearts" },
          { rank: "7", suit: "spades" },
          { rank: "2", suit: "diamonds" },
        ],
        pot: 100,
        toCall: 22,
        pressure: "raise",
        opponents: 2,
        actions: [],
        actionAmount: 25,
        result: 0,
        effectiveStack: 400,
      }),
    );
  });
  await page.reload();
}

const recommendation = (page: Page) =>
  page.locator(".adviceCard.live .adviceDecision h2");

test("delega a análise a um Web Worker e mostra a recomendação", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const real = window.Worker;
    const created: string[] = [];
    (window as unknown as { __workerUrls: string[] }).__workerUrls = created;
    class SpyWorker extends real {
      constructor(url: string | URL, options?: WorkerOptions) {
        created.push(String(url));
        super(url, options);
      }
    }
    window.Worker = SpyWorker as unknown as typeof Worker;
  });

  await openSeededHand(page);
  await expect(recommendation(page)).toHaveText(/\S/);

  const workerUrls = await page.evaluate(
    () => (window as unknown as { __workerUrls: string[] }).__workerUrls,
  );
  expect(workerUrls.length).toBeGreaterThan(0);

  // A conta pesada não pode estar no caminho do render.
  await expect(page.locator(".adviceCard .miniSpinner")).toBeHidden();
  await expect(page.locator(".adviceReason")).toContainText(/equidade/);
});

test("mantém a recomendação quando o navegador não tem Web Worker", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Simula CSP restritiva ou o chunk do worker ausente do cache offline.
    Reflect.deleteProperty(window, "Worker");
  });

  await openSeededHand(page);

  // Sem worker o cálculo volta ao main thread: o que não pode é a recomendação
  // ficar presa em "Analisando a situação".
  await expect(recommendation(page)).toHaveText(/\S/);
  await expect(page.getByText("Analisando a situação.")).toBeHidden();
  await expect(page.locator(".adviceReason")).toContainText(/equidade/);
});

test("não deixa números vencidos na tela enquanto recalcula", async ({
  page,
}) => {
  await openSeededHand(page);
  await expect(recommendation(page)).toHaveText(/\S/);
  const before = await page.locator(".adviceReason").textContent();

  await page.getByRole("button", { name: "Aumentar adversários" }).click();

  // Durante o recálculo o cartão se marca como desatualizado.
  await expect(page.locator(".adviceCard.recalculating")).toBeVisible();
  await expect(page.locator(".adviceCard.recalculating")).toBeHidden();

  const after = await page.locator(".adviceReason").textContent();
  expect(after).not.toEqual(before);
});

test("mantém decisão, valor e equidade fixos acima da navegação no celular", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 812 });
  await openSeededHand(page);

  const decision = page.locator(".mobileDecisionBar.live");
  const navigation = page.locator(".bottomNav");
  await expect(decision).toBeVisible();
  await expect(decision).toContainText("Melhor agora");
  await expect(decision).toContainText("Equidade");

  const decisionBox = await decision.boundingBox();
  const navigationBox = await navigation.boundingBox();
  expect(decisionBox).not.toBeNull();
  expect(navigationBox).not.toBeNull();
  expect(decisionBox!.y + decisionBox!.height).toBeLessThanOrEqual(
    navigationBox!.y + 1,
  );
  expect(decisionBox!.y).toBeGreaterThanOrEqual(0);

  await decision.locator("summary").click();
  await expect(decision.locator(".mobileDecisionDetails")).toBeVisible();
  await expect(decision).toContainText("Pot odds");
});

test("compacta cartas no pré-flop e não corta nomes ou chips", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 812 });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /Escolher assentos/ }).click();
  await page.getByRole("button", { name: /Começar a sessão/ }).click();

  const dock = page.locator(".mobileCardsDock.preflop");
  await expect(dock).toBeVisible();
  await expect(dock.getByRole("button", { name: "Adicionar flop" })).toBeVisible();
  await expect(dock.locator(".boardQuickCards")).toHaveCount(0);

  const lucas = page.getByRole("button", { name: /^Lucas,/ }).locator(".seatMeta strong");
  await expect(lucas).toHaveText("Lucas");
  expect(
    await lucas.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);

  for (const chip of await page.locator(".quickValues button, .pressurePicker button").all()) {
    expect(
      await chip.evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
  }
});

test("@a11y não apresenta violações WCAG A/AA na mesa ao vivo", async ({ page }) => {
  await openSeededHand(page);
  await expect(recommendation(page)).toHaveText(/\S/);
  await expectNoA11yViolations(page);
});

test("@a11y não apresenta violações WCAG A/AA na decisão móvel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 812 });
  await openSeededHand(page);
  await expect(page.locator(".mobileDecisionBar.live")).toBeVisible();
  await expectNoA11yViolations(page);
});

test("@a11y não apresenta violações WCAG A/AA no histórico", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Histórico" }).click();
  await expect(page.getByRole("heading", { name: "Cada mão deixa uma lição." })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("@a11y não apresenta violações WCAG A/AA no perfil", async ({ page }) => {
  await openSeededHand(page);
  await page.getByRole("button", { name: "Perfil" }).click();
  await expect(page.getByRole("heading", { name: "Disciplina também é uma vantagem." })).toBeVisible();
  await page.locator(".opponentRow summary").first().click();
  await expect(page.getByLabel(/Estatísticas automáticas/).first()).toBeVisible();
  await expectNoA11yViolations(page);
});

test("mostra range visual e alterna a posição estudada", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Aprender" }).click();
  await expect(
    page.getByRole("heading", { name: "Veja como a posição muda seu range." }),
  ).toBeVisible();
  const rangePositions = page.getByLabel("Posição do range");
  await expect(rangePositions.getByRole("button", { name: "BTN" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await rangePositions.getByRole("button", { name: "UTG" }).click();
  await expect(rangePositions.getByRole("button", { name: "UTG" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("img", { name: /para UTG/ })).toBeVisible();
});
