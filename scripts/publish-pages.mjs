import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const siteTemplateDir = path.join(rootDir, 'site');
const outputDir = path.join(rootDir, '.site');
const reportPath = path.join(rootDir, 'artifacts', 'results.json');
const htmlReportDir = path.join(rootDir, 'playwright-report');
const testResultsDir = path.join(rootDir, 'test-results');

const runId = process.env.GITHUB_RUN_ID || 'local-run';
const runNumber = process.env.GITHUB_RUN_NUMBER || 'local';
const commitSha = process.env.GITHUB_SHA || 'local';
const repository = process.env.GITHUB_REPOSITORY || '';
const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
const runUrl =
  repository && process.env.GITHUB_RUN_ID
    ? `${serverUrl}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : '';

async function exists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function normalizeStatus(status) {
  if (status === 'passed') return 'passed';
  if (status === 'skipped') return 'skipped';
  if (status === 'timedOut') return 'failed';
  if (status === 'interrupted') return 'failed';
  return 'failed';
}

function collectTests(suites, parentTitles = []) {
  const collected = [];

  for (const suite of suites || []) {
    const nextTitles = suite.title ? [...parentTitles, suite.title] : parentTitles;
    collected.push(...collectTests(suite.suites || [], nextTitles));

    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const results = test.results || [];
        const finalResult = results.at(-1) || {};
        const status = normalizeStatus(finalResult.status || (test.ok ? 'passed' : 'failed'));
        collected.push({
          id: `${spec.id || spec.title}-${test.projectName || 'default'}`,
          title: [...nextTitles, spec.title].filter(Boolean).join(' > '),
          projectName: test.projectName || 'default',
          file: spec.file || suite.file || '',
          line: spec.line || null,
          column: spec.column || null,
          tags: spec.tags || [],
          ok: Boolean(test.ok),
          status,
          duration: finalResult.duration || 0,
          annotations: test.annotations || [],
          results
        });
      }
    }
  }

  return collected;
}

function summarizeTests(tests) {
  return tests.reduce(
    (summary, test) => {
      summary.total += 1;
      if (test.status === 'passed') summary.passed += 1;
      else if (test.status === 'skipped') summary.skipped += 1;
      else summary.failed += 1;
      return summary;
    },
    { total: 0, passed: 0, failed: 0, skipped: 0 }
  );
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  await cp(siteTemplateDir, outputDir, { recursive: true });

  const latestDataPath = path.join(outputDir, 'data');
  const runBaseDir = path.join(outputDir, 'runs', String(runId));
  await mkdir(latestDataPath, { recursive: true });
  await mkdir(runBaseDir, { recursive: true });

  if (!(await exists(reportPath))) {
    const emptySummary = {
      runId,
      runNumber,
      commitSha,
      shortSha: commitSha.slice(0, 7),
      generatedAt: new Date().toISOString(),
      runUrl,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      reportPath: null,
      htmlReportPath: null
    };
    await writeFile(path.join(outputDir, 'data', 'latest-run.json'), JSON.stringify(emptySummary, null, 2));
    return;
  }

  const reportRaw = await readFile(reportPath, 'utf8');
  const reportJson = JSON.parse(reportRaw);
  const tests = collectTests(reportJson.suites || []);
  const summary = summarizeTests(tests);

  await cp(reportPath, path.join(runBaseDir, 'report.json'));

  if (await exists(htmlReportDir)) {
    await cp(htmlReportDir, path.join(runBaseDir, 'playwright-report'), { recursive: true });
  }

  if (await exists(testResultsDir)) {
    await cp(testResultsDir, path.join(runBaseDir, 'test-results'), { recursive: true });
  }

  const latestRun = {
    runId,
    runNumber,
    commitSha,
    shortSha: commitSha.slice(0, 7),
    generatedAt: new Date().toISOString(),
    runUrl,
    summary,
    reportPath: `runs/${runId}/report.json`,
    htmlReportPath: `runs/${runId}/playwright-report/index.html`
  };

  await writeFile(path.join(outputDir, 'data', 'latest-run.json'), JSON.stringify(latestRun, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
