# LEK-TestLab2

LEK-TestLab2 er et enkelt dashboard som starter GitHub Actions, viser Playwright-resultater og lager fiksprompter for LEK-Biens Vokter.

## Prinsipper

- `workflow_dispatch` styrer kjøringen
- GitHub Actions kjører testene
- Playwright leverer rapportene
- Dashboardet viser kun sannheten
- Dashboardet skjuler GitHub-tokenet fra brukeren ved a bruke server-side oppsett

## Hva dashboardet viser

- Commit som ble testet
- Dato og tidspunkt
- Antall `PASS`, `FAIL` og `SKIP`
- Hva som ble verifisert
- Hvilken brukerhandling som ble testet
- Hva som kan sjekkes manuelt
- Ved `FAIL`: feiltekst, sted, screenshot, video, trace og ferdig fiksprompt

## Test na-knapp

- Dashboardet har en `Test na`-knapp som starter eksisterende `workflow_dispatch`.
- GitHub-token ligger pa serveren, ikke i dashboardet.
- Dashboardet folger kjoringen og henter resultatene tilbake automatisk.
- `FAIL` viser feiltekst, vedlegg og ferdig fiksprompt for produktfiks.

## Lokal bruk

```bash
npm install
GITHUB_TOKEN=din_github_token npm start
npx playwright install chromium
npm run test:e2e
npm run build:pages
```

Åpne deretter `http://localhost:3000`.

## Produksjon

- Repoet inneholder en ferdig [render.yaml](file:///Users/jornsmackbookpro/Documents/trae_projects/LEK-Testlab2/render.yaml) for deploy av dashboard-serveren.
- Webtjenesten kjører dashboardet og skjuler GitHub-tokenet fra brukeren.
- `Test na` fungerer fra den deployede URL-en sa snart `GITHUB_TOKEN` er satt i hosten.
- Resultatene hentes fra publiserte Playwright-data pa GitHub Pages.

### Render-oppsett

1. Koble repoet til Render.
2. Opprett en ny Blueprint fra repoet.
3. La Render lese `render.yaml`.
4. Sett `GITHUB_TOKEN` i Render som hemmelig miljovariabel.
5. Deploy Blueprint.

### Etter deploy

- Aapne Render-URL-en for tjenesten.
- Sjekk `/health` for a bekrefte at serveren svarer.
- Trykk `Test na` i dashboardet.
- Dashboardet folger GitHub Actions-kjoringen og henter PASS, FAIL, SKIP og fiksprompter automatisk.

## Miljo

- `GITHUB_TOKEN`: server-side token med tilgang til a starte Actions og lese workflow-runs
- `PAGES_BASE_URL`: offentlig URL der publiserte Playwright-resultater ligger

## Viktig

Workflowen forventer at Playwright-tester ligger i `tests/`.
Hvis appen som skal testes ligger i et annet repo, kan testene fortsatt bo her, men selve dashboardet bygger ikke egen testlogikk.
Den deployede serveren krever fortsatt at GitHub Pages er satt opp riktig for a kunne lese publiserte testresultater.
