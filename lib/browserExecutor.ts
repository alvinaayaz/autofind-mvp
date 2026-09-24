import { chromium, type Browser, type Page } from "playwright";

const CHROME_PATH =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

export type ExtractedRow = {
  company: string;
  title: string;
  url: string;
};

export type BrowserActionResult = {
  success: boolean;
  action: string;
  url: string;
  title: string;
  text: string;
  extractedRows: ExtractedRow[];
  message: string;
};

async function createBrowser(): Promise<Browser> {
  const isWindows = process.platform === "win32";

  if (isWindows) {
    return chromium.launch({
      executablePath: CHROME_PATH,
      headless: false,
    });
  }

  return chromium.launch({
    headless: true,
  });
}

async function openPage(
  browser: Browser,
  url: string
): Promise<Page> {
  const page = await browser.newPage();

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await page.waitForTimeout(2000);

  return page;
}

function extractSearchQuery(
  description: string
): string {
  const text =
    description.toLowerCase();

  if (text.includes("remote jobs")) {
    return "remote jobs";
  }

  if (text.includes("remote job")) {
    return "remote job";
  }

  const match =
    description.match(
      /search(?:\s+linkedin)?(?:\s+for)?\s+(.+)/i
    );

  if (match?.[1]) {
    return match[1]
      .replace(/[.!?]+$/, "")
      .trim();
  }

  return "remote jobs";
}

function linkedinJobsUrl(
  query: string
): string {
  return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(
    query
  )}`;
}

async function extractLinkedInJobs(
  page: Page
): Promise<ExtractedRow[]> {
  /*
   * LinkedIn changes its DOM frequently, so use several
   * independent signals instead of one fragile selector.
   */

  const rows =
    await page.evaluate(() => {
      const results: {
        company: string;
        title: string;
        url: string;
      }[] = [];

      const links = Array.from(
        document.querySelectorAll(
          'a[href*="/jobs/view/"]'
        )
      );

      for (const link of links) {
        const anchor =
          link as HTMLAnchorElement;

        const url =
          anchor.href;

        const container =
          anchor.closest(
            "li, div"
          ) as HTMLElement | null;

        const rawText =
          container?.innerText ||
          anchor.innerText ||
          "";

        const lines =
          rawText
            .split("\n")
            .map((line) =>
              line.trim()
            )
            .filter(Boolean);

        const title =
          anchor.innerText.trim() ||
          lines.find(
            (line) =>
              line.length > 3 &&
              line.length < 150
          ) ||
          "";

        if (
          !title ||
          !url.includes(
            "/jobs/view/"
          )
        ) {
          continue;
        }

        let company = "";

        const companySelectors = [
          '[class*="company-name"]',
          '[class*="companyName"]',
          'a[href*="/company/"]',
        ];

        for (const selector of companySelectors) {
          const companyElement =
            container?.querySelector(
              selector
            );

          if (
            companyElement?.textContent
          ) {
            company =
              companyElement.textContent
                .trim();

            break;
          }
        }

        if (!company) {
          const companyLine =
            lines.find(
              (line) =>
                line !== title &&
                !line
                  .toLowerCase()
                  .includes(
                    "remote"
                  ) &&
                !line
                  .toLowerCase()
                  .includes(
                    "easy apply"
                  ) &&
                line.length < 100
            );

          company =
            companyLine || "";
        }

        results.push({
          company,
          title,
          url,
        });
      }

      return results;
    });

  const unique =
    Array.from(
      new Map(
        rows.map((row) => [
          row.url,
          row,
        ])
      ).values()
    );

  return unique.slice(0, 50);
}

async function extractGenericJobLinks(
  page: Page
): Promise<ExtractedRow[]> {
  const rows =
    await page.evaluate(() => {
      const results: {
        company: string;
        title: string;
        url: string;
      }[] = [];

      const links =
        Array.from(
          document.querySelectorAll(
            "a[href]"
          )
        );

      for (const link of links) {
        const anchor =
          link as HTMLAnchorElement;

        const href =
          anchor.href;

        const text =
          anchor.innerText.trim();

        if (
          !href ||
          !text ||
          text.length < 4
        ) {
          continue;
        }

        const lower =
          `${text} ${href}`.toLowerCase();

        const looksLikeJob =
          lower.includes("job") ||
          lower.includes("career") ||
          lower.includes("vacancy") ||
          lower.includes("position") ||
          lower.includes("opening");

        if (!looksLikeJob) continue;

        if (
          !href.startsWith(
            "http"
          )
        ) {
          continue;
        }

        results.push({
          company: "",
          title: text.slice(
            0,
            200
          ),
          url: href,
        });
      }

      return results;
    });

  return Array.from(
    new Map(
      rows.map((row) => [
        row.url,
        row,
      ])
    ).values()
  ).slice(0, 50);
}

async function extractJobs(
  page: Page
): Promise<ExtractedRow[]> {
  const url =
    page.url().toLowerCase();

  if (
    url.includes(
      "linkedin.com/jobs"
    )
  ) {
    return extractLinkedInJobs(
      page
    );
  }

  return extractGenericJobLinks(
    page
  );
}

async function performSearch(
  page: Page,
  description: string
): Promise<{
  message: string;
  extractedRows: ExtractedRow[];
}> {
  const query =
    extractSearchQuery(
      description
    );

  const currentUrl =
    page.url();

  /*
   * If this is a LinkedIn search step,
   * navigate directly to the Jobs search URL.
   *
   * This is more reliable than hoping a
   * generic page contains a search box.
   */

  if (
    description
      .toLowerCase()
      .includes("linkedin")
  ) {
    const url =
      linkedinJobsUrl(
        query
      );

    await page.goto(url, {
      waitUntil:
        "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForTimeout(
      3000
    );

    const extractedRows =
      await extractJobs(
        page
      );

    return {
      message:
        `Opened LinkedIn Jobs and searched for "${query}". Found ${extractedRows.length} candidate listings.`,

      extractedRows,
    };
  }

  /*
   * Generic search page.
   */

  const selectors = [
    'input[type="search"]',
    'input[name="q"]',
    'input[name="query"]',
    'input[placeholder*="Search" i]',
    'input[aria-label*="Search" i]',
  ];

  for (const selector of selectors) {
    const input =
      page
        .locator(selector)
        .first();

    if (
      await input.count()
    ) {
      try {
        await input.waitFor({
          state: "visible",
          timeout: 3000,
        });

        await input.fill(
          query
        );

        await input.press(
          "Enter"
        );

        await page.waitForLoadState(
          "domcontentloaded",
          {
            timeout: 10000,
          }
        ).catch(() => {});

        await page.waitForTimeout(
          2000
        );

        return {
          message:
            `Searched for "${query}" from ${currentUrl}.`,

          extractedRows:
            await extractJobs(
              page
            ),
        };
      } catch {
        continue;
      }
    }
  }

  return {
    message:
      `Could not find a search box for "${query}".`,

    extractedRows: [],
  };
}

async function inspectCompanyWebsite(
  page: Page,
  description: string,
  rows: ExtractedRow[]
): Promise<{
  message: string;
  extractedRows: ExtractedRow[];
}> {
  /*
   * At this point we do NOT decide whether a company
   * is legitimate. We only gather evidence.
   *
   * Human judgment remains human.
   */

  if (
    rows.length === 0
  ) {
    return {
      message:
        "No job listings were available to inspect yet.",

      extractedRows: [],
    };
  }

  const enriched: ExtractedRow[] =
    [];

  for (
    const row of rows.slice(
      0,
      10
    )
  ) {
    try {
      const jobPage =
        page;

      await jobPage.goto(
        row.url,
        {
          waitUntil:
            "domcontentloaded",
          timeout: 20000,
        }
      );

      await jobPage.waitForTimeout(
        1500
      );

      const links =
        await jobPage.evaluate(
          () =>
            Array.from(
              document.querySelectorAll(
                'a[href]'
              )
            )
              .map((link) => ({
                text:
                  (
                    link as HTMLAnchorElement
                  ).innerText.trim(),

                href:
                  (
                    link as HTMLAnchorElement
                  ).href,
              }))
              .filter(
                (link) =>
                  link.href.startsWith(
                    "http"
                  )
              )
          );

      const companyLink =
        links.find(
          (link) => {
            const text =
              link.text.toLowerCase();

            return (
              text.includes(
                "company"
              ) ||
              text.includes(
                "website"
              ) ||
              text.includes(
                "employer"
              )
            );
          }
        );

      enriched.push({
        ...row,
        company:
          row.company ||
          "Unknown company",
      });

      if (
        companyLink?.href
      ) {
        console.log(
          `AutoFind company website candidate: ${companyLink.href}`
        );
      }
    } catch {
      enriched.push(
        row
      );
    }
  }

  return {
    message:
      `Collected company-site evidence for ${enriched.length} job listings. Legitimacy decisions remain human-controlled.`,

    extractedRows:
      enriched,
  };
}

async function executeBrowserStep(
  page: Page,
  description: string,
  currentRows: ExtractedRow[]
): Promise<{
  message: string;
  extractedRows: ExtractedRow[];
}> {
  const text =
    description.toLowerCase();

  /*
   * SEARCH
   */

  if (
    text.includes("search")
  ) {
    return performSearch(
      page,
      description
    );
  }

  /*
   * OPEN LISTINGS
   *
   * "Interesting" is a human decision.
   * We therefore DO NOT blindly click random
   * listings. We preserve the extracted
   * candidates for the UI checkpoint.
   */

  if (
    text.includes(
      "interesting listings"
    ) ||
    text.includes(
      "selected listings"
    )
  ) {
    return {
      message:
        currentRows.length > 0
          ? `Found ${currentRows.length} listings ready for human selection.`
          : "No listings are available for selection yet.",

      extractedRows:
        currentRows,
    };
  }

  /*
   * COMPANY WEBSITE
   */

  if (
    text.includes(
      "company website"
    ) ||
    text.includes(
      "check the company"
    )
  ) {
    return inspectCompanyWebsite(
      page,
      description,
      currentRows
    );
  }

  /*
   * GENERIC BROWSER ACTION
   */

  if (
    text.includes("open") ||
    text.includes("visit") ||
    text.includes("navigate")
  ) {
    return {
      message:
        `Browser action recorded: "${description}".`,

      extractedRows:
        currentRows,
    };
  }

  return {
    message:
      `Browser step recorded: "${description}".`,

    extractedRows:
      currentRows,
  };
}

export async function runBrowserAction(
  url: string,
  description = "Open website"
): Promise<BrowserActionResult> {
  const browser =
    await createBrowser();

  try {
    const page =
      await openPage(
        browser,
        url
      );

    const result =
      await executeBrowserStep(
        page,
        description,
        []
      );

    const title =
      await page.title();

    const text =
      await page
        .locator("body")
        .innerText();

    return {
      success: true,
      action: description,
      url: page.url(),
      title,
      text: text.slice(
        0,
        10000
      ),
      extractedRows:
        result.extractedRows,
      message:
        result.message,
    };
  } finally {
    await browser.close();
  }
}

export async function runBrowserWorkflow(
  url: string,
  actions: string[]
): Promise<BrowserActionResult[]> {
  const browser =
    await createBrowser();

  const results:
    BrowserActionResult[] =
    [];

  try {
    /*
     * Start from the supplied URL.
     * The first LinkedIn search action can
     * redirect itself to the actual LinkedIn
     * Jobs search URL.
     */

    const page =
      await openPage(
        browser,
        url
      );

    let extractedRows:
      ExtractedRow[] = [];

    for (
      const description of actions
    ) {
      const result =
        await executeBrowserStep(
          page,
          description,
          extractedRows
        );

      /*
       * Preserve candidates between
       * workflow actions.
       */

      if (
        result.extractedRows
          .length > 0
      ) {
        extractedRows =
          result.extractedRows;
      }

      const title =
        await page.title();

      const bodyText =
        await page
          .locator("body")
          .innerText();

      results.push({
        success: true,

        action:
          description,

        url:
          page.url(),

        title,

        text:
          bodyText.slice(
            0,
            10000
          ),

        extractedRows:
          extractedRows,

        message:
          result.message,
      });
    }

    return results;
  } finally {
    await browser.close();
  }
}