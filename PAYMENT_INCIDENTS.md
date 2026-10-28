# Payment Incident Intelligence

Un singur dosar, o triere comună și patru investigatori: DisputePilot, ScamRescue, RoPay Rescue și ATMTrace. Cazurile ambigue ajung la General Human Review. Rutele OneFront Door, Branch Handoff și DisputePilot original rămân disponibile.

## Demonstrație

1. Deschide `/b2c/incidents`, selectează PII-S01 și pornește trierea. Consultă instrumentele executate, faptele cu referințe, declarațiile și necunoscutele.
2. Editează întrebarea, aprobă trimiterea, apoi deschide Smart Mobile. Confirmă accesul la distanță: răspunsul persistă, produce o rulare nouă și propune escaladare urgentă. Escaladarea se execută numai după aprobarea angajatului.
3. PII-R03 începe în RoPay Rescue. Răspunsul care confirmă manipularea reclasifică dosarul în ScamRescue, păstrând dovezile și aprobările precedente.
4. PII-A01 permite parcurgerea jurnalului ATM, clarificarea numerarului primit și aprobarea dosarului tehnic. PII-A02 are o reversare deja existentă și permite comunicarea ei după aprobare. Nu inițiază rambursare.
5. PII-D01 folosește regulile DisputePilot și simulatorul comun. PII-D02/D03 diferențiază două decontări de două autorizări. PII-D04 păstrează 3DS necunoscut.
6. PII-H01 necesită identificarea tranzacției sau reasignare motivată. PII-X01 păstrează eroarea reală a instrumentului după două încercări; supervizorul poate elimina explicit defecțiunea demo și reîncerca.
7. `/b2c/demo` conține cele 16 scenarii. Resetarea de supervizor păstrează auditul, ID-urile scenariilor, incidentele manuale și joburile lor. Celelalte module au resetări proprii.

## Implementare

- `lib/incidents/domain.ts`: contracte comune, Zod, state machine, bani în unități minore.
- `intake.ts`: extragere conservatoare a sumei, canalului, datei și beneficiarului declarat; textul rămâne neconfirmat.
- `tools.ts`: registru de instrumente cu interogări SQL reale asupra surselor sintetice. Fiecare apel păstrează începutul, sfârșitul, latența, încercarea și dovezile.
- `rules.ts`: compatibilitate canal/rută, reguli globale și reguli versionate pe investigator. DisputePilot reutilizează motorul existent.
- `orchestrator.ts`: coadă, rulări, reinvestigare, reclasificare, validarea rezultatului, aprobări și solicitări către client.
- `store.ts`: agregat JSON versionat și proiecții SQL pentru dovezi, rulări, apeluri, reguli, propuneri, aprobări, solicitări, răspunsuri și artefacte. CAS și tranzacții împiedică scrierile concurente și auditul orfan.
- `provider.ts`: endpoint chat-completions opțional, JSON validat și referințe verificate. Fără configurare rulează explicit **Demo determinist**, fără apel AI. LLM-ul nu controlează stările sensibile sau acțiunile financiare.

Tabelele noi sunt în migrarea `drizzle/0003_stale_midnight.sql`, respectiv `db/postgres/003_payment_incidents.sql`. Toate au prefix `b2c_`. Datele și auditul sunt izolate pe identitatea proprietarului autentificat. Simulatorul vede doar propriile solicitări aprobate.

## Execuția joburilor

Pe Sites/D1, cererea programează procesarea cu `waitUntil`; jobul și progresul sunt salvate înainte de rezultat. La redeschiderea centrului, bootstrap reia joburile în așteptare sau cu lease expirat. Dosarul permite și recuperarea explicită. În preview fără context de fundal, aceeași procesare este așteptată de API.

Pe PostgreSQL/Node, API-ul poate procesa în fundal. Pentru recuperare independentă de browser, rulează și:

```powershell
$env:DATABASE_URL='postgresql://disputepilot:local-demo-only@127.0.0.1:5432/disputepilot'
npm run worker:incidents
```

Workerul citește coada persistentă; `-- --once` execută o singură scanare. Lease-ul durează 60 secunde și se prelungește la progres. Lock token-ul și CAS împiedică două execuții să scrie simultan. După trei întreruperi, finalizarea controlată marchează rularea eșuată și trimite dosarul la Human Review. Instrumentele au maximum două încercări; modelul are maximum două încercări per etapă și timeout de 8 secunde per apel. Nu există fallback de succes când un LLM configurat eșuează.

## API

Prefix `/api/b2c/`:

- `POST incidents/bootstrap`, `GET/POST incidents`, `GET incidents/:id`.
- `POST incidents/:id/triage` sau `/investigate`: versiune obligatorie, răspuns 202 cu job/run ID.
- `GET incidents/jobs/:id`, `POST incidents/jobs/:id/resume`.
- `POST incidents/:id/approvals`: APPROVE, REJECT, REVISION, ESCALATE, CLOSE. Închiderea și resetarea cer supervizor.
- `POST incidents/:id/reassign`: rută compatibilă, tranzacție a clientului și motiv.
- `GET incidents/:id/evidence`, `/events`, `/audit`, `/customer-requests`.
- `GET investigations/:runId`, `GET incident-customer`.
- `POST customer-requests/:requestId/responses`: versiune, răspunsuri complete, atașament TXT sintetic opțional.
- `GET incidents/catalog`, `/metrics`, `/audit`; `POST incidents/reset`.

Mutațiile cer `Idempotency-Key`. Aceeași cheie cu alt payload este respinsă. Endpointul `/analytics` păstrează valorile dispute existente și adaugă `payment_incidents`. Metricile provin din rulări și evenimente, fără timpi sau rezultate comerciale inventate.

## Limite

Prototip cu date sintetice, roluri demo selectabile și reguli demonstrative. Fără integrare bancară reală, trimitere externă de mesaje, chargeback, refund, blocare sau transfer. Pachetele aprobate sunt exporturi JSON operaționale. Configurarea unui LLM live este opțională și nu a fost folosită în verificarea acestui demo; indisponibilitatea și ieșirile invalide au fost verificate cu un provider simulat.
