# Verificare — 28 octombrie 2026

DisputePilot, OneFront Door și Smart Branch Handoff.

## Rezultate executate

- TypeScript: `npm run typecheck` — trecut, fără erori.
- `npm test` — **39/39 trecute**: 23 pentru dispute și 16 pentru profil și handoff.
- `npm run test:e2e` — **9/9 trecute** în Edge: 5 pentru dispute și 4 pentru noile module. Ultima rulare integrală: 1,4 minute.
- `npm run test:postgres` — **1/1 trecut**, cu dispute, compare-and-swap concurent, audit imutabil, profil criptat, confirmare intake și programare pe PostgreSQL real în Docker.

Build-ul și pachetul pentru publicare sunt produse din același commit prin helper-ul Sites.

## Acoperire

**Dispute:** plată nerecunoscută, întrebări editate, aprobare, refresh, răspunsuri client, reinvestigare, traseu aprobat, închidere demo și audit. Sunt acoperite și decontările distincte, autorizările fără două decontări, contradicții, roluri, idempotency, versiuni expirate, răspunsuri incomplete, LLM indisponibil, JSON invalid, prompt injection și timeout de instrument.

**OneFront Door:** mesaj în română, extracție fără date inventate, confirmare umană, consimțământ separat, trei tipuri de documente, profil unic cu proveniență și reguli deterministe. Documentele expirate sau aparținând altui profil sunt respinse. Un upload TXT real este verificat în browser. Contradicțiile cer alegerea sursei corecte. Identity și Financial Health primesc proiecții diferite ale profilului.

**Branch Handoff:** dosar din câmpuri permise, programare, cod greșit respins, check-in valid, rezultat decis de angajat și persistență după refresh. Revocarea acordului elimină venitul din dosar și marchează dosarul pentru actualizare. Continuarea cu o cerere demo este blocată dacă dosarul este neactual. O contestație nu cere venituri și nu pornește un agent de credit.

**Protecții:** AES-256-GCM, date autentificate pe proprietar, ciphertext fără nume lizibil, conflicte de versiune, unicitatea rezervărilor, retragerea câmpurilor dependente de documente respinse și resetare cu audit păstrat. Scrierile de audit adaugă numai evenimentele noi.

## Verificare vizuală

Rezoluții 1440×1000 și 390×844: inbox, investigație, simulator, OneFront Door și Branch Handoff. Nu există overflow al paginii în testele mobile. Capturile și raportul Playwright sunt în `outputs/`, ignorat de Git.

Corecții în QA: selectorul de rol a fost dezactivat până la încărcarea sesiunii; testele așteaptă salvarea acordurilor pe server; auditul acceptă istoricul păstrat după resetare; erorile nu afișează succes fals; dosarele neactuale sunt blocate pentru continuare.

## Limite

Date exclusiv sintetice. Parser TXT pentru documente; OCR PDF/imagini, KYC extern, CRM, EUDI Wallet și calendare bancare reale nu sunt conectate. LLM-ul live este configurabil și nu a fost apelat în aceste teste. Implicit se folosește motorul determinist. Rolurile și acțiunile clientului/consilierului sunt simulate pentru operator; IAM de producție trebuie integrat cu aplicația gazdă.

Instrucțiuni: README.md și FRONTDOOR.md.
