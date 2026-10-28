# Verificare executată — 28 octombrie 2026

- TypeScript: `npm run typecheck` — trecut, fără erori.
- Domeniu și integrare SQL/API: `npm test` — **23/23 trecute**.
- Playwright în Microsoft Edge: `npm run test:e2e` — **5/5 trecute**, ultima rulare 33,4 secunde.
- PostgreSQL 17 în Docker: `npm run test:postgres` — **1/1 trecut**, cu scenariile A/B/C, persistență, compare-and-swap concurent și audit append-only. Ultima rulare a persistat 89 de evenimente imutabile pentru proprietarul sintetic de test.

## Acoperire verificată

Plată nerecunoscută → colectare dovezi → întrebări editate → aprobare → refresh fără pierdere de stare → simulator → răspunsuri → reinvestigare → aprobare traseu → închidere de supervizor → audit. Plata duplicată folosește instrumentul dedicat; două autorizări/o singură decontare nu confirmă duplicarea. Dovezile contradictorii escaladează.

Testele mai verifică validarea JSON și a referințelor, lipsa trimiterilor înainte de aprobare, idempotency, conflicte de versiune, cereri expirate, răspunsuri incomplete, roluri și izolare între proprietari, prompt injection ca date, LLM indisponibil, timeout de instrument și recuperarea explicită a defecțiunii demo. Resetarea păstrează auditul.

Interfața a fost verificată la 1440×1000 și 390×844. Capturi în `outputs/`: inbox desktop/mobil, investigație desktop și simulator mobil. Rapoartele Playwright și capturile sunt fișiere locale ignorate de Git.

## Probleme corectate în verificare

Selectors E2E au fost făcuți exacți pentru rolul desktop/mobil și compatibili cu auditul istoric păstrat după resetare. Preview-ul a fost repornit după invalidarea grafului CSS în timpul reformătării; a fost confirmată încărcarea foii de stil înainte de rerulare. Fișierele de rapoarte sunt excluse din watch pentru a evita reîncărcarea paginilor în timpul testelor. Erorile investigației afișează stare și notificare de eroare, fără toast fals de succes. Solicitarea de revizuire creează efectiv o rundă nouă, iar rezultatul final al investigației este păstrat pentru replay idempotent.

## Limite

Nu a fost configurat sau apelat un serviciu LLM real; providerul live este implementat și erorile sale sunt testate cu răspunsuri simulate. Modul implicit este etichetat explicit „Motor demo determinist”. Găzduirea Sites utilizează D1, iar PostgreSQL este verificat separat pentru rulare locală/backend Node. Modelul de persistență folosește agregate JSON versionate și audit separat, conform explicației din README. Rolurile sunt intenționat selectabile de proprietar în acest demo; nu sunt IAM de producție.

Instrucțiunile complete de pornire, variabilele server și pașii demo sunt în README.md.
