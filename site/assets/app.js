const summaryContainer = document.querySelector('#run-summary');
const metaContainer = document.querySelector('#run-meta');
const testsContainer = document.querySelector('#tests');
const linksContainer = document.querySelector('#run-links');
const template = document.querySelector('#test-card-template');
const triggerButton = document.querySelector('#trigger-test');
const triggerStatus = document.querySelector('#trigger-status');
const triggerDetails = document.querySelector('#trigger-details');

const state = {
  config: null,
  activeRunId: null
};

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

async function apiJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    let message = '';
    try {
      const errorPayload = await response.json();
      message = errorPayload.error || '';
    } catch {
      message = await response.text();
    }

    throw new Error(message || `Serveren svarte med ${response.status}`);
  }

  if (response.status === 204) return null;
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

function publicUrl(run, relativePath) {
  if (!relativePath) return null;
  if (/^https?:\/\//.test(relativePath)) return relativePath;

  const base = (run.publicBaseUrl || '').replace(/\/$/, '');
  const cleanPath = relativePath.replace(/^\/+/, '');
  return base ? `${base}/${cleanPath}` : `./${cleanPath}`;
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
    reportLink.href = publicUrl(run, run.htmlReportPath);
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
    link.href = publicUrl(run, `runs/${run.runId}/${attachment.path}`);
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = attachment.name || 'Vedlegg';
    attachments.push(link);
  }

  if (run.htmlReportPath) {
    const reportLink = document.createElement('a');
    reportLink.className = 'link-chip';
    reportLink.href = publicUrl(run, run.htmlReportPath);
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
      emptyState('Ingen Playwright-resultater ble funnet. Trykk Test na for a starte en ny kjoring.')
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

async function fetchLatestRunMetadata() {
  return apiJson('/api/dashboard/latest');
}

async function fetchReportJson(reportPath) {
  const url = `/api/dashboard/report?path=${encodeURIComponent(reportPath)}`;
  return apiJson(url);
}

async function loadDashboard(latestRunOverride = null) {
  try {
    const latestRun = latestRunOverride || (await fetchLatestRunMetadata());
    renderRunSummary(latestRun);

    if (!latestRun.reportPath) {
      testsContainer.replaceChildren(
        emptyState('Ingen rapport publisert ennå. Trykk Test na for a kjore LEK-Biens Vokter.')
      );
      return;
    }

    const report = await fetchReportJson(latestRun.reportPath);
    const tests = collectTests(report.suites || []);
    renderTests(tests, latestRun);
  } catch (error) {
    testsContainer.replaceChildren(
      emptyState(error instanceof Error ? error.message : 'Ukjent feil ved lasting av dashboard.')
    );
  }
}

async function monitorWorkflowRun(runId) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const statusPayload = await apiJson(`/api/run-status/${runId}`);
    const workflowRun = statusPayload.run;

    renderTriggerDetails([
      { label: 'Kjoring', value: `#${workflowRun.run_number}` },
      { label: 'Status', value: formatRunStatus(workflowRun) },
      { label: 'Sist oppdatert', value: formatDate(workflowRun.updated_at) }
    ]);

    if (workflowRun.status !== 'completed') {
      setTriggerStatus(`LEK-Biens Vokter testes na. Status: ${formatRunStatus(workflowRun)}.`, 'running');
      await delay(5000);
      continue;
    }

    if (statusPayload.dashboardReady && statusPayload.latestRun) {
      await loadDashboard(statusPayload.latestRun);
      setTriggerStatus('Resultatene er lastet inn i dashboardet.', 'success');
      renderTriggerDetails([
        { label: 'Kjoring', value: `#${statusPayload.latestRun.runNumber || workflowRun.run_number}` },
        { label: 'Status', value: 'Ferdig' },
        { label: 'Commit', value: statusPayload.latestRun.shortSha || 'Ukjent' }
      ]);
      setTriggerBusy(false);
      return;
    }

    setTriggerStatus('Testen er ferdig. Venter pa at resultatene publiseres til dashboardet ...', 'running');
    await delay(5000);
  }

  setTriggerStatus('Testen ble startet, men resultatene kom ikke inn i dashboardet tidsnok. Prover igjen om litt.', 'error');
  setTriggerBusy(false);
}

async function triggerWorkflow() {
  try {
    setTriggerBusy(true);
    setTriggerStatus('Starter LEK-Biens Vokter-testene ...', 'running');
    renderTriggerDetails([
      { label: 'Status', value: 'Sender startsignal' },
      { label: 'Type', value: 'GitHub Actions + Playwright' }
    ]);

    const response = await apiJson('/api/test-now', {
      method: 'POST'
    });

    state.activeRunId = response.run.id;
    await monitorWorkflowRun(response.run.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ukjent feil ved start av workflow.';
    setTriggerStatus(`Kunne ikke starte testene: ${message}`, 'error');
    setTriggerBusy(false);
  }
}

async function setupTriggerPanel() {
  try {
    state.config = await apiJson('/api/config');

    if (!state.config.hasServerTrigger) {
      setTriggerBusy(true);
      setTriggerStatus('Test na er ikke klar ennå. Serveren mangler GitHub-kobling.', 'error');
      renderTriggerDetails([
        { label: 'Branch', value: state.config.branch || 'main' },
        { label: 'Status', value: 'Mangler serveroppsett' }
      ]);
      return;
    }

    setTriggerStatus('Trykk Test na for a starte en ny test av LEK-Biens Vokter.');
    renderTriggerDetails([
      { label: 'Branch', value: state.config.branch || 'main' },
      { label: 'Status', value: 'Klar' }
    ]);

    triggerButton.addEventListener('click', () => {
      triggerWorkflow();
    });
  } catch (error) {
    setTriggerBusy(true);
    setTriggerStatus(
      error instanceof Error ? `Kunne ikke koble til serveren: ${error.message}` : 'Kunne ikke koble til serveren.',
      'error'
    );
  }
}

setupTriggerPanel();
loadDashboard();
