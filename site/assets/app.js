const summaryContainer = document.querySelector('#run-summary');
const metaContainer = document.querySelector('#run-meta');
const testsContainer = document.querySelector('#tests');
const linksContainer = document.querySelector('#run-links');
const template = document.querySelector('#test-card-template');
const tokenInput = document.querySelector('#github-token');
const triggerButton = document.querySelector('#trigger-test');
const clearTokenButton = document.querySelector('#clear-token');
const triggerStatus = document.querySelector('#trigger-status');
const triggerDetails = document.querySelector('#trigger-details');

const githubConfig = {
  owner: 'richard141271',
  repo: 'LEK-Testlab2.0',
  workflowId: 'testlab-pages.yml',
  branch: 'main',
  tokenStorageKey: 'lek-testlab2-github-token'
};

let activeSessionId = 0;

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

function setTriggerStatus(message, tone = 'default') {
  triggerStatus.textContent = message;
  if (tone === 'default') {
    delete triggerStatus.dataset.tone;
    return;
  }

  triggerStatus.dataset.tone = tone;
}

function setTriggerBusy(isBusy) {
  triggerButton.disabled = isBusy;
  clearTokenButton.disabled = isBusy;
  tokenInput.disabled = isBusy;
}

function renderTriggerDetails(items = []) {
  if (!items.length) {
    triggerDetails.replaceChildren();
    return;
  }

  triggerDetails.replaceChildren(...items.map((item) => createDetail(item.label, item.value)));
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function withTimestamp(url) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}ts=${Date.now()}`;
}

function createGitHubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

async function fetchGitHubJson(url, token) {
  const response = await fetch(url, {
    headers: createGitHubHeaders(token)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || `GitHub svarte med ${response.status}`);
  }

  return response.json();
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

function formatRunStatus(run) {
  if (run.status === 'queued') return 'I ko';
  if (run.status === 'in_progress') return 'Kjorer';
  if (run.status === 'completed') {
    if (run.conclusion === 'success') return 'Fullfort';
    if (run.conclusion === 'failure') return 'Feilet';
    if (run.conclusion === 'cancelled') return 'Avbrutt';
    if (run.conclusion === 'skipped') return 'Hoppet over';
    return run.conclusion || 'Fullfort';
  }

  return run.status || 'Ukjent';
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

function getStoredToken() {
  return window.localStorage.getItem(githubConfig.tokenStorageKey) || '';
}

function storeToken(value) {
  window.localStorage.setItem(githubConfig.tokenStorageKey, value);
}

function clearStoredToken() {
  window.localStorage.removeItem(githubConfig.tokenStorageKey);
}

async function fetchLatestWorkflowRun(token) {
  const response = await fetchGitHubJson(
    `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/actions/workflows/${githubConfig.workflowId}/runs?branch=${githubConfig.branch}&event=workflow_dispatch&per_page=5`,
    token
  );

  return response.workflow_runs?.[0] || null;
}

async function fetchWorkflowRun(token, runId) {
  return fetchGitHubJson(
    `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/actions/runs/${runId}`,
    token
  );
}

async function waitForTriggeredRun(token, previousRunId, startedAt, sessionId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (sessionId !== activeSessionId) return null;

    const latestRun = await fetchLatestWorkflowRun(token);
    const createdAt = latestRun ? new Date(latestRun.created_at).getTime() : 0;
    const isNewRun =
      latestRun &&
      String(latestRun.id) !== String(previousRunId || '') &&
      createdAt >= startedAt - 15000;

    if (isNewRun) {
      return latestRun;
    }

    setTriggerStatus('Testen blir opprettet i GitHub Actions ...', 'running');
    renderTriggerDetails([
      { label: 'Branch', value: githubConfig.branch },
      { label: 'Status', value: 'Venter pa ny kjoring' },
      { label: 'Forsok', value: String(attempt + 1) }
    ]);
    await delay(3000);
  }

  throw new Error('Fant ingen ny workflow-kjoring. Sjekk at tokenet har tilgang til Actions.');
}

async function waitForPublishedResults(expectedRun, sessionId) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (sessionId !== activeSessionId) return false;

    const latestRun = await fetchLatestRunMetadata();
    const sameRun =
      String(latestRun.runId || '') === String(expectedRun.id) ||
      String(latestRun.runNumber || '') === String(expectedRun.run_number || '');

    if (sameRun) {
      await loadDashboard({ latestRun });
      renderTriggerDetails([
        { label: 'Kjoring', value: `#${latestRun.runNumber || expectedRun.run_number}` },
        { label: 'Status', value: 'Resultater lastet inn' },
        { label: 'Commit', value: latestRun.shortSha || 'Ukjent' }
      ]);
      setTriggerStatus('Resultatene er lastet inn i dashboardet.', 'success');
      return true;
    }

    setTriggerStatus('Testen er ferdig. Venter pa at dashboarddata publiseres ...', 'running');
    renderTriggerDetails([
      { label: 'Kjoring', value: `#${expectedRun.run_number}` },
      { label: 'Status', value: 'Publiserer resultater' },
      { label: 'Forsok', value: String(attempt + 1) }
    ]);
    await delay(5000);
  }

  setTriggerStatus('Testen er ferdig, men GitHub Pages er ikke oppdatert enna. Vent litt og trykk oppdater.', 'error');
  return false;
}

async function monitorWorkflowRun(token, initialRun, sessionId) {
  let currentRun = initialRun;

  while (sessionId === activeSessionId) {
    currentRun = await fetchWorkflowRun(token, currentRun.id);
    renderTriggerDetails([
      { label: 'Kjoring', value: `#${currentRun.run_number}` },
      { label: 'Status', value: formatRunStatus(currentRun) },
      { label: 'Sist oppdatert', value: formatDate(currentRun.updated_at) }
    ]);

    if (currentRun.status === 'completed') {
      setTriggerStatus(`Testen er ferdig med status ${formatRunStatus(currentRun)}. Henter Playwright-resultater ...`, 'running');
      await waitForPublishedResults(currentRun, sessionId);
      return;
    }

    setTriggerStatus(`LEK-Biens Vokter testes na. Status: ${formatRunStatus(currentRun)}.`, 'running');
    await delay(5000);
  }
}

async function fetchLatestRunMetadata() {
  const latestRunResponse = await fetch(withTimestamp('./data/latest-run.json'), { cache: 'no-store' });
  if (!latestRunResponse.ok) throw new Error('Kunne ikke lese latest-run.json');
  return latestRunResponse.json();
}

async function triggerWorkflow() {
  const token = tokenInput.value.trim();
  if (!token) {
    setTriggerStatus('Legg inn en GitHub-token for a starte testene.', 'error');
    tokenInput.focus();
    return;
  }

  const sessionId = Date.now();
  activeSessionId = sessionId;
  setTriggerBusy(true);
  setTriggerStatus('Starter LEK-Biens Vokter-testene i GitHub Actions ...', 'running');
  renderTriggerDetails([
    { label: 'Branch', value: githubConfig.branch },
    { label: 'Status', value: 'Sender workflow_dispatch' }
  ]);

  try {
    const previousRun = await fetchLatestWorkflowRun(token);
    const startedAt = Date.now();
    const response = await fetch(
      `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/actions/workflows/${githubConfig.workflowId}/dispatches`,
      {
        method: 'POST',
        headers: createGitHubHeaders(token),
        body: JSON.stringify({
          ref: githubConfig.branch
        })
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(errorBody || `GitHub svarte med ${response.status}`);
    }

    storeToken(token);
    const createdRun = await waitForTriggeredRun(token, previousRun?.id, startedAt, sessionId);
    if (!createdRun) return;

    await monitorWorkflowRun(token, createdRun, sessionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ukjent feil ved start av workflow.';
    setTriggerStatus(`Kunne ikke starte testene: ${message}`, 'error');
  } finally {
    if (sessionId === activeSessionId) {
      setTriggerBusy(false);
    }
  }
}

function setupTriggerPanel() {
  const storedToken = getStoredToken();
  if (storedToken) {
    tokenInput.value = storedToken;
    setTriggerStatus('Klar til a starte testene. Lagret token er lastet inn.');
  }

  tokenInput.addEventListener('change', () => {
    const token = tokenInput.value.trim();
    if (token) {
      storeToken(token);
      setTriggerStatus('Token lagret lokalt. Trykk Test na for a kjore workflowen.');
    }
  });

  triggerButton.addEventListener('click', () => {
    triggerWorkflow();
  });

  clearTokenButton.addEventListener('click', () => {
    clearStoredToken();
    tokenInput.value = '';
    setTriggerStatus('Lagret token er slettet fra denne nettleseren.');
  });
}

async function loadDashboard() {
  try {
    const latestRun = await fetchLatestRunMetadata();

    renderRunSummary(latestRun);

    if (!latestRun.reportPath) {
      testsContainer.replaceChildren(
        emptyState('Ingen rapport publisert ennå. Kjor workflow_dispatch for a generere Playwright-data.')
      );
      return;
    }

    const reportResponse = await fetch(withTimestamp(`./${latestRun.reportPath}`), { cache: 'no-store' });
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

setupTriggerPanel();
loadDashboard();
