import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  chromium,
  type Browser,
  type Page,
} from "playwright";

const CHROME_PATH =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

type JobRow = {
  company: string;
  title: string;
  url: string;
  website?: string;
  websiteTitle?: string;
  websiteText?: string;
  selected?: boolean;
  approved?: boolean;
  companyEvidence?: string;
};

type WorkflowStep = {
  id: number;
  description: string;
  type: string;
  method: string;
  humanRequired: boolean | string;
};

type BrowserResultRow = {
  company?: string;
  title?: string;
  url?: string;
};

type BrowserResult = {
  extractedRows?: BrowserResultRow[];
};

function isHumanRequired(
  step: WorkflowStep
): boolean {
  return (
    step.humanRequired === true ||
    step.humanRequired === "true" ||
    step.type === "human_judgment" ||
    step.method === "manual"
  );
}

function dedupeRows(
  rows: JobRow[]
): JobRow[] {
  const seen = new Set<string>();
  const result: JobRow[] = [];

  for (const row of rows) {
    const normalizedUrl = row.url
      .split("?")[0]
      .replace(/\/$/, "")
      .toLowerCase();

    const key = [
      row.company.trim().toLowerCase(),
      row.title.trim().toLowerCase(),
      normalizedUrl,
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(row);
  }

  return result;
}

function createExcelFile(
  rows: JobRow[]
): string {
  const exportRows = rows.map((row) => ({
    Company: row.company,
    "Job Title": row.title,
    URL: row.url,
    "Company Website":
      row.website || "",
    "Website Title":
      row.websiteTitle || "",
    "Website Evidence":
      row.websiteText
        ? row.websiteText.slice(0, 1500)
        : "",
    "Company Evidence":
      row.companyEvidence || "",
    Approved:
      row.approved === true
        ? "Yes"
        : "No",
  }));

  const worksheet =
    XLSX.utils.json_to_sheet(
      exportRows
    );

  worksheet["!cols"] = [
    { wch: 28 },
    { wch: 45 },
    { wch: 60 },
    { wch: 45 },
    { wch: 40 },
    { wch: 90 },
    { wch: 60 },
    { wch: 12 },
  ];

  const workbook =
    XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "AutoFind Results"
  );

  const buffer = XLSX.write(
    workbook,
    {
      type: "buffer",
      bookType: "xlsx",
    }
  );

  return Buffer.from(
    buffer
  ).toString("base64");
}

function buildExecutionSteps(
  workflowSteps: WorkflowStep[],
  completed = false
) {
  const humanIndex =
    workflowSteps.findIndex(
      (step) =>
        isHumanRequired(step)
    );

  return workflowSteps.map(
    (step, index) => {
      if (completed) {
        return {
          order: index + 1,
          description:
            step.description,
          status:
            "completed" as const,
          method:
            step.method || "manual",
        };
      }

      if (
        humanIndex !== -1 &&
        index === humanIndex
      ) {
        return {
          order: index + 1,
          description:
            step.description,
          status:
            "human_checkpoint" as const,
          method:
            step.method || "manual",
        };
      }

      if (
        humanIndex !== -1 &&
        index > humanIndex
      ) {
        return {
          order: index + 1,
          description:
            step.description,
          status:
            "recorded" as const,
          method:
            step.method || "manual",
        };
      }

      return {
        order: index + 1,
        description:
          step.description,
        status:
          "completed" as const,
        method:
          step.method || "manual",
      };
    }
  );
}

async function createBrowser(): Promise<Browser> {
  return chromium.launch({
    executablePath: CHROME_PATH,
    headless: false,
  });
}

function cleanWebsiteUrl(
  value: string
): string {
  let url = value.trim();

  if (
    !url.startsWith("http://") &&
    !url.startsWith("https://")
  ) {
    url = `https://${url}`;
  }

  return url;
}

async function findCompanyWebsite(
  page: Page,
  company: string,
  jobUrl: string
): Promise<{
  website: string;
  websiteTitle: string;
  websiteText: string;
}> {
  try {
    await page.goto(jobUrl, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });

    await page.waitForTimeout(
      1200
    );
  } catch {
    return {
      website: "",
      websiteTitle: "",
      websiteText:
        "Could not open the job listing for company-site inspection.",
    };
  }

  const links =
    await page.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          "a[href]"
        )
      ).map((link) => {
        const anchor =
          link as HTMLAnchorElement;

        return {
          text:
            anchor.innerText.trim(),
          href: anchor.href,
        };
      })
    );

  const companyName =
    company.toLowerCase().trim();

  let candidate = links.find(
    (link) => {
      const text =
        link.text.toLowerCase();

      const href =
        link.href.toLowerCase();

      return (
        (
          text.includes(
            "company"
          ) ||
          text.includes(
            "website"
          ) ||
          text.includes(
            "employer"
          ) ||
          text.includes(
            companyName
          )
        ) &&
        href.startsWith("http") &&
        !href.includes(
          "linkedin.com"
        )
      );
    }
  );

  if (!candidate) {
    candidate = links.find(
      (link) => {
        const href =
          link.href.toLowerCase();

        return (
          href.startsWith(
            "http"
          ) &&
          !href.includes(
            "linkedin.com"
          ) &&
          !href.includes(
            "google.com"
          ) &&
          !href.includes(
            "facebook.com"
          ) &&
          !href.includes(
            "instagram.com"
          ) &&
          !href.includes(
            "twitter.com"
          ) &&
          !href.includes(
            "x.com"
          )
        );
      }
    );
  }

  if (!candidate) {
    return {
      website: "",
      websiteTitle: "",
      websiteText:
        `No external company website link was found on the listing for ${
          company ||
          "this company"
        }.`,
    };
  }

  const website =
    cleanWebsiteUrl(
      candidate.href
    );

  try {
    await page.goto(
      website,
      {
        waitUntil:
          "domcontentloaded",
        timeout: 20000,
      }
    );

    await page.waitForTimeout(
      1000
    );

    const websiteTitle =
      await page.title();

    const websiteText =
      await page
        .locator("body")
        .innerText()
        .catch(() => "");

    return {
      website,
      websiteTitle,
      websiteText:
        websiteText.slice(
          0,
          5000
        ),
    };
  } catch {
    return {
      website,
      websiteTitle: "",
      websiteText:
        `Company website was identified as ${website}, but it could not be opened.`,
    };
  }
}

async function inspectApprovedCompanies(
  rows: JobRow[]
): Promise<JobRow[]> {
  const browser =
    await createBrowser();

  try {
    const page =
      await browser.newPage();

    const enriched: JobRow[] =
      [];

    for (const row of rows) {
      const evidence =
        await findCompanyWebsite(
          page,
          row.company,
          row.url
        );

      enriched.push({
        ...row,
        ...evidence,
        companyEvidence:
          evidence.website
            ? `Company website found: ${evidence.website}. Website title: ${
                evidence.websiteTitle ||
                "Unavailable"
              }.`
            : evidence.websiteText,
        approved: true,
        selected: true,
      });
    }

    return enriched;
  } finally {
    await browser.close();
  }
}

function extractRowsFromBrowserResults(
  browserResults: BrowserResult[]
): JobRow[] {
  return browserResults.flatMap(
    (result) =>
      Array.isArray(
        result.extractedRows
      )
        ? result.extractedRows.map(
            (row) => ({
              company:
                row.company ||
                "Unknown company",

              title:
                row.title ||
                "Untitled listing",

              url:
                row.url || "",

              selected: false,
              approved: false,
            })
          )
        : []
  );
}

export async function POST(
  request: Request
) {
  try {
    const body =
      await request.json();

    const inputRows: JobRow[] =
      Array.isArray(body.rows)
        ? body.rows
        : [];

    const workflowSteps:
      WorkflowStep[] =
      Array.isArray(
        body.workflowSteps
      )
        ? body.workflowSteps
        : [];

    const resume =
      body.resume === true;

    const approvedRows:
      JobRow[] =
      Array.isArray(
        body.approvedRows
      )
        ? body.approvedRows
        : [];

    const humanIndex =
      workflowSteps.findIndex(
        (step) =>
          isHumanRequired(step)
      );

    const hasHumanCheckpoint =
      humanIndex !== -1;

    console.log(
      "AUTOFIND EXECUTION:",
      {
        resume,
        workflowSteps:
          workflowSteps.length,
        humanIndex,
        hasHumanCheckpoint,
        checkpointType:
          humanIndex !== -1
            ? workflowSteps[
                humanIndex
              ].type
            : "none",
        checkpointHumanRequired:
          humanIndex !== -1
            ? workflowSteps[
                humanIndex
              ].humanRequired
            : "none",
      }
    );

    /*
     * RESUME AFTER HUMAN APPROVAL
     */

    if (resume) {
      if (
        approvedRows.length ===
        0
      ) {
        return NextResponse.json(
          {
            error:
              "No approved listings were provided.",
          },
          { status: 400 }
        );
      }

      console.log(
        "AUTOFIND: RESUMING AFTER HUMAN APPROVAL"
      );

      const approvedUnique =
        dedupeRows(
          approvedRows.map(
            (row) => ({
              ...row,
              selected: true,
              approved: true,
            })
          )
        );

      const enrichedRows =
        await inspectApprovedCompanies(
          approvedUnique
        );

      const finalRows =
        dedupeRows(
          enrichedRows
        );

      const excelBase64 =
        createExcelFile(
          finalRows
        );

      return NextResponse.json({
        success: true,
        paused: false,
        resumed: true,

        originalCount:
          approvedUnique.length,

        finalCount:
          finalRows.length,

        dataSource:
          "human_approved_linkedin_listings",

        rows: finalRows,

        excelBase64,

        filename:
          `autofind-results-${Date.now()}.xlsx`,

        execution: {
          status:
            "completed",

          steps:
            buildExecutionSteps(
              workflowSteps,
              true
            ),
        },
      });
    }

    /*
     * FIRST RUN
     */

    console.log(
      "AUTOFIND: FIRST RUN"
    );

    const stepsBeforeHuman =
      hasHumanCheckpoint
        ? workflowSteps.slice(
            0,
            humanIndex
          )
        : workflowSteps;

    const browserActions =
      stepsBeforeHuman
        .filter(
          (step) =>
            step.method ===
              "browser" &&
            !isHumanRequired(
              step
            )
        )
        .map(
          (step) =>
            step.description
        );

    let browserResults:
      BrowserResult[] = [];

    const firstInputUrl =
      inputRows[0]?.url;

    if (
      browserActions.length >
        0 &&
      firstInputUrl
    ) {
      console.log(
        "AUTOFIND: RUNNING BROWSER STEPS BEFORE HUMAN CHECKPOINT"
      );

      const {
        runBrowserWorkflow,
      } = await import(
        "@/lib/browserExecutor"
      );

      browserResults =
        await runBrowserWorkflow(
          firstInputUrl,
          browserActions
        );
    }

    let candidates =
      extractRowsFromBrowserResults(
        browserResults
      );

    if (
      candidates.length === 0
    ) {
      candidates =
        inputRows.map(
          (row) => ({
            ...row,
            selected: false,
            approved: false,
          })
        );
    }

    candidates =
      dedupeRows(
        candidates
      ).slice(0, 50);

    /*
     * HUMAN CHECKPOINT
     */

    if (
      hasHumanCheckpoint
    ) {
      const humanStep =
        workflowSteps[
          humanIndex
        ];

      console.log(
        "AUTOFIND: PAUSING AT HUMAN CHECKPOINT",
        {
          stepId:
            humanStep.id,
          description:
            humanStep.description,
        }
      );

      return NextResponse.json({
        success: true,
        paused: true,

        checkpoint: {
          stepId:
            humanStep.id,

          description:
            humanStep.description,

          message:
            "AutoFind paused for human review.",
        },

        candidates,

        originalCount:
          candidates.length,

        finalCount:
          candidates.length,

        browserResults,

        execution: {
          status:
            "waiting_for_human",

          steps:
            buildExecutionSteps(
              workflowSteps,
              false
            ),
        },
      });
    }

    /*
     * NO HUMAN CHECKPOINT
     */

    console.log(
      "AUTOFIND: NO HUMAN CHECKPOINT — COMPLETING"
    );

    const uniqueRows =
      dedupeRows(
        candidates
      );

    const excelBase64 =
      createExcelFile(
        uniqueRows
      );

    return NextResponse.json({
      success: true,
      paused: false,

      originalCount:
        candidates.length,

      finalCount:
        uniqueRows.length,

      dataSource:
        browserResults.length >
        0
          ? "browser_extraction"
          : "user_input",

      rows: uniqueRows,

      browserResults,

      excelBase64,

      filename:
        `autofind-results-${Date.now()}.xlsx`,

      execution: {
        status:
          "completed",

        steps:
          buildExecutionSteps(
            workflowSteps,
            true
          ),
      },
    });
  } catch (error) {
    console.error(
      "AutoFind execution error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to execute automation.",
      },
      { status: 500 }
    );
  }
}