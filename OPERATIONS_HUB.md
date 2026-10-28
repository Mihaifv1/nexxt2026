# NEXT B2C Operations Hub

Platformă demonstrativă care unește Customer 360, workflow-uri, contracte, credit, servicii și Payment Incident Intelligence. Toate operează în `/b2c/**` și `/api/b2c/**`. Nu există sistem B2B în acest repository; nu sunt simulate modificări ale unui modul B2B extern.

## Experiența principală

- `/b2c/dashboard`: activitate, traseele P0 și cazuri recente.
- `/b2c/clients` și `/:id`: profilul canonic, proveniență, produse, cazuri și documente.
- `/b2c/workflows`: catalogul complet P0/P1/P2, cu 29 de definiții.
- `/b2c/cases`, `/new`, `/:id`: dosare persistente, surse, instrumente, reguli, documente, aprobări și audit.
- `/b2c/contracts`, `/b2c/credits`, `/b2c/complaints`: liste filtrate; `/new` selectează fluxul potrivit.
- `/b2c/onboarding/new`: onboarding pentru client existent sau client sintetic nou.
- `/b2c/approvals`: aprobări pentru workflow-uri și incidente de plată.
- `/b2c/customer-demo`: simulator comun; schimbă între incidente și dosare/semnare mock.
- `/b2c/operations-analytics` și `/operations-audit`: indicatori din evenimente și auditul comun.
- Modulele DisputePilot original, OneFront Door, Branch Handoff și centrul de incidente rămân disponibile.

## P0

**Onboarding / KYC:** colectare date, document TXT sintetic, potrivire client/nume și valabilitate, detectarea duplicatelor, solicitare aprobată către client, răspuns persistent, reevaluare și actualizare a profilului numai după aprobare. Un minor în onboarding standard este blocat. KYC Refresh reutilizează aceeași infrastructură și păstrează istoricul câmpurilor.

**Contract de cont:** profil verificat obligatoriu, câmpuri obligatorii, document HTML/PDF versionat, revizuire internă și solicitare de semnare mock. Clientul acceptă sau refuză. Acceptarea validează versiunea, hash-ul documentului și versiunea profilului; abia apoi apare un produs `ACTIVE_DEMO` în Customer 360. Refuzul nu creează produs. Modificarea dosarului invalidează solicitările și aprobările documentelor anterioare.

**Credit personal:** documente de venit și obligații, consistența venitului declarat cu adeverința, clarificare prin simulator și calcul ilustrativ reproductibil. Exemplul folosește dobândă nominală de 8% pe an, rate lunare egale și prag ilustrativ de 40% pentru raportul obligații/venit. Nu este scoring, DAE sau ofertă financiară reală. Oferta și contractul draft sunt documente distincte; continuarea necesită supervizor. Semnarea este simulată, fără acordare sau tragere reală.

**Reclamații:** clasificare demonstrativă a temei, istoric și surse sintetice, răspuns cu referințe, editare de angajat, aprobare și livrare în simulator. Termenul intern DEMO de 5 zile trimite cazul la supervizor; nu reprezintă un termen legal.

**DisputePilot, ScamRescue, RoPay Rescue:** folosesc orchestratorul de incidente existent, fără duplicarea regulilor. ATMTrace este inclus în P1 și rămâne investigator complet în centrul comun.

## P1 și P2

Toate definițiile sunt accesibile din catalog și pornesc dosare pe motorul comun, cu formulare, checklist-uri, documente și aprobări specifice familiei. Contractele și produsele reutilizează semnarea mock; familia creditelor reutilizează verificările și simularea; serviciile reutilizează sursele CRM și răspunsurile aprobate. Reprezentarea, succesiunile, restricțiile și vulnerabilitatea sunt dosare de organizare și predare către specialist, cu review de supervizor obligatoriu. Nu se deduce automat validitatea juridică.

Reguli suplimentare includ: versiune curentă pentru act adițional, existența contului și a produselor de credit asociate la închidere, sumă de rambursare față de soldul mock, identificarea mandatului/comerciantului, referințe de refund/comision și perioade coerente pentru documente. Contractele se generează din șabloane demonstrative, nu din formulare bancare oficiale. Extensiile sunt implementări demonstrative pe familii; nu sunt integrări cu operațiuni bancare sau validări juridice reale.

## Arhitectură

`lib/operations/catalog.ts` definește cele 29 de workflow-uri, familiile, câmpurile, checklist-urile și tool-urile permise. `domain.ts` definește contractele Zod, stările și tranzițiile server-side. `engine.ts` execută instrumentele, regulile, clarificările, aprobările și semnarea. `documents.ts` produce documente HTML, PDF demonstrativ, hash-uri și versiuni; `api.ts` expune contractele HTTP. UI este în `components/operations-hub.tsx` și `operations-mobile.tsx`.

Profilul canonic existent este reutilizat, cu metadata operațională în `CustomerProfile.operations`. Nu există o memorie separată a clientului pentru fiecare agent. Reutilizarea câmpurilor cere selecția explicită pentru dosar; câmpurile de credit din profil respectă acordul `ELIGIBILITY` existent. Proiecțiile către agenți conțin doar câmpurile folosite. Datele introduse în dosar sunt snapshot-uri declarate, nu fapte bancare verificate automat.

Dosarele și documentele operaționale sunt criptate AES-256-GCM în `b2c_workflow_cases`; profilurile rămân în `b2c_customer_profiles`. `b2c_operation_records` conține surse financiare exclusiv sintetice. Auditul folosește tabelul append-only existent. CAS și tranzacția comună dosar/profil împiedică aprobarea unei versiuni depășite sau activarea fără semnare. Fiecare mutație cere `Idempotency-Key`; aceeași cheie cu alt payload este respinsă.

Implicit: **Demo determinist**. Cu `LLM_ENDPOINT`, `LLM_MODEL`, `LLM_API_KEY`, orchestratorul poate solicita o revizuire structurată a referințelor; validarea și regulile rămân pe server. Datele și documentele nu sunt tratate ca instrucțiuni. Fără LLM configurat nu se pretinde efectuarea unui apel AI.

## Setup și migrare

D1: aplică `drizzle/0004_light_ultragirl.sql` după migrările existente, cu aceeași comandă din README. PostgreSQL: `db/postgres/004_operations_hub.sql`, inclus automat de `npm run dev:postgres`. Păstrează cheia `PROFILE_ENCRYPTION_KEY` existentă; schimbarea ei necesită migrarea datelor criptate.

Nu sunt necesare dependențe noi. `npm run dev -- --hostname 127.0.0.1` servește toate rutele. Rolurile demo sunt selectabile de proprietarul autentificat; o integrare reală trebuie să consume identitatea și RBAC ale hostului.

## API

- `POST operations/bootstrap`; `GET workflows`, `operations/metrics`, `operations/audit`.
- `GET clients`, `GET clients/:id`.
- `GET/POST cases`, `GET cases/:id`, `POST cases/:id/actions`, `POST cases/:id/agent-runs`, `GET cases/:id/audit` sau `/timeline`.
- Acțiuni: SAVE, RUN, ADD_DOCUMENT, REQUEST_INFO, APPROVE, REJECT, REVISE, ESCALATE, SPECIALIST_REVIEW, CANCEL, RESET. Toate cer `expected_version`; resetarea și review-ul specializat cer supervizor.
- `GET cases/:id/sample?kind=...`, `/documents/:docId`, `/preview`, `/pdf`.
- `GET customer/tasks`, `GET customer/tasks/:id`, `POST customer/tasks/:id/respond`, `GET customer/documents`. Sesiune client și izolare pe client obligatorii.
- `GET approvals/pending`.
- Aliasuri: `POST contracts`, `GET contracts/:id`, `/preview`, `/versions`, `POST /generate`, `/submit-review`, `/sign-mock`; `POST credits/applications`, `GET /:id`, `POST /preassessment-mock`, `/generate-offer`, `/generate-contract`. Generarea nu aprobă documentul; aprobarea explicită se face prin acțiunea dosarului.

## Demonstrație rapidă

1. Pornește onboarding, selectează „Client sintetic nou”, completează exemplul și creează cazul. Rulează agenții fără document: lipsa este detectată.
2. Aprobă solicitarea, deschide simulatorul, completează documentul sintetic și trimite. Revino și aprobă finalizarea.
3. Din Customer 360 pornește contract de cont, completează datele și analizează. Vezi preview/PDF, aprobă și semnează mock în simulator.
4. Produsul apare în profil. Pornește credit, adaugă adeverință și extras; în scenariul CONFLICT exemplul adeverinței are venit diferit. Clarifică venitul prin simulator, revizuiește simularea și documentele, apoi aprobă ca supervizor.
5. Înregistrează o reclamație, editează și aprobă răspunsul. Clientul vede actualizarea livrată.

`node scripts/demo-walkthrough.mjs` reproduce un singur parcurs esențial în Edge. A fost verificat onboarding → contract semnat mock → produs în Customer 360 → venit contradictoriu clarificat → refuz de semnare credit → reclamație livrată, plus PDF și viewport mobil. La cererea utilizatorului, nu s-a adăugat o baterie de teste pentru toate cele 29 de fluxuri.

## Limite

TXT structurat, nu OCR pentru documente reale. PDF-ul folosește un font standard și transliterează diacriticele; preview-ul HTML păstrează româna. Semnătura mock leagă identitatea demo de hash și versiune, fără efect juridic. Nu există conexiuni la bancă, credit bureau, semnătură calificată, plăți, emitere reală de card, blocare sau modificare de sold. Scenariile sunt resetabile de supervizor; resetarea dosarului păstrează istoricul și închide produsele mock create de acel caz, fără a șterge profilul canonic verificat.
