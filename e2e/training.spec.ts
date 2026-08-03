import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function resetTraining(page: Page) {
  await page.goto("/treino");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Aprenda jogando uma mão de cada vez." }),
  ).toBeVisible();
}

async function startHeadsUpTraining(page: Page) {
  await page.getByRole("button", { name: "1 adversário", exact: true }).click();
  await page.getByRole("button", { name: /Sentar à mesa/ }).click();
  await expect(page.getByText("Sua decisão", { exact: true })).toBeVisible();
}

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

test("oferece acesso direto ao jogo no menu principal", async ({ page }) => {
  await page.goto("/");

  const playLink = page.getByRole("link", { name: /Jogar poker/ });
  await expect(playLink).toBeVisible();
  await expect(playLink).toHaveAttribute("href", "/treino");
  await playLink.click();

  await expect(page).toHaveURL(/\/treino$/);
  await expect(
    page.getByRole("heading", { name: "Aprenda jogando uma mão de cada vez." }),
  ).toBeVisible();
});

test("explora ranges pré-flop por posição e nível", async ({ page }) => {
  await resetTraining(page);
  await page.getByRole("button", { name: /Ver ranges/ }).click();

  const dialog = page.getByRole("dialog", { name: "Escolha melhor antes do flop." });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("group", { name: /Range de BTN/ }).getByRole("button")).toHaveCount(169);

  await dialog.getByRole("button", { name: "UTG", exact: true }).click();
  await dialog.getByRole("button", { name: "Completo", exact: true }).click();
  await dialog.getByRole("button", { name: "A9s: Estratégia mista" }).click();
  await expect(dialog.getByText("A9s em UTG")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(formatViolations(results.violations)).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  const matrixBox = await dialog.getByRole("group", { name: /Range de UTG/ }).boundingBox();
  expect(matrixBox).not.toBeNull();
  expect(matrixBox!.x).toBeGreaterThanOrEqual(0);
  expect(matrixBox!.x + matrixBox!.width).toBeLessThanOrEqual(390);

  await dialog.getByRole("button", { name: "Fechar mapa de mãos" }).click();
  await expect(dialog).toBeHidden();
});

test("permite apagar e redigitar campos numéricos pelo teclado", async ({ page }) => {
  await page.goto("/");

  const smallBlind = page.getByRole("spinbutton", { name: /Small blind/ });
  await smallBlind.focus();
  await smallBlind.press("ControlOrMeta+A");
  await smallBlind.press("Backspace");
  await expect(smallBlind).toHaveValue("");

  await smallBlind.press("Tab");
  await expect(smallBlind).toHaveValue("5");

  await smallBlind.focus();
  await smallBlind.press("ControlOrMeta+A");
  await smallBlind.press("Backspace");
  await smallBlind.pressSequentially("25");
  await expect(smallBlind).toHaveValue("25");
  await smallBlind.press("Enter");
  await expect(smallBlind).toHaveValue("25");

  await page.goto("/treino");
  const startingStack = page.getByRole("spinbutton", { name: "Stack inicial" });
  await startingStack.focus();
  await startingStack.press("ControlOrMeta+A");
  await startingStack.press("Backspace");
  await expect(startingStack).toHaveValue("");
  await startingStack.pressSequentially("2500");
  await startingStack.press("Tab");
  await expect(startingStack).toHaveValue("2500");
});

test("inicia, conclui, revisa e restaura uma sessão de treino", async ({ page }) => {
  await resetTraining(page);
  await page.getByRole("button", { name: /Ver dashboard/ }).click();
  await expect(
    page.getByRole("heading", { name: "Seu dashboard de evolução" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar dashboard" }).click();
  await startHeadsUpTraining(page);

  await page.getByRole("button", { name: "Fold", exact: true }).click();
  const reveal = page.getByRole("status").filter({ hasText: "Revelação didática" });
  await expect(reveal).toBeVisible();
  await expect(reveal).toContainText(/venceu|levou o pote/);

  const opponentCards = page.getByLabel(/^Lia,/).getByRole("img", { name: / de / });
  await expect(opponentCards).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    const card = opponentCards.nth(index);
    const cardBox = await card.boundingBox();
    const rankBox = await card.locator(":scope > strong").boundingBox();
    const suitBox = await card.locator(":scope > span").boundingBox();
    expect(cardBox).not.toBeNull();
    expect(rankBox).not.toBeNull();
    expect(suitBox).not.toBeNull();
    for (const contentBox of [rankBox!, suitBox!]) {
      expect(contentBox.x).toBeGreaterThanOrEqual(cardBox!.x - 1);
      expect(contentBox.y).toBeGreaterThanOrEqual(cardBox!.y - 1);
      expect(contentBox.x + contentBox.width).toBeLessThanOrEqual(
        cardBox!.x + cardBox!.width + 1,
      );
      expect(contentBox.y + contentBox.height).toBeLessThanOrEqual(
        cardBox!.y + cardBox!.height + 1,
      );
    }
  }
  const revealAnimation = await opponentCards.first().evaluate(
    (element) => getComputedStyle(element).animationName,
  );
  expect(revealAnimation).not.toBe("none");
  await page.waitForTimeout(900);
  const revealA11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(formatViolations(revealA11y.violations)).toEqual([]);

  await page.getByRole("button", { name: /Entendi, ver resumo/ }).click();
  const summary = page.getByRole("dialog");
  await expect(summary).toBeVisible();
  await expect(summary.getByText(/Mão 1 concluída|Sessão concluída/)).toBeVisible();

  await summary.getByRole("button", { name: /Rever mão/ }).click();
  await expect(
    page.getByRole("heading", { name: "Reveja cada decisão da mão" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar histórico" }).click();

  await page.reload();
  await expect(
    page.getByRole("status").filter({ hasText: "Revelação didática" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Entendi, ver resumo/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText(/Mesa de treino · (bots adaptativos|GTO aproximado)/)).toBeVisible();
});

test("mantém a mesa disponível depois de recarregar sem conexão", async ({
  context,
  page,
}) => {
  await resetTraining(page);
  await startHeadsUpTraining(page);

  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({
      type: "CACHE_URLS",
      urls: [window.location.pathname],
    });
    await new Promise<void>((resolve) => {
      if (navigator.serviceWorker.controller) {
        resolve();
        return;
      }
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
        once: true,
      });
    });
  });

  await page.waitForTimeout(500);
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Mesa de treino · (bots adaptativos|GTO aproximado)/)).toBeVisible();
    await expect(page.getByText("Sua decisão", { exact: true })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("configura torneio com ante e exporta o progresso local", async ({ page }) => {
  await resetTraining(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exportar progresso/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^mesa-certa-progresso-\d{4}-\d{2}-\d{2}\.json$/);

  await page.getByRole("button", { name: /Torneio regular/ }).click();
  await expect(page.getByLabel("Stack inicial")).toHaveValue("3000");
  await expect(page.getByLabel("Ante por jogador")).toHaveValue("2");
  await page.getByRole("button", { name: "1 adversário", exact: true }).click();
  await page.getByRole("button", { name: /Sentar à mesa/ }).click();

  await expect(page.getByText("Nível 1", { exact: true })).toBeVisible();
  await expect(page.getByText("10/20 · 2", { exact: true })).toBeVisible();
});

test("mantém assentos legíveis e explica a decisão no celular", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await resetTraining(page);
  await page.getByRole("button", { name: "5 adversários", exact: true }).click();
  await page.getByRole("button", { name: /Sentar à mesa/ }).click();

  await expect(page.getByText("Sua decisão", { exact: true })).toBeVisible();
  const actionPanel = page.getByRole("region", { name: "Suas ações" });
  const actionBox = await actionPanel.boundingBox();
  expect(actionBox).not.toBeNull();
  expect(actionBox!.y).toBeGreaterThanOrEqual(-1);
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(845);

  const lesson = page.getByRole("region", { name: "Professor da jogada" });
  await expect(lesson).toBeVisible();
  await expect(lesson.getByRole("heading", { name: "Entenda a jogada" })).toBeVisible();
  await expect(lesson.getByText("O que aconteceu")).toBeVisible();
  await expect(lesson.getByText("Sua decisão agora")).toBeVisible();
  await expect(lesson.getByText("Professor recomenda")).toBeVisible();

  await lesson.getByRole("button", { name: "Ocultar ajuda" }).click();
  await expect(lesson).toBeHidden();
  const restoreTeacher = page.getByRole("button", {
    name: "Mostrar ajuda nesta decisão",
  });
  await expect(restoreTeacher).toBeVisible();
  await restoreTeacher.click();
  await expect(lesson).toBeVisible();

  const table = page.getByRole("group", { name: "Mesa de poker" });
  const tableBox = await table.boundingBox();
  expect(tableBox).not.toBeNull();

  const seats = page.locator("[data-training-seat]");
  await expect(seats).toHaveCount(6);
  await expect(
    seats.nth(0).locator(":scope > div:nth-child(2) strong"),
  ).toContainText("VocêBTN");
  await expect(seats.locator("[class*='positionLabel']")).toHaveText([
    "BTN", "SB", "BB", "UTG", "MP", "CO",
  ]);
  for (let index = 0; index < 6; index += 1) {
    const seat = seats.nth(index);
    const seatBox = await seat.boundingBox();
    expect(seatBox).not.toBeNull();
    expect(seatBox!.x).toBeGreaterThanOrEqual(tableBox!.x - 1);
    expect(seatBox!.x + seatBox!.width).toBeLessThanOrEqual(
      tableBox!.x + tableBox!.width + 1,
    );
    expect(seatBox!.y).toBeGreaterThanOrEqual(tableBox!.y - 1);
    expect(seatBox!.y + seatBox!.height).toBeLessThanOrEqual(
      tableBox!.y + tableBox!.height + 1,
    );

    const textFits = await seat.locator(":scope > div:nth-child(2) strong").evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    );
    const stackFits = await seat.locator("small").evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    );
    expect(textFits).toBe(true);
    expect(stackFits).toBe(true);
  }
});

test("@a11y não apresenta violações WCAG A/AA na configuração", async ({ page }) => {
  await resetTraining(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(formatViolations(results.violations)).toEqual([]);
});

test("@a11y não apresenta violações WCAG A/AA no dashboard", async ({ page }) => {
  await resetTraining(page);
  await page.getByRole("button", { name: /Ver dashboard/ }).click();
  await expect(
    page.getByRole("heading", { name: "Seu dashboard de evolução" }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(formatViolations(results.violations)).toEqual([]);
});

test("@a11y não apresenta violações WCAG A/AA na mesa ativa", async ({ page }) => {
  await resetTraining(page);
  await startHeadsUpTraining(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(formatViolations(results.violations)).toEqual([]);
});

/**
 * Joga mãos passivamente até uma delas chegar ao showdown. O embaralhamento de
 * cada sessão é aleatório, então uma mão isolada pode terminar em fold — o
 * teste insiste até encontrar a situação que quer verificar.
 */
async function reachShowdownSummary(page: Page) {
  const advance = page.getByRole("button", { name: /Entendi, ver resumo/ });
  const nextHand = page.getByRole("button", { name: /Próxima mão/ });

  for (let hand = 0; hand < 12; hand += 1) {
    for (let step = 0; step < 60; step += 1) {
      if (await advance.isVisible().catch(() => false)) break;
      const action = page.getByRole("button", { name: /^(Check|Call)\b/ }).first();
      if (await action.isVisible().catch(() => false)) {
        await action.click().catch(() => undefined);
      } else {
        await page.waitForTimeout(150);
      }
    }

    await expect(advance).toBeVisible({ timeout: 15_000 });
    await advance.click();
    const summary = page.getByRole("dialog");
    await expect(summary).toBeVisible();

    if (await summary.getByText("Por que ganhou").isVisible().catch(() => false)) {
      return summary;
    }
    await nextHand.click();
    await expect(page.getByText("Sua decisão", { exact: true })).toBeVisible();
  }

  throw new Error("nenhuma das 12 mãos chegou ao showdown");
}

test("explica no resumo qual combinação venceu o showdown", async ({ page }) => {
  await resetTraining(page);
  await startHeadsUpTraining(page);
  const summary = await reachShowdownSummary(page);

  const title = await summary.getByRole("heading").first().textContent();
  expect(title).toMatch(/venceu no showdown com |Pote dividido entre .* com /);

  // A combinação citada no título reaparece detalhada na mão do vencedor.
  const winningHand = title!.split(" com ").at(-1)!.replace(/\.$/, "");
  await expect(
    summary.getByText(winningHand, { exact: true }).first(),
  ).toBeVisible();

  // Cada mão revelada mostra as cinco cartas que a formaram.
  const revealedHands = summary.locator("[class*='showdownItem']");
  expect(await revealedHands.count()).toBeGreaterThanOrEqual(2);
  for (let index = 0; index < (await revealedHands.count()); index += 1) {
    await expect(
      revealedHands.nth(index).getByRole("img", { name: / de / }),
    ).toHaveCount(5);
  }
});

test("@a11y não apresenta violações WCAG A/AA no resumo da mão", async ({ page }) => {
  await resetTraining(page);
  await startHeadsUpTraining(page);
  await reachShowdownSummary(page);
  await page.waitForTimeout(600);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(formatViolations(results.violations)).toEqual([]);
});
