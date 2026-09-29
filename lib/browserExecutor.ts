import {
  launch,
  type Browser,
  type Page,
  type BrowserWorker,
} from "@cloudflare/playwright";

export type BrowserEnv = {
  BROWSER: BrowserWorker;
};

async function createBrowser(
  env: BrowserEnv
): Promise<Browser> {
  return launch(env.BROWSER);
}

function extractSearchQuery(
  text: string
): string {
  const quoted =
    text.match(/["“](.+?)["”]/);

  if (quoted?.[1]) {
    return quoted[1].trim();
  }

  const match =
    text.match(
      /(?:search|find|look for|look up)\s+(?:for\s+)?(.+)/i
    );

  if (match?.[1]) {
    return match[1]
      .replace(/[.!?]+$/, "")
      .trim();
  }

  return text
    .replace(
      /^(search|find|look for|look up)\s+/i,
      ""
    )
    .replace(/[.!?]+$/, "")
    .trim();
}

function buildLinkedInJobsUrl(
  query: string
): string {
  return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(
    query
  )}`;
}

type ExtractedJob = {
  company: string;
  title: string;
  url: string;
};

async function extractLinkedInJobs(
  page: Page
): Promise<ExtractedJob[]> {
  const jobs =
    await page.evaluate(() => {
      const cards =
        Array.from(
          document.querySelectorAll(
            "div.base-card, li.jobs-search-results__list-item, div.job-card-container"
          )
        );

      return cards
        .map((card) => {
          const titleEl =
            card.querySelector(
              "h3.base-search-card__title, a.job-card-list__title, a.job-card-container__link"
            );

          const companyEl =
            card.querySelector(
              "h4.base-search-card__subtitle, a.job-card-container__company-name, span.job-card-container__primary-description"
            );

          const linkEl =
            card.querySelector(
              "a.base-card__full-link, a.base-card__link, a.job-card-list__title, a.job-card-container__link"
            ) as HTMLAnchorElement | null;

          const title =
            titleEl?.textContent?.trim() ||
            "";

          const company =
            companyEl?.textContent?.trim() ||
            "";

          const url =
            linkEl?.href ||
            "";

          if (
            !title &&
            !company &&
            !url
          ) {
            return null;
          }

          return {
            company,
            title,
            url,
          };
        })
        .filter(
          (
            job
          ): job is ExtractedJob =>
            job !== null
        );
    });

  return jobs;
}

type GenericJobLink = {
  text: string;
  href: string;
};

async function extractGenericJobLinks(
  page: Page
): Promise<GenericJobLink[]> {
  return page.evaluate(() => {
    return Array.from(
      document.querySelectorAll(
        "a[href]"
      )
    )
      .map((link) => {
        const anchor =
          link as HTMLAnchorElement;

        return {
          text:
            anchor.innerText.trim(),
          href: anchor.href,
        };
      })
      .filter(
        (
          link
        ): link is GenericJobLink =>
          link.href.startsWith(
            "http"
          )
      )
      .slice(0, 50);
  });
}

async function performSearch(
  page: Page,
  description: string
): Promise<BrowserActionResult> {
  const query =
    extractSearchQuery(
      description
    );

  const isLinkedIn =
    /linkedin/i.test(
      description
    );

  const url = isLinkedIn
    ? buildLinkedInJobsUrl(
        query
      )
    : `https://www.google.com/search?q=${encodeURIComponent(
        query
      )}`;

  await page.goto(
    url,
    {
      waitUntil:
        "domcontentloaded",
      timeout: 30000,
    }
  );

  await page.waitForTimeout(
    1500
  );

  if (isLinkedIn) {
    const jobs =
      await extractLinkedInJobs(
        page
      );

    return {
      action: "search",
      query,
      url,
      extractedRows:
        jobs,
    };
  }

  const links =
    await extractGenericJobLinks(
      page
    );

  return {
    action: "search",
    query,
    url,
    extractedRows:
      links.map(
        (link) => ({
          company: "",
          title: link.text,
          url: link.href,
        })
      ),
  };
}

async function inspectCompanyWebsite(
  page: Page,
  url: string
): Promise<BrowserActionResult> {
  try {
    await page.goto(
      url,
      {
        waitUntil:
          "domcontentloaded",
        timeout: 20000,
      }
    );

    await page.waitForTimeout(
      1000
    );

    const title =
      await page.title();

    const text =
      await page
        .locator("body")
        .innerText()
        .catch(() => "");

    return {
      action: "inspect_company_website",
      url,
      title,
      text: text.slice(
        0,
        5000
      ),
    };
  } catch (error) {
    return {
      action: "inspect_company_website",
      url,
      title: "",
      text:
        error instanceof Error
          ? error.message
          : "Could not inspect website.",
    };
  }
}

async function executeBrowserStep(
  page: Page,
  description: string,
  url: string
): Promise<BrowserActionResult> {
  const lower =
    description.toLowerCase();

  if (
    lower.includes("search") ||
    lower.includes("find") ||
    lower.includes(
      "look for"
    )
  ) {
    return performSearch(
      page,
      description
    );
  }

  if (
    lower.includes(
      "check the company website"
    ) ||
    lower.includes(
      "check company website"
    ) ||
    lower.includes(
      "inspect the company website"
    )
  ) {
    return inspectCompanyWebsite(
      page,
      url
    );
  }

  await page.goto(
    url,
    {
      waitUntil:
        "domcontentloaded",
      timeout: 30000,
    }
  );

  await page.waitForTimeout(
    1000
  );

  return {
    action: "open",
    url,
    title:
      await page.title(),
  };
}

export type BrowserActionResult = {
  action: string;
  url?: string;
  title?: string;
  query?: string;
  text?: string;
  extractedRows?: Array<{
    company?: string;
    title?: string;
    url?: string;
  }>;
};

export async function runBrowserAction(
  env: BrowserEnv,
  url: string,
  description = "Open website"
): Promise<BrowserActionResult> {
  const browser =
    await createBrowser(
      env
    );

  try {
    const page =
      await browser.newPage();

    return await executeBrowserStep(
      page,
      description,
      url
    );
  } finally {
    await browser.close();
  }
}

export async function runBrowserWorkflow(
  env: BrowserEnv,
  url: string,
  actions: string[]
): Promise<
  BrowserActionResult[]
> {
  const browser =
    await createBrowser(
      env
    );

  try {
    const page =
      await browser.newPage();

    const results: BrowserActionResult[] =
      [];

    let currentUrl = url;

    for (const action of actions) {
      const result =
        await executeBrowserStep(
          page,
          action,
          currentUrl
        );

      results.push(
        result
      );

      if (result.url) {
        currentUrl =
          result.url;
      }
    }

    return results;
  } finally {
    await browser.close();
  }
}
