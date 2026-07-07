import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const siteDir = path.join(__dirname, 'site');

const config = {
  port: Number(process.env.PORT || 3000),
  githubToken: process.env.GITHUB_TOKEN || '',
  owner: process.env.GITHUB_OWNER || 'richard141271',
  repo: process.env.GITHUB_REPO || 'LEK-Testlab2.0',
  workflowId: process.env.GITHUB_WORKFLOW_ID || 'testlab-pages.yml',
  branch: process.env.GITHUB_BRANCH || 'main',
  pagesBaseUrl:
    (process.env.PAGES_BASE_URL || 'https://richard141271.github.io/LEK-Testlab2.0').replace(/\/$/, '')
};

const app = express();
app.use(express.json());

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function requireToken() {
  if (!config.githubToken) {
    const error = new Error('Serveren mangler GITHUB_TOKEN. Sett tokenet i servermiljoet, ikke i dashboardet.');
    error.statusCode = 503;
    throw error;
  }
}

function githubHeaders(extra = {}) {
  requireToken();
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${config.githubToken}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function githubJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: githubHeaders(init.headers)
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(body || `GitHub svarte med ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

async function publicJson(relativePath) {
  const url = new URL(relativePath.replace(/^\/+/, ''), `${config.pagesBaseUrl}/`);
  const response = await fetch(url, {
    headers: {
      'Cache-Control': 'no-cache'
    }
  });

  if (!response.ok) {
    const error = new Error(`Kunne ikke lese publisert data fra ${url.pathname}`);
    error.statusCode = response.status;
    throw error;
  }

  return response.json();
}

function normalizeLatestRun(latestRun) {
  return {
    ...latestRun,
    publicBaseUrl: config.pagesBaseUrl
  };
}

async function getLatestWorkflowRun() {
  const response = await githubJson(
    `https://api.github.com/repos/${config.owner}/${config.repo}/actions/workflows/${config.workflowId}/runs?branch=${config.branch}&event=workflow_dispatch&per_page=5`
  );

  return response.workflow_runs?.[0] || null;
}

async function getWorkflowRun(runId) {
  return githubJson(`https://api.github.com/repos/${config.owner}/${config.repo}/actions/runs/${runId}`);
}

async function triggerWorkflow() {
  return githubJson(
    `https://api.github.com/repos/${config.owner}/${config.repo}/actions/workflows/${config.workflowId}/dispatches`,
    {
      method: 'POST',
      body: JSON.stringify({ ref: config.branch })
    }
  );
}

async function waitForCreatedRun(previousRunId, startedAt) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const latestRun = await getLatestWorkflowRun();
    const createdAt = latestRun ? new Date(latestRun.created_at).getTime() : 0;
    const isNewRun =
      latestRun &&
      String(latestRun.id) !== String(previousRunId || '') &&
      createdAt >= startedAt - 15000;

    if (isNewRun) return latestRun;
    await delay(3000);
  }

  const error = new Error('Fant ingen ny workflow-kjoring etter start.');
  error.statusCode = 504;
  throw error;
}

async function readFallbackLatestRun() {
  const localLatestRunPath = path.join(siteDir, 'data', 'latest-run.json');
  const raw = await readFile(localLatestRunPath, 'utf8');
  return JSON.parse(raw);
}

async function getLatestPublishedRun() {
  try {
    const latestRun = await publicJson('data/latest-run.json');
    return normalizeLatestRun(latestRun);
  } catch {
    const fallback = await readFallbackLatestRun();
    return normalizeLatestRun(fallback);
  }
}

async function getPublishedReport(reportPath) {
  if (!reportPath || typeof reportPath !== 'string') {
    const error = new Error('Mangler reportPath.');
    error.statusCode = 400;
    throw error;
  }

  const cleanPath = reportPath.replace(/^\/+/, '');
  return publicJson(cleanPath);
}

function latestRunMatchesWorkflow(latestRun, workflowRun) {
  return (
    String(latestRun.runId || '') === String(workflowRun.id || '') ||
    String(latestRun.runNumber || '') === String(workflowRun.run_number || '')
  );
}

app.get('/api/config', (_req, res) => {
  res.json({
    branch: config.branch,
    hasServerTrigger: Boolean(config.githubToken),
    pagesBaseUrl: config.pagesBaseUrl
  });
});

app.post('/api/test-now', async (_req, res, next) => {
  try {
    const previousRun = await getLatestWorkflowRun();
    const startedAt = Date.now();
    await triggerWorkflow();
    const createdRun = await waitForCreatedRun(previousRun?.id, startedAt);
    res.json({ run: createdRun });
  } catch (error) {
    next(error);
  }
});

app.get('/api/run-status/:runId', async (req, res, next) => {
  try {
    const run = await getWorkflowRun(req.params.runId);
    let latestRun = null;
    let dashboardReady = false;

    if (run.status === 'completed') {
      latestRun = await getLatestPublishedRun();
      dashboardReady = latestRunMatchesWorkflow(latestRun, run);
    }

    res.json({
      run,
      latestRun,
      dashboardReady
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/dashboard/latest', async (_req, res, next) => {
  try {
    const latestRun = await getLatestPublishedRun();
    res.json(latestRun);
  } catch (error) {
    next(error);
  }
});

app.get('/api/dashboard/report', async (req, res, next) => {
  try {
    const report = await getPublishedReport(req.query.path);
    res.json(report);
  } catch (error) {
    next(error);
  }
});

app.use(express.static(siteDir));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(siteDir, 'index.html'));
});

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    error: error.message || 'Ukjent serverfeil.'
  });
});

app.listen(config.port, () => {
  console.log(`LEK-TestLab2 server runs on http://localhost:${config.port}`);
});
