import { test, expect, type Page } from "@playwright/test";
import type { Incident } from "../../lib/incidents/domain";
const list = async (page: Page) =>
  (await (await page.request.get("/api/b2c/incidents")).json()) as Incident[];
const find = async (page: Page, code: string) =>
  (await list(page)).find((c) => c.fixture_code === code)!;
async function open(page: Page, code: string) {
  await page.goto("/b2c/incidents");
  await page.getByRole("link", { name: "PII-" + code, exact: true }).click();
  await expect(page.locator(".pi-case-heading")).toContainText("PII-" + code);
}
async function start(page: Page) {
  await page
    .getByRole("button", {
      name: "Pornește trierea și investigația",
      exact: true,
    })
    .click();
  await expect(page.locator(".pi-run-state")).toContainText(
    /Investigație (finalizată|oprită controlat)/,
  );
}
async function mobile(page: Page) {
  await page
    .locator(".pi-approval")
    .getByRole("button", { name: "Deschide Smart Mobile", exact: true })
    .click();
  await expect(page.locator(".mobile-request-meta")).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/signin-with-chatgpt?return_to=/b2c/incidents");
  await expect(
    page.getByRole("heading", {
      name: "Patru investigatori. Un singur fir al dovezilor.",
    }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Rol demo", exact: true })
    .selectOption("B2C_SUPERVISOR");
  await expect(page.getByText("Rolul demo a fost actualizat.")).toBeVisible();
  const reset = await page.request.post("/api/b2c/incidents/reset", {
    data: {},
    headers: { "Idempotency-Key": crypto.randomUUID() },
  });
  expect(reset.ok()).toBeTruthy();
  await page.reload();
  await expect(page.locator(".pi-case-table tbody tr").first()).toBeVisible();
});
test("ScamRescue: edit, approve, customer confirmation, urgent escalation and persistent audit", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, "S01");
  await start(page);
  await expect(page.locator(".pi-investigator .panel-header h2")).toHaveText(
    "ScamRescue",
  );
  expect((await find(page, "S01")).requests).toHaveLength(0);
  const q =
    "Ai instalat o aplicație de acces la distanță la cererea apelantului?";
  await page
    .getByRole("textbox", { name: "Întrebare incident 1", exact: true })
    .fill(q);
  await page.screenshot({
    path: "outputs/scam-workspace-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Aprobă și trimite întrebările", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Așteptăm răspunsul clientului" }),
  ).toBeVisible();
  await page.reload();
  await mobile(page);
  await expect(page.getByText("1. " + q, { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "outputs/payment-customer-mobile.png",
    fullPage: true,
  });
  const questions = page.locator(".mobile-question");
  await questions
    .nth(0)
    .getByRole("button", { name: "Da", exact: true })
    .click();
  await questions
    .nth(1)
    .getByRole("button", { name: "Nu", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Trimite răspunsurile", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Răspunsurile tale au fost salvate." }),
  ).toBeVisible();
  await expect
    .poll(async () => (await find(page, "S01")).priority)
    .toBe("URGENT");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, "S01");
  await expect(
    page.getByRole("heading", { name: "Escaladare propusă" }),
  ).toBeVisible();
  expect((await find(page, "S01")).status).toBe("AWAITING_APPROVAL");
  await page
    .getByRole("button", { name: "Aprobă escaladarea", exact: true })
    .click();
  await expect(page.locator(".pi-case-heading")).toContainText("Escaladat");
  await page.reload();
  await page.getByRole("button", { name: /^Audit ·/ }).click();
  await expect(
    page.getByText("Escaladare aprobată", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("RoPay Rescue reclassifies to ScamRescue and retains prior evidence and intent", async ({
  page,
}) => {
  await open(page, "R03");
  await start(page);
  await expect(page.locator(".pi-investigator .panel-header h2")).toHaveText(
    "RoPay Rescue",
  );
  await expect(
    page.getByRole("heading", {
      name: "Intenția clientului vs. plata efectuată",
    }),
  ).toBeVisible();
  const before = await find(page, "R03");
  await page
    .getByRole("button", { name: "Aprobă și trimite întrebările" })
    .click();
  await mobile(page);
  await page
    .locator(".mobile-question")
    .getByRole("button", { name: "Da", exact: true })
    .click();
  await page.getByRole("button", { name: "Trimite răspunsurile" }).click();
  await expect
    .poll(async () => (await find(page, "R03")).primary_route)
    .toBe("SCAM_RESCUE");
  await open(page, "R03");
  await expect(
    page.getByRole("heading", { name: "Evoluția incidentului" }),
  ).toBeVisible();
  const after = await find(page, "R03");
  expect(after.runs).toHaveLength(2);
  expect(after.evidence.length).toBeGreaterThan(before.evidence.length);
  expect(
    after.audit.some((e) => e.event_type === "INCIDENT_RECLASSIFIED"),
  ).toBeTruthy();
  await page.screenshot({
    path: "outputs/ropay-reclassified.png",
    fullPage: true,
  });
});
test("ATMTrace: event replay, customer clarification, approved technical pack and existing reversal update", async ({
  page,
}) => {
  await open(page, "A01");
  await start(page);
  await expect(page.locator(".pi-investigator .panel-header h2")).toHaveText(
    "ATMTrace",
  );
  await page.getByRole("button", { name: "Următor", exact: true }).click();
  await expect(page.locator(".pi-atm-current")).toContainText(
    "ACCOUNT_DEBITED",
  );
  await page
    .getByRole("button", { name: "Aprobă și trimite întrebările" })
    .click();
  await mobile(page);
  await page
    .getByRole("button", { name: "Nu am primit numerar", exact: true })
    .click();
  await page.getByRole("button", { name: "Trimite răspunsurile" }).click();
  await expect.poll(async () => (await find(page, "A01")).runs.length).toBe(2);
  await open(page, "A01");
  await page
    .getByRole("button", { name: "Aprobă pregătirea dosarului" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Dosar pregătit și aprobat" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Închide incidentul demo" }).click();
  await expect(page.locator(".pi-case-heading")).toContainText("Închis demo");
  await open(page, "A02");
  await start(page);
  await expect(
    page.getByRole("button", { name: /REVERSAL POSTED/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Aprobă și trimite actualizarea" })
    .click();
  const c = await find(page, "A02");
  await page.goto(
    `/b2c/customer-demo?customer=${c.customer_id}&incident=${c.id}`,
  );
  await expect(page.locator(".pi-mobile-update")).toContainText(
    "Investigația a fost revizuită",
  );
});
test("ambiguous cases can be reassigned; unavailable tools require Human Review and explicit recovery", async ({
  page,
}) => {
  await open(page, "H01");
  await start(page);
  await expect(page.locator(".pi-case-heading")).toContainText(
    "Revizuire umană",
  );
  await page.getByRole("button", { name: "Reasignare / Human Review" }).click();
  await page
    .getByRole("combobox", { name: "Rută reasignare incident" })
    .selectOption("DISPUTE_PILOT");
  await page
    .getByRole("combobox", { name: "Tranzacție reasignare incident" })
    .selectOption("PAY-H01-CARD");
  await page
    .getByRole("textbox", { name: "Motiv reasignare incident" })
    .fill("Clientul identifică plata cu cardul sintetic.");
  await page
    .getByRole("button", { name: "Reasignează și investighează" })
    .click();
  await expect(page.locator(".pi-investigator .panel-header h2")).toHaveText(
    "DisputePilot",
  );
  await open(page, "X01");
  await start(page);
  await expect(
    page.getByRole("heading", { name: "Revizuire umană necesară" }),
  ).toBeVisible();
  expect(
    (await find(page, "X01")).runs[0].calls.filter(
      (c) => c.status === "FAILED",
    ),
  ).toHaveLength(2);
  await page.getByRole("button", { name: "Elimină defecțiunea demo" }).click();
  await expect
    .poll(async () => (await find(page, "X01")).runs.at(-1)?.status)
    .toBe("COMPLETED");
  await expect(page.locator(".pi-investigator .panel-header h2")).toHaveText(
    "ScamRescue",
  );
});
test("DisputePilot participates in the common approval and customer loop", async ({
  page,
}) => {
  await open(page, "D01");
  await start(page);
  await expect(page.locator(".pi-unknowns")).toContainText("3DS");
  await page
    .getByRole("button", { name: "Aprobă și trimite întrebările" })
    .click();
  await mobile(page);
  const q = page.locator(".mobile-question");
  await q.nth(0).getByRole("button", { name: "Nu", exact: true }).click();
  await q.nth(1).getByRole("button", { name: "Nu", exact: true }).click();
  await page.getByRole("button", { name: "Trimite răspunsurile" }).click();
  await expect
    .poll(
      async () =>
        (await find(page, "D01")).runs.at(-1)?.proposed_actions[0].type,
    )
    .toBe("PREPARE_DISPUTE_PACK");
  await open(page, "D01");
  await page
    .getByRole("button", { name: "Aprobă pregătirea dosarului" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Dosar pregătit și aprobat" }),
  ).toBeVisible();
  await page.locator(".pi-evidence-list button").first().click();
  await expect(
    page.getByRole("dialog", { name: "Dovadă incident" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Colectat la");
});
test("new incident, rejection, search, analytics, audit and responsive scenario controls", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Incident nou", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Relatare incident nou" })
    .fill("Nu recunosc plata de 489,90 lei cu cardul.");
  await page
    .getByRole("combobox", { name: "Tranzacție incident nou" })
    .selectOption("PAY-D01");
  await page.getByRole("button", { name: "Creează incidentul" }).click();
  await start(page);
  await page
    .getByRole("textbox", { name: "Notă decizie incident" })
    .fill("Solicit verificarea contextului suplimentar.");
  await page.getByRole("button", { name: "Respinge", exact: true }).click();
  await expect(page.locator(".pi-case-heading")).toContainText(
    "Revizuire umană",
  );
  await page
    .getByRole("button", { name: "Centrul de incidente", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Caută incidente" }).fill("S02");
  await expect(page.locator(".pi-case-table tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Analiză operațională", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Fiecare pas, măsurabil." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Jurnal de audit", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Caută în auditul incidentelor" })
    .fill("RECOMMENDATION_REJECTED");
  await expect(page.locator(".pi-global-audit details")).toHaveCount(1);
  await page.goto("/b2c/demo");
  await expect(page.locator(".pi-demo-grid>button")).toHaveCount(16);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "outputs/payment-scenarios-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Resetează incidentele demo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Resetează cele 16 scenarii", exact: true })
    .click();
  await expect(
    page.getByText("Cele 16 scenarii de incidente au fost resetate."),
  ).toBeVisible();
  expect((await list(page)).some((c) => !c.fixture_code)).toBeTruthy();
});
