import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/signin-with-chatgpt?return_to=/b2c/disputes");
  await expect(
    page.getByRole("heading", { name: "O perspectivă clară. Un pas sigur." }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Rol demo", exact: true })
    .selectOption("B2C_SUPERVISOR");
  await expect(page.getByText("Rolul demo a fost actualizat.")).toBeVisible();
  await page
    .getByRole("button", { name: "Resetează demo", exact: true })
    .click();
  await page.getByRole("button", { name: "Resetează scenariile" }).click();
  await expect(
    page.getByText("Cele 13 scenarii au fost resetate."),
  ).toBeVisible();
});
test("scenario A: edit, approve, answer, reinvestigate, approve route and close", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  await page.getByRole("link", { name: "DSP-2026-0187", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "MERCHANT*BUCURESTI", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pornește investigația", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Clarificări pentru client" }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Dovada 3DS nu este disponibilă în setul curent.", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  const q = "Recunoști denumirea acestui comerciant sau un abonament asociat?";
  await page.getByRole("textbox", { name: "Întrebarea Q1" }).fill(q);
  await page.screenshot({path:'outputs/investigation-desktop.png',fullPage:true});
  await page.getByRole("button", { name: "Aprobă și trimite" }).click();
  await expect(
    page.getByRole("heading", { name: "Așteptăm răspunsurile" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Așteptăm răspunsurile" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Deschide simulatorul" }).click();
  await expect(page.getByText("1. " + q, { exact: true })).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('combobox',{name:'Rol demo mobil'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.screenshot({path:'outputs/customer-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  const questions = page.locator(".mobile-question");
  await questions
    .nth(0)
    .getByRole("button", { name: "Nu", exact: true })
    .click();
  await questions
    .nth(1)
    .getByRole("button", { name: "Nu", exact: true })
    .click();
  await page.getByRole("button", { name: "Trimite răspunsurile" }).click();
  await expect(
    page.getByRole("heading", { name: "Mulțumim pentru răspunsuri." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Înapoi la cazuri" }).click();
  await page.getByRole("link", { name: "DSP-2026-0187", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Revizuire plată online nerecunoscută" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Aprobă traseul", exact: true })
    .click();
  await expect(page.getByText("Traseu aprobat de angajat")).toBeVisible();
  await page.getByRole("button", { name: "Închide cazul demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Caz închis demonstrativ" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Audit ·/ }).click();
  await expect(
    page.getByText("CUSTOMER_RESPONDED", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("REINVESTIGATION_STARTED", { exact: true }).first(),
  ).toBeVisible();
  expect(failures).toEqual([]);
});
test("scenario B: distinct settlements produce duplicate review", async ({
  page,
}) => {
  await page.getByRole("link", { name: "DSP-2026-0192", exact: true }).click();
  await page
    .getByRole("button", { name: "Pornește investigația", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Revizuire posibilă plată duplicată" }),
  ).toBeVisible();
  await expect(
    page.getByText("Căutare tranzacții duplicate", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("DSP-004", { exact: true })).toBeVisible();
});
test("scenario C: contradiction escalates without customer questions", async ({
  page,
}) => {
  await page.getByRole("link", { name: "DSP-2026-0201", exact: true }).click();
  await page
    .getByRole("button", { name: "Pornește investigația", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Escalare pentru dovezi contradictorii",
    }),
  ).toBeVisible();
  await expect(page.getByText("DSP-006", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Aprobă și trimite" }),
  ).toHaveCount(0);
});
test("inbox filters, search, analytics and responsive mobile render", async ({
  page,
}) => {
  await page.getByRole("textbox", { name: "Caută cazuri" }).fill("0187");
  await expect(page.locator(".cases-table tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Șterge căutarea" }).click();
  await page
    .getByRole("combobox", { name: "Categorie", exact: true })
    .selectOption("POSSIBLE_DUPLICATE");
  await expect(page.locator(".cases-table tbody tr")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Analiză operațională", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Fiecare pas, măsurabil." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Cazuri de dispută/ }).click();
  await page
    .getByRole("combobox", { name: "Categorie", exact: true })
    .selectOption("ALL");
  await page.screenshot({ path: "outputs/inbox-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "O perspectivă clară. Un pas sigur." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "outputs/inbox-mobile.png", fullPage: true });
});

test('controlled tool error is visible and never displays a success toast',async({page})=>{await page.getByRole('link',{name:'DSP-2026-0209',exact:true}).click();await page.getByRole('button',{name:'Pornește investigația',exact:true}).click();await expect(page.getByText('Investigație oprită controlat',{exact:true})).toBeVisible();await expect(page.getByText('Timeout în adaptorul sintetic de autentificare.',{exact:true})).toBeVisible();await expect(page.getByText('Investigația s-a finalizat. Rezultatul este disponibil.',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Elimină defecțiunea demo'}).click();await expect(page.getByRole('heading',{name:'Clarificări pentru client'})).toBeVisible();});
