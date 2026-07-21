# LEK-TestLab2

LEK-TestLab2 er et enkelt GitHub Pages-dashboard som viser Playwright-resultater og fiksprompter for LEK-Biens Vokter.

## Prinsipper

- `workflow_dispatch` styrer kjøringen
- `push` til `staging` styrer kjøringen
- planlagt kjoring holder dashboardet oppdatert
- GitHub Actions kjører testene
- Playwright leverer rapportene
- Dashboardet viser kun sannheten
- Ingen backend

## Hva dashboardet viser

- Commit som ble testet
- Dato og tidspunkt
- Antall `PASS`, `FAIL` og `SKIP`
- Hva som ble verifisert
- Hvilken brukerhandling som ble testet
- Hva som kan sjekkes manuelt
- Ved `FAIL`: feiltekst, sted, screenshot, video, trace og ferdig fiksprompt

## Hvordan det kjores

- Når du pusher til `staging`, kjører GitHub Actions testene automatisk.
- Workflowen kan fortsatt kjøres manuelt fra GitHub om du ønsker det.
- I tillegg kjøres den automatisk jevnlig for å holde dashboardet oppdatert.
- Dashboardet viser siste publiserte sannhet fra Playwright.
- `main` skal være det som allerede er testet ferdig i `staging`.

## Lokal bruk

```bash
npm install
npx playwright install chromium
npm run test:e2e
npm run build:pages
```

Åpne deretter `.site/index.html`.

## Viktig

Workflowen forventer at Playwright-tester ligger i `tests/`.
Hvis appen som skal testes ligger i et annet repo, kan testene fortsatt bo her, men selve dashboardet bygger ikke egen testlogikk.
GitHub Pages må være satt opp riktig for å vise publiserte testresultater.
