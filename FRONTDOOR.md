# OneFront Door și Smart Branch Handoff

Extensii B2C construite în aceeași aplicație cu DisputePilot. Profilurile folosesc aceleași ID-uri sintetice de client și au legături directe către dosarele de dispută. Niciun modul B2B nu a fost creat sau modificat.

## Parcurs demonstrativ

1. Deschide **OneFront Door** și selectează Andreea Popescu (`CUST-10482`).
2. Folosește exemplul de mesaj despre schimbarea jobului, venitul de 10.500 RON, chiria de 2.000 RON și achiziția unei mașini. Procesează mesajul. Sunt propuse numai datele găsite; tipul contractului, obligațiile și bugetul nu sunt inventate.
3. Confirmă propunerile și alege explicit scopurile de reutilizare. Profilul este separat de conversație, iar câmpurile deja confirmate nu sunt cerute din nou.
4. În **Documente**, selectează succesiv identitate, adeverință salarială și extras de cont. Încarcă exemplul sintetic sau un fișier TXT în același format, extrage și confirmă câmpurile. Identitatea unui alt client, un document expirat sau unul incomplet este respins. Un câmp contradictoriu rămâne excepție până la confirmarea sursei corecte.
5. Completează bugetul de 65.000 RON. În **Profil & acorduri**, permite câmpurile necesare pentru eligibilitate și pregătirea consilierului. Poți inspecta sursa fiecărui câmp și revoca separat permisiunile.
6. Evaluează traseele. Cu vechime de trei luni, traseul standard cere șase luni, iar traseul alternativ poate fi compatibil cu regulile sintetice. Acestea nu reprezintă reguli ale unei bănci sau o aprobare de credit.
7. Deschide **Branch Handoff**, pregătește dosarul consilierului și consultă datele permise, documentele lipsă, întrebările și excepțiile.
8. Alege un interval demo și confirmă programarea. Introdu codul de check-in afișat pentru a simula confirmarea sosirii în aplicație. Un cod greșit este respins.
9. Angajatul consemnează clarificări, escaladare sau continuare cu o cerere demonstrativă și o notă. Continuarea cu o cerere demo necesită un dosar actual și un traseu compatibil cu regulile. Nu se deschide un credit real.

Profilul și programarea rezistă la refresh. Un supervizor poate reseta numai profilul selectat; auditul este păstrat și dosarul de dispută rămâne separat. Anularea sau finalizarea programării eliberează intervalul demo.

## Arhitectură și date

- `/b2c/intake`: conversație, clarificări adaptive, profil canonic, acorduri, documente, agenți și audit.
- `/b2c/branch`: dosar pentru consilier, rezultate ale regulilor, excepții, programare, check-in și rezultat uman.
- `/api/b2c/frontdoor`: API protejat de identitatea și sesiunea demo ale aplicației.
- `lib/frontdoor/domain.ts`: contractele, tipurile și validarea acțiunilor.
- `lib/frontdoor/extraction.ts`: parser determinist și provider LLM configurabil; extracție TXT pentru trei tipuri de documente sintetice.
- `lib/frontdoor/rules.ts`: reguli `intake-demo-v1`, întrebări lipsă și politici de acces per agent.
- `lib/frontdoor/engine.ts`: orchestrare, confirmare umană, consimțământ, programări și dosarul consilierului.
- `lib/frontdoor/store.ts`: agregate criptate, compare-and-swap, tranzacții atomice și unicitatea intervalelor rezervate.

`b2c_customer_profiles` păstrează agregatul canonic criptat: câmpuri, proveniență, istoricul câmpurilor, conversație, documente, consimțăminte, evaluări și programări. `b2c_branch_bookings` gestionează rezervarea atomică a intervalelor. Auditul folosește tabelul append-only existent, fără valorile câmpurilor în evenimentele de acces. Proprietarul autentificat are propriul set de profiluri și programări.

Agenții au proiecții distincte. Identity nu primește venitul; Financial Health nu primește numele. Product și Financial Health sunt limitate de scop și de intenția curentă. Appointment citește numele numai cu acord pentru handoff. Banker Copilot primește numai câmpurile aprobate pentru pregătirea consilierului. Fiecare apel înregistrează câmpurile citite și cele blocate. O revocare elimină imediat câmpul din vizualizarea dosarului și marchează dosarul pentru actualizare.

Scopurile sunt `INTAKE`, `ELIGIBILITY`, `BRANCH_HANDOFF` și `DISPUTE_SUPPORT`. Acordarea accesului la câmpurile existente nu acordă automat acces la câmpuri viitoare. Intențiile pentru contestații duc la DisputePilot; nevoile business sunt excepții pentru transfer către echipa B2B. Nu se cer date de venit pentru o simplă contestație.

## Criptare și pornire

Datele profilului și conținutul documentelor sunt criptate cu AES-256-GCM, IV aleator distinct și identitatea proprietarului ca date autentificate. Cheia `PROFILE_ENCRYPTION_KEY` are 64 de caractere hexazecimale și este păstrată ca secret runtime. Cheia nu este inclusă în surse sau în browser. Păstreaz-o stabilă; rotația necesită o migrare explicită a datelor. Fără această cheie, operațiile de profil sunt oprite cu o eroare explicită.

Pentru preview D1, adaugă cheia în fișierul local ignorat `.dev.vars`. Generează cheia o singură dată cu:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

După build, aplică doar noua migrare unei baze locale existente:

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_productive_speed_demon.sql
```

La o instalare nouă aplică în ordine și cele două migrări anterioare descrise în README. Publicarea Sites aplică migrările pe baza găzduită. Adaptorul PostgreSQL aplică separat `db/postgres/002_frontdoor.sql`; setează aceeași variabilă secretă în mediul API-ului Node.

## Limitele MVP-ului

Toate persoanele și documentele sunt sintetice. Verificarea identității din exemplu este o verificare de consistență și valabilitate, nu un serviciu KYC. Încărcarea suportă fișiere TXT cu structură explicită; OCR pentru imagini/PDF, furnizorii de identitate, CRM, EUDI Wallet și calendarele unei bănci nu sunt conectate. Programările sunt simulate în baza aplicației. LLM-ul live folosește configurația server existentă și necesită un endpoint disponibil; implicit se folosește extracția deterministă, fără a pretinde un apel AI real.

Agenții sunt componente de orchestrare în aplicație, nu agenți Codex sau servicii autonome externe. Interfața este un demo pentru operatorul autentificat, care simulează acțiunile clientului și ale consilierului; rolurile reale trebuie furnizate de aplicația gazdă înainte de o utilizare în producție.
