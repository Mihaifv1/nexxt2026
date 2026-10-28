import { test, expect, type Page } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto(
    "/signin-with-chatgpt?return_to=/b2c/intake?customer=CUST-10482",
  );
  await expect(
    page.getByRole("heading", { name: "Spune o dată. Continuă de oriunde." }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Rol demo", exact: true })
    .selectOption("B2C_SUPERVISOR");
  await expect(
    page.getByText("Rolul demo a fost actualizat.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Profil canonic" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Resetează acest profil demo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Resetează profilul", exact: true })
    .click();
  await expect(
    page.getByText("Profilul sintetic a fost resetat.", { exact: true }),
  ).toBeVisible();
});
async function intake(page: Page) {
  await page
    .getByRole("button", { name: "Folosește exemplul sintetic", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Procesează mesajul", exact: true })
    .click();
  const review = page.locator(".review-panel");
  await expect(review).toBeVisible();
  await review
    .getByRole("checkbox", { name: "Eligibilitate demo", exact: true })
    .check();
  await review
    .getByRole("checkbox", { name: "Pregătirea consilierului", exact: true })
    .check();
  await review
    .getByRole("button", { name: /Confirmă câmpurile selectate/ })
    .click();
  await expect(review).toHaveCount(0);
}
test("OneFront Door and Branch Handoff: confirmed documents to human outcome", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  await intake(page);
  await page.getByRole("button", { name: "Documente", exact: true }).click();
  for (const name of [
    "Identitate demo",
    "Adeverință salarială",
    "Extras de cont",
  ]) {
    await page
      .locator(".document-type-cards")
      .getByRole("button", { name: new RegExp(name) })
      .click();
    await page
      .getByRole("button", { name: "Încarcă exemplul sintetic", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Conținut document sintetic" }),
    ).toHaveValue(/CUST-10482/);
    await page
      .getByRole("button", { name: "Extrage documentul", exact: true })
      .click();
    const review = page.locator(".review-panel");
    await expect(review).toBeVisible();
    await review
      .getByRole("button", { name: /Confirmă câmpurile selectate/ })
      .click();
    await expect(review).toHaveCount(0);
  }
  await page
    .getByRole("button", { name: "Intake & clarificări", exact: true })
    .click();
  await page.locator("#manual-field").selectOption("budget_minor");
  await page
    .getByRole("spinbutton", { name: "Valoare câmp manual" })
    .fill("65000");
  await page
    .getByRole("button", { name: "Salvează în profil", exact: true })
    .click();
  await expect(
    page.getByText(
      "Informația a fost salvată cu proveniență și confirmare umană.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Profil & acorduri", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Permite pentru eligibilitate", exact: true })
    .click();
  await expect(
    page.getByText(
      "Accesul la câmpurile existente pentru eligibilitate a fost permis.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 10000 });
  await page
    .getByRole("button", { name: "Permite pentru consilier", exact: true })
    .click();
  await expect(
    page.getByText(
      "Accesul consilierului la câmpurile existente a fost permis.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: /Deschide Branch Handoff/ }).click();
  await page
    .getByRole("button", { name: "Pregătește dosarul", exact: true })
    .click();
  await expect(
    page.getByText("Compatibil preliminar", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Criterii demo neîndeplinite", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".brief-facts")).toContainText("65.000,00");
  const slot = page.getByRole("combobox", { name: "Interval programare" });
  const value = await slot.locator("option").nth(1).getAttribute("value");
  await slot.selectOption(value!);
  await page
    .getByRole("button", { name: "Confirmă programarea demo", exact: true })
    .click();
  await expect(page.locator(".checkin-code strong")).toBeVisible();
  const code = await page.locator(".checkin-code strong").innerText();
  await page.getByRole("textbox", { name: "Cod check-in" }).fill("INVALID");
  await page
    .getByRole("button", { name: "Confirmă check-in", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Codul de check-in nu corespunde.",
  );
  await page.getByRole("textbox", { name: "Cod check-in" }).fill(code);
  await page
    .getByRole("button", { name: "Confirmă check-in", exact: true })
    .click();
  await expect(
    page.getByText("Clientul a confirmat sosirea.", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "outputs/branch-handoff-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "outputs/branch-handoff-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#handoff-outcome").selectOption("APPLICATION_DEMO");
  await page
    .getByRole("textbox", { name: "Notă rezultat întâlnire" })
    .fill(
      "Datele și documentele sintetice au fost revizuite. Continuăm cu o cerere demo.",
    );
  await page
    .getByRole("button", { name: "Salvează rezultatul", exact: true })
    .click();
  await expect(
    page.getByText("Întâlnire finalizată", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Întâlnire finalizată", { exact: true }),
  ).toBeVisible();
  expect(failures).toEqual([]);
});
test("revoked consent redacts banker facts and marks the briefing stale", async ({
  page,
}) => {
  await intake(page);
  await page
    .getByRole("button", { name: "Profil & acorduri", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Permite pentru consilier", exact: true })
    .click();
  await expect(
    page.getByText(
      "Accesul consilierului la câmpurile existente a fost permis.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: /Deschide Branch Handoff/ }).click();
  await page
    .getByRole("button", { name: "Pregătește dosarul", exact: true })
    .click();
  await expect(page.locator(".brief-facts")).toContainText("Venit net lunar");
  await page.getByRole("button", { name: /Deschide profilul unic/ }).click();
  await page
    .getByRole("button", { name: "Profil & acorduri", exact: true })
    .click();
  await page
    .getByRole("checkbox", {
      name: "Venit net lunar · Pregătire consilier",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(
      "Permisiunea a fost revocată. Dosarul consilierului va reflecta schimbarea.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: /Deschide Branch Handoff/ }).click();
  await expect(page.locator(".brief-facts")).not.toContainText(
    "Venit net lunar",
  );
  await expect(
    page.getByText(
      "Profilul sau acordurile s-au schimbat. Actualizează dosarul înainte de continuare.",
      { exact: true },
    ),
  ).toBeVisible();
});
test("document identity mismatch is blocked; actual TXT file upload extracts proposals", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Documente", exact: true }).click();
  await page
    .getByRole("button", { name: "Încarcă exemplul sintetic", exact: true })
    .click();
  const input = page.getByRole("textbox", {
    name: "Conținut document sintetic",
  });
  await expect(input).toHaveValue(/CUST-10482/);
  const original = await input.inputValue();
  await input.fill(original.replace("CUST-10482", "CUST-OTHER"));
  await page
    .getByRole("button", { name: "Extrage documentul", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "nu corespunde profilului",
  );
  await expect(page.locator(".review-panel")).toHaveCount(0);
  await page.getByLabel("Document sintetic TXT").setInputFiles({
    name: "identity-upload.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(original),
  });
  await expect(input).toHaveValue(original);
  await page
    .getByRole("button", { name: "Extrage documentul", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Confirmă informațiile extrase" }),
  ).toBeVisible();
});
test("intake is responsive and shares the canonical customer with disputes", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Dosarul de dispută", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "MERCHANT*BUCURESTI", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Profil unic", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Profil canonic" }),
  ).toHaveValue("CUST-10482");
  await page.screenshot({
    path: "outputs/frontdoor-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Spune o dată. Continuă de oriunde." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "outputs/frontdoor-mobile.png",
    fullPage: true,
  });
});
