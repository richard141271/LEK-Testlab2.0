# LEK-TestLab2

LEK-TestLab2 er et enkelt GitHub Pages-dashboard som viser det Playwright allerede har produsert i GitHub Actions.

## Prinsipper

- Ingen backend
- Ingen egen testmotor
- Ingen egen rapportmotor
- `workflow_dispatch` styrer kjøringen
- GitHub Actions kjører testene
- Playwright leverer rapportene
- Dashboardet viser kun sannheten

## Hva dashboardet viser

- Commit som ble testet
- Dato og tidspunkt
- Antall `PASS`, `FAIL` og `SKIP`
- Hva som ble verifisert
- Hvilken brukerhandling som ble testet
- Hva som kan sjekkes manuelt
- Ved `FAIL`: feiltekst, sted, screenshot, video, trace og ferdig fiksprompt

## Test na-knapp

- Dashboardet har en `Test na`-knapp som starter eksisterende `workflow_dispatch` direkte i GitHub Actions.
- Forste gang ma du lime inn en GitHub-token med tilgang til Actions i repoet.
- Tokenet lagres kun i din egen nettleser for enklere gjenbruk.
- Løsningen bruker ingen backend og bygger ikke egen kjorelogikk.

## Lokal bruk

```bash
npm install
npx playwright install chromium
npm run test:e2e
npm run build:pages
```

Åpne deretter `.site/index.html` i nettleseren.

## GitHub Pages

1. Push repoet til GitHub.
2. Gå til `Settings` -> `Pages`.
3. Sett `Source` til `GitHub Actions`.
4. Kjør workflowen `LEK-TestLab2` manuelt via `workflow_dispatch`.

Når workflowen er ferdig, publiseres siste Playwright-kjøring til GitHub Pages.

## Viktig

Workflowen forventer at Playwright-tester ligger i `tests/`.
Hvis appen som skal testes ligger i et annet repo, kan testene fortsatt bo her, men selve dashboardet bygger ikke egen testlogikk.
