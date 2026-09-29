import { chromium } from "playwright";
import XLSX from "xlsx";

const JOB_ID = process.env.AUTOFIND_JOB_ID;
const STAGE = process.env.AUTOFIND_STAGE || "initial";
const WORKER_URL = process.env.AUTOFIND_WORKER_URL;
const TOKEN = process.env.GITHUB_ACTIONS_TOKEN;

if (!JOB_ID || !WORKER_URL || !TOKEN) {
  throw new Error("Missing required AutoFind environment variables.");
}

async function getJob() {
  const response = await fetch(
    `${WORKER_URL}/api/execute/job?jobId=${encodeURIComponent(JOB_ID)}`,
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Could not retrieve job: ${response.status} ${await response.text()}`
    );
  }

  return response.json();
}

async function callback(payload) {
  const response = await fetch(
    `${WORKER_URL}/api/execute/callback`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jobId: JOB_ID,
        ...payload,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Callback failed: ${response.status} ${await response.text()}`
    );
  }

  return response.json();
}

function findHumanCheckpoint(workflowSteps) {
  return workflowSteps.findIndex(
    (step) =>
      step?.type === "human_judgment" ||
      step?.humanRequired === true
  );
}

function buildExecutionSteps(workflowSteps, completedUntil = -1) {
  return workflowSteps.map((step, index) => ({
    step: index + 1,
    description: step.description,
    type: step.type,
    method: step.method,
    status: index <= completedUntil ? "completed" : "pending",
  }));
}

function extractQuery(description) {
  const match = description.match(
    /(?:search|look|find).*?(?:for|on)\s+(.*)$/i
  );

  return match ? match[1].trim() : "remote jobs";
}

async function searchLinkedIn(page, description) {
  const query = extractQuery(description);

  const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(
    query
  )}&f_WT=2`;

  console.log("AUTOFIND: LinkedIn search:", url);

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await page.waitForTimeout(4000);

  const listings = await page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll(
        "li.jobs-search-results__list-item, li.scaffold-layout__list-item"
      )
    );

    return cards.map((card) => {
      const title =
        card.querySelector(
          ".base-search-card__title, .job-card-list__title, h3"
        )?.textContent?.trim() || "";

      const company =
        card.querySelector(
          ".base-search-card__subtitle, .job-card-container__company-name, h4"
        )?.textContent?.trim() || "";

      const link =
        card.querySelector("a.base-card__full-link, a[href*='/jobs/view/']")
          ?.href || "";

      return {
        company,
        job_title: title,
        url: link,
      };
    });
  });

  return listings.filter(
    (item) => item.company && item.job_title && item.url
  );
}

async function extractRowsFromInput(rows) {
  return Array.isArray(rows)
    ? rows.filter(
        (row) =>
          row &&
          typeof row === "object"
      )
    : [];
}

function normalizeRow(row) {
  return {
    company:
      row.company ||
      row.company_name ||
      row.Company ||
      "",
    job_title:
      row.job_title ||
      row.title ||
      row["Job Title"] ||
      "",
    url:
      row.url ||
      row.URL ||
      "",
    website:
      row.website ||
      "",
    website_status:
      row.website_status ||
      "",
    website_title:
      row.website_title ||
      "",
  };
}

function dedupeRows(rows) {
  const seen = new Set();

  return rows
    .map(normalizeRow)
    .filter((row) => {
      const key =
        row.url ||
        `${row.company.toLowerCase()}|${row.job_title.toLowerCase()}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

async function inspectCompanyWebsite(page, row) {
  if (!row.url) {
    return {
      ...row,
      website_status: "No job URL",
    };
  }

  try {
    await page.goto(row.url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForTimeout(1500);

    const companyLink = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a[href]"));

      const preferred = links.find((link) => {
        const text = link.textContent?.trim().toLowerCase() || "";
        const href = link.href || "";

        return (
          (text.includes("company") ||
            text.includes("website") ||
            text.includes("visit")) &&
          href.startsWith("http")
        );
      });

      return preferred?.href || "";
    });

    if (!companyLink) {
      return {
        ...row,
        website_status: "No company website found",
      };
    }

    await page.goto(companyLink, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForTimeout(1000);

    const pageInfo = await page.evaluate(() => ({
      title: document.title || "",
      text: document.body?.innerText?.slice(0, 1000) || "",
    }));

    return {
      ...row,
      website: companyLink,
      website_status: "Checked",
      website_title: pageInfo.title,
    };
  } catch (error) {
    return {
      ...row,
      website_status:
        error instanceof Error ? error.message : "Website check failed",
    };
  }
}

async function createExcel(rows) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "AutoFind Results"
  );

  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });

  return Buffer.from(buffer).toString("base64");
}

async function runInitial(job) {
  const payload = job.payload || {};
  const workflowSteps = payload.workflowSteps || [];
  const rows = await extractRowsFromInput(payload.rows);

  const humanIndex = findHumanCheckpoint(workflowSteps);

  const browser = await chromium.launch({
    headless: true,
  });

  const page = await browser.newPage();

  try {
    let candidates = rows;

    const searchStep = workflowSteps.find(
      (step) =>
        step?.method === "browser" &&
        /linkedin/i.test(step?.description || "")
    );

    if (searchStep) {
      try {
        const listings = await searchLinkedIn(
          page,
          searchStep.description
        );

        if (listings.length > 0) {
          candidates = listings;
        }
      } catch (error) {
        console.log(
          "AUTOFIND: LinkedIn search failed:",
          error instanceof Error ? error.message : error
        );
      }
    }

    candidates = dedupeRows(candidates).slice(0, 50);

    const execution = buildExecutionSteps(
      workflowSteps,
      humanIndex > 0 ? humanIndex - 1 : -1
    );

    await callback({
      status: "waiting_for_human",
      stage: "initial",
      result: {
        paused: true,
        candidates,
        execution,
        message:
          "Automation paused — your decision is needed.",
      },
    });
  } finally {
    await browser.close();
  }
}

async function runResume(job) {
  const payload = job.payload || {};
  const workflowSteps = payload.workflowSteps || [];
  const approvedRows = Array.isArray(payload.approvedRows)
    ? payload.approvedRows
    : [];

  const browser = await chromium.launch({
    headless: true,
  });

  const page = await browser.newPage();

  try {
    const checkedRows = [];

    for (const row of approvedRows) {
      const normalized = normalizeRow(row);
      const checked = await inspectCompanyWebsite(
        page,
        normalized
      );

      checkedRows.push(checked);
    }

    const finalRows = dedupeRows(checkedRows);

    const excelBase64 = await createExcel(finalRows);

    const execution = buildExecutionSteps(
      workflowSteps,
      workflowSteps.length - 1
    );

    await callback({
      status: "completed",
      stage: "resume",
      result: {
        paused: false,
        originalCount: approvedRows.length,
        finalCount: finalRows.length,
        rows: finalRows,
        execution,
        excelBase64,
        filename: "autofind-results.xlsx",
      },
    });
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("AUTOFIND: Starting GitHub browser job");
  console.log("AUTOFIND: Job ID:", JOB_ID);
  console.log("AUTOFIND: Stage:", STAGE);

  const job = await getJob();

  if (STAGE === "resume") {
    await runResume(job);
  } else {
    await runInitial(job);
  }

  console.log("AUTOFIND: Job finished");
}

main().catch(async (error) => {
  console.error("AUTOFIND: Job failed:", error);

  try {
    await callback({
      status: "failed",
      stage: STAGE,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    });
  } catch (callbackError) {
    console.error(
      "AUTOFIND: Failed to report error:",
      callbackError
    );
  }

  process.exit(1);
});
