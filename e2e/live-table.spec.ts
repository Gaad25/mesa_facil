import { expect, test, type Page } from "@playwright/test";

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
