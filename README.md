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

## Miljo

- `GITHUB_TOKEN`: server-side token med tilgang til a starte Actions og lese workflow-runs
- `PAGES_BASE_URL`: offentlig URL der publiserte Playwright-resultater ligger

## Viktig

Workflowen forventer at Playwright-tester ligger i `tests/`.
Hvis appen som skal testes ligger i et annet repo, kan testene fortsatt bo her, men selve dashboardet bygger ikke egen testlogikk.
