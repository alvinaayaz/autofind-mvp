export type StepType =
  | "repetitive"
  | "deterministic"
  | "ai_assisted"
  | "human_judgment";

export type AutomationMethod =
  | "browser"
  | "data_processing"
  | "api"
  | "ai"
  | "manual";

export type WorkflowStep = {
  id: number;
  description: string;
  type: StepType;
  automationPotential: "high" | "medium" | "low";
  method: AutomationMethod;
  input: string;
  output: string;
  humanRequired: boolean;
  reason: string;
};

export type BlueprintAction = {
  order: number;
  title: string;
  description: string;
  method: AutomationMethod;
  humanRequired: boolean;
  sourceStepId: number;
};

export type AutomationSpec = {
  name: string;
  trigger: string;
  inputs: string[];
  outputs: string[];
  actions: string[];
  humanCheckpoints: string[];
};

export type AutomationBlueprint = {
  title: string;
  goal: string;
  actions: BlueprintAction[];
  humanCheckpoints: string[];
  tools: string[];
  automationSpec: AutomationSpec;
};

export type WorkflowAnalysis = {
  steps: WorkflowStep[];
  summary: {
    totalSteps: number;
    highPotential: number;
    mediumPotential: number;
    lowPotential: number;
    aiAssisted: number;
    humanJudgment: number;
  };
  blueprint: AutomationBlueprint;
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function containsPhrase(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

/*
 * ==================================================
 * HUMAN JUDGMENT
 * ==================================================
 */

function isHumanJudgment(text: string): boolean {
  return containsAny(text, [
    "decide",
    "choose",
    "select",
    "judge",
    "approve",
    "reject",
    "whether",
    "determine",
    "evaluate",
    "assess",
    "legitimate",
    "suspicious",
    "interesting",
    "relevant",
    "suitable",
    "good fit",
    "bad fit",
    "worth",
    "prefer",
    "pick",
    "prioritize",
    "make a decision",
    "use my judgment",
    "review and decide",
  ]);
}

/*
 * ==================================================
 * AI-ASSISTED WORK
 * ==================================================
 */

function isAiAssisted(text: string): boolean {
  return containsAny(text, [
    "summarize",
    "summary",
    "write",
    "rewrite",
    "draft",
    "generate",
    "analyze",
    "understand",
    "classify",
    "compare",
    "interpret",
    "extract insights",
    "read and",
    "review",
    "translate",
    "categorize",
    "score",
    "explain",
    "answer questions",
    "create a report",
    "create reports",
    "write a report",
    "write reports",
  ]);
}

/*
 * ==================================================
 * BROWSER WORK
 * ==================================================
 */

function isBrowserWork(text: string): boolean {
  return containsAny(text, [
    "search",
    "search for",
    "search on",
    "open",
    "visit",
    "browse",
    "navigate",
    "go to",
    "log in",
    "login",
    "sign in",
    "click",
    "scroll",
    "website",
    "web page",
    "webpage",
    "linkedin",
    "google maps",
    "google",
    "facebook",
    "instagram",
    "twitter",
    "x.com",
    "job board",
    "job site",
    "listing",
    "listings",
    "career page",
    "careers page",
    "online",
    "browser",
  ]);
}

/*
 * ==================================================
 * DATA PROCESSING
 * ==================================================
 */

function isDataProcessing(text: string): boolean {
  return containsAny(text, [
    "copy",
    "paste",
    "excel",
    "spreadsheet",
    "csv",
    "database",
    "duplicate",
    "duplicates",
    "deduplicate",
    "sort",
    "filter",
    "clean",
    "cleaning",
    "format",
    "rename",
    "move",
    "save",
    "export",
    "import",
    "merge",
    "split",
    "remove",
    "delete",
    "store",
    "record",
    "update",
    "append",
    "combine",
    "organize",
    "organise",
    "columns",
    "rows",
    "table",
    "dataset",
    "data",
  ]);
}

/*
 * ==================================================
 * API / SYSTEM INTEGRATION
 * ==================================================
 */

function isApiWork(text: string): boolean {
  return containsAny(text, [
    "api",
    "webhook",
    "integration",
    "integrate",
    "send data to",
    "sync data",
    "synchronize",
    "connect to",
    "push data",
    "pull data",
  ]);
}

/*
 * ==================================================
 * RECURRING WORK
 * ==================================================
 */

function isRecurring(text: string): boolean {
  return containsAny(text, [
    "every morning",
    "every day",
    "daily",
    "every afternoon",
    "every evening",
    "every week",
    "weekly",
    "every month",
    "monthly",
    "regularly",
    "repeatedly",
    "again",
    "each time",
    "routine",
    "recurring",
    "recurring task",
    "each morning",
    "each day",
    "each week",
  ]);
}

/*
 * ==================================================
 * LEAD GENERATION
 * ==================================================
 */

function isLeadGeneration(text: string): boolean {
  return containsAny(text, [
    "lead",
    "leads",
    "prospects",
    "prospecting",
    "potential customers",
    "potential clients",
    "businesses",
    "business leads",
    "find companies",
    "find businesses",
    "collect businesses",
    "collect leads",
    "generate leads",
    "lead generation",
    "outreach list",
    "prospect list",
  ]);
}

/*
 * ==================================================
 * CLASSIFY A SINGLE STEP
 * ==================================================
 */

function analyzeStep(
  description: string
): Omit<WorkflowStep, "id"> {
  const text = normalizeText(description);

  /*
   * Human judgment has priority.
   */

  if (isHumanJudgment(text)) {
    return {
      description,

      type: "human_judgment",

      automationPotential: "low",

      method: "manual",

      input: "Information available to the user",

      output: "Human decision or selection",

      humanRequired: true,

      reason:
        "This step contains a human choice or evaluation. AutoFind can automate the surrounding work, but the final decision stays with the user.",
    };
  }

  /*
   * API work.
   */

  if (isApiWork(text)) {
    return {
      description,

      type: "deterministic",

      automationPotential: "high",

      method: "api",

      input:
        "Structured data or information from another system",

      output:
        "Data transferred or synchronized between systems",

      humanRequired: false,

      reason:
        "This is a predictable system-to-system operation that can usually be automated through an API or integration.",
    };
  }

  /*
   * Browser work.
   */

  if (isBrowserWork(text)) {
    return {
      description,

      type: "deterministic",

      automationPotential: "high",

      method: "browser",

      input:
        "Website, URL, search query, or browser action",

      output:
        "Web page, listing, or extracted information",

      humanRequired: false,

      reason:
        "This is a repeatable browser action that can potentially be automated.",
    };
  }

  /*
   * Data processing.
   */

  if (isDataProcessing(text)) {
    return {
      description,

      type: "deterministic",

      automationPotential: "high",

      method: "data_processing",

      input:
        "Structured or semi-structured data",

      output:
        "Processed, cleaned, updated, or stored data",

      humanRequired: false,

      reason:
        "This is a predictable data operation and is a strong automation candidate.",
    };
  }

  /*
   * AI assistance.
   */

  if (isAiAssisted(text)) {
    return {
      description,

      type: "ai_assisted",

      automationPotential: "medium",

      method: "ai",

      input:
        "Unstructured information or text",

      output:
        "AI-generated content, analysis, classification, or summary",

      humanRequired: true,

      reason:
        "AI could assist with this step, but human review may still be useful before the result is used.",
    };
  }

  /*
   * Recurring work.
   */

  if (isRecurring(text)) {
    return {
      description,

      type: "repetitive",

      automationPotential: "medium",

      method: "manual",

      input:
        "Information provided during the recurring workflow",

      output:
        "Completed recurring task",

      humanRequired: false,

      reason:
        "This work repeats, but more workflow detail is needed to define a reliable automation.",
    };
  }

  /*
   * Lead-generation context.
   */

  if (isLeadGeneration(text)) {
    return {
      description,

      type: "repetitive",

      automationPotential: "medium",

      method: "data_processing",

      input:
        "Business or prospect information",

      output:
        "Structured lead or prospect data",

      humanRequired: false,

      reason:
        "Lead collection often contains repeatable research and data-entry work that can be automated once the source and rules are defined.",
    };
  }

  /*
   * Fallback.
   */

  return {
    description,

    type: "repetitive",

    automationPotential: "medium",

    method: "manual",

    input:
      "Information required by the task",

    output:
      "Completed task",

    humanRequired: false,

    reason:
      "This task may contain automatable work, but more workflow detail is needed.",
  };
}

/*
 * ==================================================
 * SPLIT WORKFLOW INTO STEPS
 * ==================================================
 */

function splitWorkflow(input: string): string[] {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 3);

  const descriptions: string[] = [];

  for (const line of lines) {
    const parts = line
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 3);

    descriptions.push(...parts);
  }

  return descriptions;
}

/*
 * ==================================================
 * CONTEXT IMPROVEMENT
 * ==================================================
 */

function improveWorkflowContext(
  steps: WorkflowStep[]
): WorkflowStep[] {
  return steps.map((step) => {
    const text = normalizeText(step.description);

    /*
     * IMPORTANT:
     *
     * Selecting relevant listings is human judgment.
     *
     * Collecting the company, job title, and URL from
     * listings that were already selected is mechanical.
     *
     * Therefore this step MUST be browser automation,
     * not a human checkpoint.
     */

    if (
      containsPhrase(text, [
        "collect the company, job title, and url",
        "collect company, job title, and url",
        "collect the company, title, and url",
        "collect company, title, and url",
        "collect the company job title and url",
        "collect company job title and url",
      ])
    ) {
      return {
        ...step,

        type: "deterministic",

        automationPotential: "high",

        method: "browser",

        humanRequired: false,

        input:
          "Job listings selected by the user",

        output:
          "Company, job title, and URL for selected listings",

        reason:
          "The user chooses which listings are relevant, but collecting the company, job title, and URL from those selected listings is a mechanical browser action that can be automated.",
      };
    }

    /*
     * "Open relevant job listings and collect..."
     *
     * If the workflow is written as one combined step,
     * keep the relevance decision under human control.
     *
     * The separate-step version above is preferred because
     * it allows AutoFind to automate the collection itself.
     */

    if (
      containsPhrase(text, [
        "open relevant job listings and collect",
        "open relevant listings and collect",
        "open relevant job listings",
      ])
    ) {
      return {
        ...step,

        type: "human_judgment",

        automationPotential: "low",

        method: "manual",

        humanRequired: true,

        input:
          "Job listings found by the browser",

        output:
          "Relevant listings selected for automation",

        reason:
          "The relevance decision stays with the user. AutoFind can automate the mechanical collection after the user selects the relevant listings.",
      };
    }

    /*
     * "Open interesting listings"
     *
     * The selection is human-controlled,
     * but opening the selected items is mechanical.
     */

    if (
      containsAny(text, [
        "open the interesting listings",
        "open interesting listings",
        "open selected listings",
        "open chosen listings",
        "open the listings i selected",
        "open the jobs i selected",
      ])
    ) {
      return {
        ...step,

        type: "deterministic",

        automationPotential: "high",

        method: "browser",

        humanRequired: false,

        input:
          "URLs or listings selected by the user",

        output:
          "Opened selected listing or web page",

        reason:
          "The selection is human-controlled, but opening the selected listings is a mechanical browser action that can be automated.",
      };
    }

    /*
     * Company website inspection.
     */

    if (
      containsPhrase(text, [
        "check the company website",
        "check company website",
        "visit the company website",
        "look at the company website",
        "inspect the company website",
      ])
    ) {
      return {
        ...step,

        type: "deterministic",

        automationPotential: "high",

        method: "browser",

        humanRequired: false,

        input:
          "Company website URL",

        output:
          "Company website information",

        reason:
          "This step gathers information that can support a later human decision, so the information-gathering part can be automated.",
      };
    }

    /*
     * Lead collection from a website.
     */

    if (
      isLeadGeneration(text) &&
      isBrowserWork(text)
    ) {
      return {
        ...step,

        type: "deterministic",

        automationPotential: "high",

        method: "browser",

        humanRequired: false,

        input:
          "Website, search query, or business listing",

        output:
          "Collected business or lead information",

        reason:
          "This combines web research with repeatable lead collection, making it a strong browser-automation candidate.",
      };
    }

    /*
     * Removing duplicates is deterministic.
     */

    if (
      containsAny(text, [
        "remove duplicate",
        "remove duplicates",
        "deduplicate",
        "dedup",
      ])
    ) {
      return {
        ...step,

        type: "deterministic",

        automationPotential: "high",

        method: "data_processing",

        humanRequired: false,

        input:
          "Structured dataset",

        output:
          "Deduplicated dataset",

        reason:
          "Duplicate detection follows repeatable rules and can be performed automatically.",
      };
    }

    /*
     * Exporting/saving a file is deterministic.
     */

    if (
      containsAny(text, [
        "save the final",
        "export the final",
        "download the final",
        "save the file",
        "export the file",
        "download the file",
      ])
    ) {
      return {
        ...step,

        type: "deterministic",

        automationPotential: "high",

        method: "data_processing",

        humanRequired: false,

        input:
          "Completed dataset or generated file",

        output:
          "Saved or exported file",

        reason:
          "Saving or exporting a completed result is a predictable operation that can be automated.",
      };
    }

    return step;
  });
}

/*
 * ==================================================
 * BLUEPRINT TITLES
 * ==================================================
 */

function getBlueprintTitle(
  step: WorkflowStep
): string {
  if (
    step.type ===
    "human_judgment"
  ) {
    return "Human checkpoint";
  }

  if (
    step.type ===
    "ai_assisted"
  ) {
    return "AI-assisted step";
  }

  if (
    step.method ===
    "browser"
  ) {
    return "Automate browser action";
  }

  if (
    step.method ===
    "data_processing"
  ) {
    return "Automate data processing";
  }

  if (
    step.method ===
    "api"
  ) {
    return "Automate system integration";
  }

  return "Automate repeatable task";
}

/*
 * ==================================================
 * BLUEPRINT DESCRIPTIONS
 * ==================================================
 */

function getBlueprintDescription(
  step: WorkflowStep,
  previousStep?: WorkflowStep
): string {
  if (
    step.type ===
    "human_judgment"
  ) {
    return `Pause the automation and let the user decide: "${step.description}".`;
  }

  if (
    step.type ===
    "ai_assisted"
  ) {
    return `Use AI to assist with "${step.description}", then allow human review.`;
  }

  if (
    previousStep?.type ===
      "human_judgment" &&
    step.method ===
      "browser"
  ) {
    return `After the user makes the required decision, automatically perform: "${step.description}".`;
  }

  if (
    step.method ===
    "browser"
  ) {
    return `Use browser automation to perform: "${step.description}".`;
  }

  if (
    step.method ===
    "data_processing"
  ) {
    return `Automatically handle: "${step.description}".`;
  }

  if (
    step.method ===
    "api"
  ) {
    return `Use an API or integration to automate: "${step.description}".`;
  }

  return `Automate the repeatable task: "${step.description}".`;
}

/*
 * ==================================================
 * AUTOMATION SPEC
 * ==================================================
 */

function buildAutomationSpec(
  steps: WorkflowStep[]
): AutomationSpec {
  const automationSteps =
    steps.filter(
      (step) =>
        step.automationPotential ===
          "high" ||
        step.type ===
          "ai_assisted"
    );

  const humanSteps =
    steps.filter(
      (step) =>
        step.humanRequired
    );

  const inputs =
    Array.from(
      new Set(
        automationSteps.map(
          (step) =>
            step.input
        )
      )
    );

  const outputs =
    Array.from(
      new Set(
        automationSteps.map(
          (step) =>
            step.output
        )
      )
    );

  const actions =
    automationSteps.map(
      (step, index) =>
        `${index + 1}. ${step.description}`
    );

  return {
    name:
      "AutoFind automation",

    trigger:
      "Run manually when the user starts the workflow.",

    inputs,

    outputs,

    actions,

    humanCheckpoints:
      humanSteps.map(
        (step) =>
          step.description
      ),
  };
}

/*
 * ==================================================
 * BUILD BLUEPRINT
 * ==================================================
 */

function buildBlueprint(
  steps: WorkflowStep[]
): AutomationBlueprint {
  const actions:
    BlueprintAction[] =
    [];

  steps.forEach(
    (step, index) => {
      const shouldInclude =
        step.automationPotential ===
          "high" ||
        step.type ===
          "ai_assisted" ||
        step.humanRequired;

      if (
        !shouldInclude
      ) {
        return;
      }

      actions.push({
        order:
          actions.length + 1,

        title:
          getBlueprintTitle(
            step
          ),

        description:
          getBlueprintDescription(
            step,
            index > 0
              ? steps[
                  index - 1
                ]
              : undefined
          ),

        method:
          step.method,

        humanRequired:
          step.humanRequired,

        sourceStepId:
          step.id,
      });
    }
  );

  const humanCheckpoints =
    steps
      .filter(
        (step) =>
          step.type ===
          "human_judgment"
      )
      .map(
        (step) =>
          step.description
      );

  const tools =
    Array.from(
      new Set(
        actions.map(
          (action) => {
            switch (
              action.method
            ) {
              case "browser":
                return "Browser automation";

              case "data_processing":
                return "Data processing";

              case "api":
                return "API integration";

              case "ai":
                return "AI";

              default:
                return "Human review";
            }
          }
        )
      )
    );

  return {
    title:
      actions.length > 0
        ? "Proposed automation"
        : "No clear automation yet",

    goal:
      "Automate the mechanical work, use AI where useful, and keep important decisions under human control.",

    actions,

    humanCheckpoints,

    tools,

    automationSpec:
      buildAutomationSpec(
        steps
      ),
  };
}

/*
 * ==================================================
 * PUBLIC ANALYZER
 * ==================================================
 */

export function analyzeWorkflow(
  input: string
): WorkflowAnalysis {
  const descriptions =
    splitWorkflow(
      input
    );

  let steps:
    WorkflowStep[] =
    descriptions.map(
      (
        description,
        index
      ) => ({
        id:
          index + 1,

        ...analyzeStep(
          description
        ),
      })
    );

  steps =
    improveWorkflowContext(
      steps
    );

  return {
    steps,

    summary: {
      totalSteps:
        steps.length,

      highPotential:
        steps.filter(
          (step) =>
            step.automationPotential ===
            "high"
        ).length,

      mediumPotential:
        steps.filter(
          (step) =>
            step.automationPotential ===
            "medium"
        ).length,

      lowPotential:
        steps.filter(
          (step) =>
            step.automationPotential ===
            "low"
        ).length,

      aiAssisted:
        steps.filter(
          (step) =>
            step.type ===
            "ai_assisted"
        ).length,

      humanJudgment:
        steps.filter(
          (step) =>
            step.type ===
            "human_judgment"
        ).length,
    },

    blueprint:
      buildBlueprint(
        steps
      ),
  };
}