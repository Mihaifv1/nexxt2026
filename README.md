# NEXT B2C Operations Hub

Intrarea principală este `/b2c/dashboard`: **Customer 360**, cazuri comune, catalogul celor **29 de fluxuri**, documente versionate, ofertare ilustrativă, semnare mock, aprobări și audit. Vezi [OPERATIONS_HUB.md](OPERATIONS_HUB.md) pentru fluxuri, setup și limitele prototipului.

Aplicația include acum **Payment Incident Intelligence**: un orchestrator comun pentru DisputePilot, ScamRescue, RoPay Rescue și ATMTrace, cu Human Review, aprobări, simulator comun, coadă persistentă și 16 scenarii. Intrarea principală este `/b2c/incidents`. Vezi [PAYMENT_INCIDENTS.md](PAYMENT_INCIDENTS.md).

Aplicația include și **OneFront Door** (profil canonic, intake și documente) și **Smart Branch Handoff** (dosar consilier, programare și check-in). Vezi [FRONTDOOR.md](FRONTDOOR.md) pentru parcursul complet, noua migrare și configurarea cheii de criptare.

Modul B2C pentru investigarea contestațiilor de plată cu cardul. Interfață în română, date sintetice și control uman al comunicării și al traseului operațional. Nu execută rambursări, blocări de card sau chargeback-uri.

## Pornire rapidă: demo local cu D1

Necesită Node.js 22.13+ și npm. Proiectul utilizează React 19, TypeScript, Vinext/Vite, Zod și Drizzle. Nu exista o aplicație B2B în folderul inițial; modulul B2C și shell-ul sunt implementate de la zero, fără rute B2B.

```powershell
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_sweet_ozymandias.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_audit_immutable.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_productive_speed_demon.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_stale_midnight.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0004_light_ultragirl.sql
npm run dev -- --hostname 127.0.0.1
```

Deschide URL-ul afișat de server (implicit `http://127.0.0.1:5173`). Selectează „Autentificare cu ChatGPT”; pe loopback, starter-ul simulează identitatea locală. Migrarea inițială se aplică o singură dată unei baze noi. Datele sintetice sunt inițializate la prima sesiune demo.

## PostgreSQL local

```powershell
docker compose up -d --wait
$env:DATABASE_URL='postgresql://disputepilot:local-demo-only@127.0.0.1:5432/disputepilot'
npm run dev:postgres
```

În alt terminal:

```powershell
$env:B2C_POSTGRES_API='http://127.0.0.1:8788'
npm run dev -- --hostname 127.0.0.1
```

Proxy-ul folosește aceeași implementare API și aceleași reguli. Adaptorul PostgreSQL aplică migrarea din `db/postgres/001_initial.sql`. API-ul separat ascultă exclusiv pe loopback și folosește o identitate demo locală fixă; nu trebuie expus direct pe internet. Parola din Compose este exclusiv pentru acest mediu local. `docker compose stop` oprește baza fără a elimina volumul persistent.

În versiunea găzduită pe Sites, persistența este D1, deoarece runtime-ul Workers nu oferă TCP direct către PostgreSQL. Adaptorul PostgreSQL este destinat integrării locale sau într-un backend Node al aplicației comune.

## LLM real sau motor demo

Fără configurare, aplicația afișează explicit **Motor demo determinist**. Acesta generează ieșiri structurate din dovezile colectate și din reguli, fără concluzii hardcodate pe ID de caz. Nu este un apel la un model AI.

Pentru un serviciu LLM compatibil cu chat completions, configurează pe server `LLM_ENDPOINT` (URL complet), `LLM_API_KEY` și `LLM_MODEL`. Pentru preview D1, folosește `.dev.vars`; pentru API-ul PostgreSQL, variabile de mediu; pentru publicare, secretele runtime Sites. Cheile nu ajung în browser.

Providerul trimite numai date sintetice și carduri mascate. Solicită JSON, validează rezultatul cu Zod, verifică existența referințelor și suportul exact al afirmațiilor în rezumatele dovezilor. Regulile de server controlează întotdeauna traseul și cheile întrebărilor. Timeout-ul LLM este 20 secunde. Indisponibilitatea, JSON-ul invalid sau afirmațiile fără suport produc eroare controlată, păstrată în audit; nu se înlocuiește un apel eșuat cu succes demo.

## Demo: 4 minute

1. Deschide `DSP-2026-0187`, pornește investigația și consultă instrumentele, constatări și DSP-003. Autentificarea necunoscută nu demonstrează fraudă.
2. Editează întrebările Q1/Q2, apoi „Aprobă și trimite”. Deschide simulatorul, răspunde „Nu” la ambele și trimite. Revenirea în dosar arată investigația nouă și traseul pentru revizuire.
3. Aprobă traseul. Selectează rolul **Supervizor B2C** și închide administrativ cazul demo.
4. Deschide `DSP-2026-0192`: instrumentul de duplicate verifică două ID-uri, referințe, sume, monede, comercianți, intervale și decontări distincte.
5. Deschide `DSP-2026-0201`: contradicția produce escaladare și DSP-006.
6. Consultă auditul și indicatorii. Pentru reluare, supervizorul poate reseta scenariile. Resetarea păstrează auditul anterior și adaugă evenimente `DEMO_RESET`.

Alte scenarii: `0202` rambursare promisă, `0203` recunoaștere după clarificare, `0204` card pierdut, `0205` tranzacție lipsă, `0206` o decontare și o autorizare, `0207` răspuns nesigur/incomplet, `0208` cerere expirată, `0209` timeout instrument, `0210` JSON invalid, `0211` prompt injection. Pentru `0209`/`0210`, supervizorul poate elimina explicit defecțiunea demo și reîncerca.

## Arhitectură și integrare

- Rute: `/b2c/disputes`, `/b2c/disputes/:id`, `/b2c/analytics`, `/b2c/audit`, `/b2c/demo/customer`.
- API: `/api/b2c/disputes`, `/:id/investigations`, `/:id/approvals`, `/:id/customer-requests`, `/:id/audit`, `/:id/events`, `/investigations/:runId`, `/customer-requests`, `/customer-requests/:id/responses`, `/analytics`, `/demo/reset`, `/session`, `/demo/profiles`.
- `lib/domain.ts`: contracte, validare, tranziții, bani în unități minore.
- `lib/engine.ts`: orchestrare cu ramificare, instrumente care citesc date sintetice, progres persistent, aprobări și bucla de răspuns.
- `lib/rules.ts`: DSP-001…DSP-010, rulebook `demo-v1`.
- `lib/provider.ts`: motor demo și provider LLM configurabil, validarea ieșirii.
- `lib/store.ts`: repository SQL cu compare-and-swap și batch atomic. Datele sunt izolate pe identitatea Sites.
- `lib/api.ts`: autentificare, validare, sesiuni de rol stocate pe server, răspunsuri HTTP explicite.
- `server/postgres.ts`: adaptor PostgreSQL cu tranzacții native.

Pentru MVP, entitățile unui dosar (tranzacție, card mascat, dovezi, investigații, reguli, cereri, răspunsuri și aprobări) sunt persistate ca **agregat JSON versionat** în `b2c_dispute_cases`, nu în cele 13 tabele normalizate propuse în blueprint. Auditul are și tabel separat `b2c_audit_events`; sesiunile sunt în `b2c_demo_sessions`. Alegerea menține o mutație atomică a dosarului și funcționează identic pe D1 și PostgreSQL. Valorile monetare rămân numere întregi în JSON. Migrările și modulul sunt separate de B2B.

Fiecare mutație verifică rolul, starea, versiunea, investigația și idempotency key. Conflictul de versiune sau cererea expirată produce `409`. Întrebările nu creează o cerere către client înainte de aprobare. Clientul vede doar propriul profil demo; cookie-urile angajat/client sunt distincte, HttpOnly și SameSite. Aprobarile și răspunsurile se păstrează după refresh. Progresul reprezintă apeluri efectiv executate, nu pași animați cu temporizatoare.

În demo, proprietarul autentificat poate schimba intenționat rolurile agent/supervizor/client; aceasta nu este o politică RBAC de producție. Într-o integrare reală, înlocuiește endpoint-ul de selecție demo cu rolurile și identitatea aplicației gazdă. Adaptorul local loopback nu este autentificare de producție.

## Verificare

```powershell
npm run typecheck
npm test
npm run test:postgres # Cu PostgreSQL pornit prin Docker Compose
npm run build
# Cu preview-ul pornit; configurația folosește Edge instalat pe Windows:
npm run test:e2e
```

Testele de domeniu și integrare folosesc node:test, un repository în memorie și SQLite SQL real prin `node:sqlite`. Testele E2E Playwright folosesc API-ul și baza D1 reale din preview: bucla integrală A, scenariile B/C, persistență după refresh, editare întrebări, căutare, filtre, indicatori și layout mobil. Rapoartele și capturile sunt în `outputs/`, ignorat de Git. Pe alte sisteme se poate înlocui `channel: 'msedge'` în configurația Playwright cu Chromium instalat.

Acesta este un MVP sintetic. Nu implementează proceduri bancare oficiale, conectare bancară reală, securitate/reglementare pentru producție sau efecte financiare. Integrarea LLM live trebuie configurată și verificată cu un serviciu disponibil.
