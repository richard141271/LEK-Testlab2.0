const summaryContainer = document.querySelector('#run-summary');
const metaContainer = document.querySelector('#run-meta');
const testsContainer = document.querySelector('#tests');
const linksContainer = document.querySelector('#run-links');
const template = document.querySelector('#test-card-template');

function createMetric(label, value) {
  const element = document.createElement('div');
  element.className = 'metric';
  element.innerHTML = `<span class="metric-label">${label}</span><span class="metric-value">${value}</span>`;
  return element;
}

function createDetail(label, value) {
  const element = document.createElement('div');
  element.className = 'detail';
  element.innerHTML = `<span class="detail-label">${label}</span><span class="detail-value">${value}</span>`;
  return element;
}

function emptyState(message) {
  const element = document.createElement('div');
  element.className = 'empty';
  element.textContent = message;
  return element;
}

function relativeAssetPath(assetPath) {
  if (!assetPath) return null;
  const normalized = assetPath.replaceAll('\\', '/');
  const marker = normalized.lastIndexOf('test-results/');
  return marker >= 0 ? normalized.slice(marker) : normalized;
}

function normalizeStatus(status) {
  if (status === 'passed') return 'passed';
  if (status === 'skipped') return 'skipped';
  return 'failed';
}

function collectTests(suites, parentTitles = []) {
  const items = [];

  for (const suite of suites || []) {
    const nextTitles = suite.title ? [...parentTitles, suite.title] : parentTitles;
    items.push(...collectTests(suite.suites || [], nextTitles));

    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const finalResult = (test.results || []).at(-1) || {};
        const status = normalizeStatus(finalResult.status || (test.ok ? 'passed' : 'failed'));
        const attachments = (finalResult.attachments || []).map((attachment) => ({
          name: attachment.name,
          contentType: attachment.contentType,
          path: relativeAssetPath(attachment.path)
        }));
        const errorText =
          (finalResult.error && finalResult.error.message) ||
          (finalResult.errors || []).map((entry) => entry.message).filter(Boolean).join('\n\n') ||
          '';

        items.push({
          title: [...nextTitles, spec.title].filter(Boolean).join(' > '),
          status,
          projectName: test.projectName || 'default',
          file: spec.file || suite.file || 'Ukjent fil',
          line: spec.line || '',
          tags: spec.tags || [],
          duration: finalResult.duration || 0,
          attachments,
          errorText
        });
      }
    }
  }

  return items;
}

function formatDate(value) {
  if (!value) return 'Ukjent';
  return new Intl.DateTimeFormat('nb-NO', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function toFixPrompt(test, run) {
  const likelyFiles = [test.file].filter(Boolean).join(', ') || 'Ukjente filer';
  const actual = test.errorText || 'Se Playwright-rapport for eksakt feiltekst.';

  return [
    'Lag en ekte produktfiks. Ikke fiks testen.',
    '',
    `Brukerhandling: ${test.title}`,
    `Forventet: At flyten beskrevet i testen "${test.title}" fullfores uten feil.`,
    `Faktisk: ${actual}`,
    `Hvor skjedde det: ${test.file}${test.line ? `:${test.line}` : ''}`,
    `Commit: ${run.shortSha}`,
    `Sannsynlige filer eller komponenter a undersoke: ${likelyFiles}`,
    'Krav: Finn og rett den underliggende produktfeilen, behold testen som sann kvalitetsvakt.'
  ].join('\n');
}

function renderRunSummary(run) {
  summaryContainer.replaceChildren(
    createMetric('Commit', run.shortSha || 'Ukjent'),
    createMetric('Kjort', formatDate(run.generatedAt)),
    createMetric('PASS', String(run.summary?.passed ?? 0)),
    createMetric('FAIL', String(run.summary?.failed ?? 0)),
    createMetric('SKIP', String(run.summary?.skipped ?? 0))
  );

  metaContainer.replaceChildren(
    createDetail('Kjoring', `#${run.runNumber || run.runId || 'ukjent'}`),
    createDetail('Totalt', String(run.summary?.total ?? 0)),
    createDetail('GitHub Actions', run.runUrl ? 'Tilgjengelig' : 'Mangler'),
    createDetail('Playwright HTML', run.htmlReportPath ? 'Tilgjengelig' : 'Mangler')
  );

  const links = [];

  if (run.runUrl) {
    const actionLink = document.createElement('a');
    actionLink.className = 'link-chip';
    actionLink.href = run.runUrl;
    actionLink.target = '_blank';
    actionLink.rel = 'noreferrer';
    actionLink.textContent = 'GitHub Actions';
    links.push(actionLink);
  }

  if (run.htmlReportPath) {
    const reportLink = document.createElement('a');
    reportLink.className = 'link-chip';
    reportLink.href = `./${run.htmlReportPath}`;
    reportLink.target = '_blank';
    reportLink.rel = 'noreferrer';
    reportLink.textContent = 'Playwright-rapport';
    links.push(reportLink);
  }

  linksContainer.replaceChildren(...links);
}

function renderAttachments(container, test, run) {
  const attachments = [];

  for (const attachment of test.attachments) {
    if (!attachment.path) continue;
    const link = document.createElement('a');
    link.className = 'link-chip';
    link.href = `./runs/${run.runId}/${attachment.path}`;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = attachment.name || 'Vedlegg';
    attachments.push(link);
  }

  if (run.htmlReportPath) {
    const reportLink = document.createElement('a');
    reportLink.className = 'link-chip';
    reportLink.href = `./${run.htmlReportPath}`;
    reportLink.target = '_blank';
    reportLink.rel = 'noreferrer';
    reportLink.textContent = 'Apen i HTML-rapport';
    attachments.push(reportLink);
  }

  container.replaceChildren(...attachments);
}

function renderTests(items, run) {
  if (!items.length) {
    testsContainer.replaceChildren(
      emptyState('Ingen Playwright-resultater ble funnet. Kjor workflow_dispatch for a publisere en kjoring.')
    );
    return;
  }

  const cards = items.map((test) => {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector('.test-card');
    const status = fragment.querySelector('.status-pill');
    const project = fragment.querySelector('.project-pill');
    const title = fragment.querySelector('.test-title');
    const file = fragment.querySelector('.test-file');
    const detailGrid = fragment.querySelector('.detail-grid');
    const attachmentRow = fragment.querySelector('.attachment-row');
    const fixPrompt = fragment.querySelector('.fix-prompt');

    status.dataset.status = test.status;
    status.textContent = test.status.toUpperCase();
    project.textContent = test.projectName;
    title.textContent = test.title;
    file.textContent = `${test.file}${test.line ? `:${test.line}` : ''}`;

    const manualCheck = `Gjenta flyten "${test.title}" manuelt og sammenlign med commit ${run.shortSha}.`;
    const verifiedText = test.status === 'passed' ? test.title : 'Flyten feilet og krever produktfiks.';

    detailGrid.replaceChildren(
      createDetail('Hva ble verifisert', verifiedText),
      createDetail('Brukerhandling', test.title),
      createDetail('Manuell kontroll', manualCheck),
      createDetail('Hva feilet', test.errorText || 'Ingen feiltekst registrert')
    );

    renderAttachments(attachmentRow, test, run);

    if (test.status === 'failed') {
      fixPrompt.textContent = toFixPrompt(test, run);
    } else {
      fixPrompt.textContent = `Ingen fiksprompt nodvendig. Testen endte som ${test.status.toUpperCase()}.`;
    }

    return card;
  });

  testsContainer.replaceChildren(...cards);
}

async function loadDashboard() {
  try {
    const latestRunResponse = await fetch('./data/latest-run.json', { cache: 'no-store' });
    if (!latestRunResponse.ok) throw new Error('Kunne ikke lese latest-run.json');
    const latestRun = await latestRunResponse.json();

    renderRunSummary(latestRun);

    if (!latestRun.reportPath) {
      testsContainer.replaceChildren(
        emptyState('Ingen rapport publisert ennå. Kjor workflow_dispatch for a generere Playwright-data.')
      );
      return;
    }

    const reportResponse = await fetch(`./${latestRun.reportPath}`, { cache: 'no-store' });
    if (!reportResponse.ok) throw new Error('Kunne ikke lese Playwright JSON-rapporten');
    const report = await reportResponse.json();
    const tests = collectTests(report.suites || []);
    renderTests(tests, latestRun);
  } catch (error) {
    testsContainer.replaceChildren(
      emptyState(error instanceof Error ? error.message : 'Ukjent feil ved lasting av dashboard.')
    );
  }
}

loadDashboard();
