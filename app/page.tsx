"use client";

import { useState } from "react";

type WorkflowStep = {
  id: number;
  description: string;
  type:
    | "repetitive"
    | "deterministic"
    | "ai_assisted"
    | "human_judgment";
  automationPotential: "high" | "medium" | "low";
  method:
    | "browser"
    | "data_processing"
    | "api"
    | "ai"
    | "manual";
  input: string;
  output: string;
  humanRequired: boolean;
  reason: string;
};

type JobRow = {
  company: string;
  title: string;
  url: string;
  website?: string;
  websiteTitle?: string;
  websiteText?: string;
  selected?: boolean;
  approved?: boolean;
};

type ExecutionStep = {
  order: number;
  description: string;
  status:
    | "completed"
    | "human_checkpoint"
    | "recorded";
  method: string;
};

type ExecutionResult = {
  status:
    | "waiting_for_human"
    | "completed";
  steps: ExecutionStep[];
};

type Analysis = {
  steps: WorkflowStep[];

  summary: {
    totalSteps: number;
    highPotential: number;
    mediumPotential: number;
    lowPotential: number;
    aiAssisted: number;
    humanJudgment: number;
  };

  blueprint: {
    title: string;
    goal: string;

    actions: {
      order: number;
      title: string;
      description: string;
      method: string;
      humanRequired: boolean;
      sourceStepId: number;
    }[];

    automationSpec: {
      name: string;
      trigger: string;
      inputs: string[];
      outputs: string[];
      actions: string[];
      humanCheckpoints: string[];
    };
  };
};

export default function Home() {
  const [workflow, setWorkflow] = useState("");
  const [dataInput, setDataInput] = useState(
    "Example | Example Website | https://example.com"
  );

  const [analysis, setAnalysis] =
    useState<Analysis | null>(null);

  const [candidates, setCandidates] =
    useState<JobRow[]>([]);

  const [execution, setExecution] =
    useState<ExecutionResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function analyzeWorkflow() {
    if (!workflow.trim()) {
      setError("Describe a workflow first.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setExecution(null);
    setCandidates([]);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workflow,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to analyze workflow."
        );
      }

      setAnalysis(data);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to analyze workflow."
      );
    } finally {
      setLoading(false);
    }
  }

  function parseRows(): JobRow[] {
    return dataInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line
          .split("|")
          .map((part) => part.trim());

        return {
          company: parts[0] || "",
          title: parts[1] || "",
          url: parts[2] || "",
        };
      })
      .filter(
        (row) =>
          row.company &&
          row.title &&
          row.url
      );
  }

  function toggleCandidate(index: number) {
    setCandidates((current) =>
      current.map((candidate, i) =>
        i === index
          ? {
              ...candidate,
              selected: !candidate.selected,
            }
          : candidate
      )
    );
  }

  function approveCandidate(index: number) {
    setCandidates((current) =>
      current.map((candidate, i) =>
        i === index
          ? {
              ...candidate,
              selected: true,
              approved: true,
            }
          : candidate
      )
    );
  }

  function rejectCandidate(index: number) {
    setCandidates((current) =>
      current.map((candidate, i) =>
        i === index
          ? {
              ...candidate,
              selected: false,
              approved: false,
            }
          : candidate
      )
    );
  }

  async function execute(resume: boolean) {
    if (!analysis) {
      setError("Analyze a workflow first.");
      return;
    }

    setExecuting(true);
    setError("");
    setMessage("");

    const rows = parseRows();

    const selectedRows = candidates.filter(
      (row) => row.selected === true
    );

    const approvedRows = candidates.filter(
      (row) => row.approved === true
    );

    if (resume && approvedRows.length === 0) {
      setError(
        "Approve at least one listing before continuing."
      );
      setExecuting(false);
      return;
    }

    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rows,
          workflowSteps: analysis.steps,
          resume,
          selectedRows,
          approvedRows,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Automation failed."
        );
      }

      if (data.paused === true) {
        setCandidates(
          Array.isArray(data.candidates)
            ? data.candidates
            : []
        );

        setExecution(data.execution);

        setMessage(
          "Automation paused — your decision is needed."
        );

        return;
      }

      setExecution(data.execution);

      setMessage(
        `Automation complete. ${data.originalCount} rows processed → ${data.finalCount} unique rows exported.`
      );

      if (data.excelBase64) {
        const binary = atob(data.excelBase64);
        const bytes = new Uint8Array(binary.length);

        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        const blob = new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        const downloadUrl =
          URL.createObjectURL(blob);

        const link =
          document.createElement("a");

        link.href = downloadUrl;
        link.download =
          data.filename ||
          "autofind-results.xlsx";

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(downloadUrl);
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Automation failed."
      );
    } finally {
      setExecuting(false);
    }
  }

  const selectedCount = candidates.filter(
    (row) => row.selected === true
  ).length;

  const approvedCount = candidates.filter(
    (row) => row.approved === true
  ).length;

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-950">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">

        {/* HEADER */}

        <header className="mx-auto max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold tracking-wide text-slate-500 shadow-sm">
            AutoFind · MVP
          </div>

          <h1 className="text-4xl font-bold tracking-[-0.03em] sm:text-5xl">
            Find the work you should automate.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            Describe something you repeatedly do.
            AutoFind breaks it into steps, finds
            automation opportunities, and keeps
            important decisions under human control.
          </p>
        </header>

        {/* WORKFLOW ANALYZER */}

        <section className="mx-auto mt-10 max-w-4xl rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)] sm:p-8">

          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-xs font-bold text-white">
              01
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                Workflow analyzer
              </p>

              <h2 className="mt-2 text-2xl font-bold tracking-tight">
                What do you repeatedly do?
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Describe the work in your own words.
                AutoFind will break it down for you.
              </p>
            </div>
          </div>

          <textarea
            value={workflow}
            onChange={(event) =>
              setWorkflow(event.target.value)
            }
            placeholder="Example: Every morning I search LinkedIn for remote jobs..."
            rows={8}
            className="mt-6 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100"
          />

          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Describe the actual steps you take.
            </span>

            <span className="text-xs font-medium text-slate-400">
              {workflow.length} characters
            </span>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              onClick={analyzeWorkflow}
              disabled={loading}
              className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "Analyzing..."
                : "Analyze workflow →"}
            </button>
          </div>

          {error && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}
        </section>

        {/* DATA AUTOMATION */}

        <section className="mx-auto mt-6 max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">

          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">
              +
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                Extra tool
              </p>

              <h2 className="mt-1 text-lg font-bold">
                Clean a CSV or Excel file
              </h2>

              <p className="mt-1 text-sm leading-6 text-slate-500">
                Run repeatable data-processing tasks
                without cleaning every row manually.
              </p>
            </div>
          </div>

          <DataAutomation />
        </section>

        {analysis && (
          <div className="mx-auto mt-10 max-w-4xl space-y-6">

            {/* SUMMARY */}

            <section>
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                  Analysis
                </p>

                <h2 className="mt-1 text-xl font-bold">
                  Automation overview
                </h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <Stat
                  label="Total steps"
                  value={analysis.summary.totalSteps}
                />

                <Stat
                  label="Automatable"
                  value={analysis.summary.highPotential}
                  emphasis
                />

                <Stat
                  label="AI-assisted"
                  value={analysis.summary.aiAssisted}
                />

                <Stat
                  label="Human decisions"
                  value={analysis.summary.humanJudgment}
                  human
                />
              </div>
            </section>

            {/* STEP ANALYSIS */}

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                  Step analysis
                </p>

                <h2 className="mt-1 text-xl font-bold">
                  What AutoFind found
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {analysis.summary.highPotential} steps
                  can be automated.{" "}
                  {analysis.summary.humanJudgment} decisions
                  stay with you.
                </p>
              </div>

              <div className="mt-5 space-y-2">
                {analysis.steps.map((step) => (
                  <div
                    key={step.id}
                    className={`rounded-2xl border p-4 ${
                      step.humanRequired
                        ? "border-amber-200 bg-amber-50/50"
                        : "border-slate-200 bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          step.humanRequired
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {step.humanRequired
                          ? "!"
                          : "✓"}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold leading-5">
                            {step.description}
                          </p>

                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              step.humanRequired
                                ? "bg-amber-100 text-amber-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {step.humanRequired
                              ? "Human"
                              : "Automatable"}
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-400">
                          <span>
                            {step.humanRequired
                              ? "Human judgment"
                              : step.method ===
                                "data_processing"
                              ? "Data processing"
                              : step.method ===
                                "browser"
                              ? "Browser"
                              : step.method}
                          </span>

                          {!step.humanRequired && (
                            <>
                              <span>·</span>

                              <span>
                                {step.automationPotential ===
                                "high"
                                  ? "High potential"
                                  : step.automationPotential ===
                                    "medium"
                                  ? "Medium potential"
                                  : "Low potential"}
                              </span>
                            </>
                          )}
                        </div>

                        <p className="mt-2 text-sm leading-5 text-slate-600">
                          {step.reason}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* BLUEPRINT */}

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                  Proposed flow
                </p>

                <h2 className="mt-1 text-xl font-bold">
                  Automation blueprint
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  AutoFind automates the mechanical parts
                  and pauses when your judgment is needed.
                </p>
              </div>

              <div className="relative mt-6">
                <div className="absolute bottom-5 left-4 top-5 w-px bg-slate-200" />

                <div className="space-y-3">
                  {analysis.blueprint.actions.map(
                    (action) => {
                      const sourceStep =
                        analysis.steps.find(
                          (step) =>
                            step.id ===
                            action.sourceStepId
                        );

                      let description =
                        action.description;

                      if (
                        sourceStep?.humanRequired
                      ) {
                        description =
                          `Pause and let you decide: "${sourceStep.description}"`;
                      } else if (
                        sourceStep?.method ===
                        "browser"
                      ) {
                        description =
                          `Automate: "${sourceStep.description}"`;
                      } else if (
                        sourceStep?.method ===
                        "data_processing"
                      ) {
                        description =
                          `Automate: "${sourceStep.description}"`;
                      }

                      return (
                        <div
                          key={action.order}
                          className="relative flex gap-3"
                        >
                          <div
                            className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-4 ring-white ${
                              action.humanRequired
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-950 text-white"
                            }`}
                          >
                            {action.order}
                          </div>

                          <div
                            className={`min-w-0 flex-1 rounded-2xl border p-4 ${
                              action.humanRequired
                                ? "border-amber-200 bg-amber-50/50"
                                : "border-slate-200 bg-slate-50/50"
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-bold">
                                {action.title}
                              </p>

                              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                                {action.method}
                                {action.humanRequired &&
                                  " · checkpoint"}
                              </span>
                            </div>

                            <p className="mt-1.5 text-sm leading-5 text-slate-600">
                              {description}
                            </p>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            </section>

            {/* RUN */}

            <section className="rounded-3xl border border-slate-800 bg-slate-950 p-5 text-white shadow-sm sm:p-7">

              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                    Execute
                  </p>

                  <h2 className="mt-1 text-xl font-bold">
                    Run automation
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Company | Job Title | URL
                  </p>
                </div>

                <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-lg sm:flex">
                  →
                </div>
              </div>

              <textarea
                value={dataInput}
                onChange={(event) =>
                  setDataInput(event.target.value)
                }
                rows={4}
                className="mt-5 w-full resize-none rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-white/30 focus:bg-white/10"
              />

              <button
                onClick={() => execute(false)}
                disabled={executing}
                className="mt-4 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {executing
                  ? "Running..."
                  : "Run automation →"}
              </button>

              {message && (
                <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-300">
                  {message}
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-300">
                  {error}
                </div>
              )}
            </section>

            {/* HUMAN CHECKPOINT */}

            {execution?.status ===
              "waiting_for_human" && (
              <section className="overflow-hidden rounded-3xl border-2 border-amber-300 bg-white shadow-[0_12px_40px_rgba(245,158,11,0.12)]">

                <div className="border-b border-amber-200 bg-amber-50 px-5 py-6 sm:px-7">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-lg font-bold text-amber-700">
                      !
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">
                        Human checkpoint
                      </p>

                      <h2 className="mt-1 text-2xl font-bold tracking-tight">
                        AutoFind stopped here.
                      </h2>

                      <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900/80">
                        This part requires your judgment.
                        Review the listings, approve the
                        ones you want, and AutoFind will
                        continue from here.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid max-w-md grid-cols-3 gap-2">
                    <CheckpointStat
                      value={candidates.length}
                      label="Candidates"
                    />

                    <CheckpointStat
                      value={selectedCount}
                      label="Selected"
                    />

                    <CheckpointStat
                      value={approvedCount}
                      label="Approved"
                    />
                  </div>
                </div>

                <div className="p-5 sm:p-7">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm font-semibold">
                      Listings found
                    </p>

                    <p className="text-xs text-slate-400">
                      {candidates.length} results
                    </p>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    {candidates.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 lg:col-span-2">
                        No listings were extracted.
                      </div>
                    ) : (
                      candidates.map(
                        (candidate, index) => (
                          <div
                            key={`${candidate.url}-${index}`}
                            className={`rounded-2xl border p-4 transition ${
                              candidate.approved
                                ? "border-emerald-300 bg-emerald-50/40"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                            }`}
                          >
                            <div className="flex gap-3">
                              <input
                                type="checkbox"
                                checked={
                                  candidate.selected ===
                                  true
                                }
                                onChange={() =>
                                  toggleCandidate(index)
                                }
                                className="mt-1 h-4 w-4 shrink-0 accent-slate-950"
                              />

                              <div className="min-w-0 flex-1">
                                <p className="font-semibold leading-5">
                                  {candidate.title}
                                </p>

                                <p className="mt-1 text-sm text-slate-600">
                                  {candidate.company}
                                </p>

                                <a
                                  href={candidate.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-2 block truncate text-xs text-slate-400 hover:text-slate-700 hover:underline"
                                  title={candidate.url}
                                >
                                  View listing ↗
                                </a>

                                <div className="mt-3 flex gap-2">
                                  <button
                                    onClick={() =>
                                      approveCandidate(
                                        index
                                      )
                                    }
                                    className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                                      candidate.approved
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-slate-950 text-white hover:bg-slate-800"
                                    }`}
                                  >
                                    {candidate.approved
                                      ? "Approved"
                                      : "Approve"}
                                  </button>

                                  <button
                                    onClick={() =>
                                      rejectCandidate(
                                        index
                                      )
                                    }
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      )
                    )}
                  </div>

                  <div className="mt-6 border-t border-slate-200 pt-5">
                    <button
                      onClick={() => execute(true)}
                      disabled={
                        executing ||
                        approvedCount === 0
                      }
                      className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {executing
                        ? "Continuing..."
                        : "Continue automation →"}
                    </button>

                    {approvedCount === 0 && (
                      <p className="mt-2 text-xs text-slate-400">
                        Approve at least one listing before
                        continuing.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* EXECUTION RESULT */}

            {execution && (
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                      Run history
                    </p>

                    <h2 className="mt-1 text-xl font-bold">
                      Execution result
                    </h2>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                      execution.status === "completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {execution.status}
                  </span>
                </div>

                <div className="mt-5 space-y-2">
                  {execution.steps.map((step) => (
                    <div
                      key={step.order}
                      className={`flex items-start gap-3 rounded-2xl border p-3.5 ${
                        step.status ===
                        "human_checkpoint"
                          ? "border-amber-200 bg-amber-50"
                          : "border-slate-200 bg-slate-50/50"
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          step.status ===
                          "human_checkpoint"
                            ? "bg-amber-100 text-amber-700"
                            : step.status ===
                              "completed"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {step.status ===
                        "human_checkpoint"
                          ? "!"
                          : step.status === "completed"
                          ? "✓"
                          : "·"}
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-5">
                          {step.order}.{" "}
                          {step.description}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {step.status ===
                          "human_checkpoint"
                            ? "Paused — waiting for your decision"
                            : step.status === "recorded"
                            ? `Pending · ${step.method}`
                            : `Completed · ${step.method}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <p className="pb-4 text-center text-xs text-slate-400">
              AutoFind · automate the mechanical work,
              keep humans in control.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  emphasis = false,
  human = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
  human?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 ${
        emphasis
          ? "border-emerald-200"
          : human
          ? "border-amber-200"
          : "border-slate-200"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p
        className={`mt-2 text-3xl font-bold tracking-tight ${
          emphasis
            ? "text-emerald-700"
            : human
            ? "text-amber-700"
            : "text-slate-950"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function CheckpointStat({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-white/70 p-3">
      <p className="text-lg font-bold text-slate-950">
        {value}
      </p>

      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
    </div>
  );
}

function DataAutomation() {
  const [file, setFile] =
    useState<File | null>(null);

  const [operations, setOperations] =
    useState<string[]>([
      "remove_duplicates",
      "trim_values",
    ]);

  const [running, setRunning] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  function toggleOperation(
    operation: string
  ) {
    setOperations((current) =>
      current.includes(operation)
        ? current.filter(
            (item) => item !== operation
          )
        : [...current, operation]
    );
  }

  async function runDataAutomation() {
    if (!file) {
      setError(
        "Upload a CSV or Excel file first."
      );
      return;
    }

    if (operations.length === 0) {
      setError(
        "Select at least one operation."
      );
      return;
    }

    setRunning(true);
    setError("");
    setMessage("");

    try {
      const formData = new FormData();

      formData.append("file", file);

      operations.forEach((operation) => {
        formData.append(
          "operations",
          operation
        );
      });

      const response = await fetch(
        "/api/data",
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Data automation failed."
        );
      }

      setMessage(
        `${data.originalRows} rows processed → ${data.finalRows} rows exported. Removed ${data.removedDuplicates} duplicates and ${data.removedEmptyRows} empty rows.`
      );

      if (data.excelBase64) {
        const binary = atob(
          data.excelBase64
        );

        const bytes = new Uint8Array(
          binary.length
        );

        for (
          let i = 0;
          i < binary.length;
          i++
        ) {
          bytes[i] =
            binary.charCodeAt(i);
        }

        const blob = new Blob(
          [bytes],
          {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }
        );

        const url =
          URL.createObjectURL(blob);

        const link =
          document.createElement("a");

        link.href = url;
        link.download =
          data.filename ||
          "autofind-cleaned.xlsx";

        document.body.appendChild(link);

        link.click();

        link.remove();

        URL.revokeObjectURL(url);
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Data automation failed."
      );
    } finally {
      setRunning(false);
    }
  }

  const options = [
    {
      id: "remove_duplicates",
      label: "Remove duplicate rows",
    },
    {
      id: "remove_empty_rows",
      label: "Remove empty rows",
    },
    {
      id: "trim_values",
      label: "Clean extra spaces",
    },
    {
      id: "normalize_columns",
      label: "Normalize column names",
    },
  ];

  return (
    <div className="mt-5">

      <label className="flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center transition hover:border-slate-400 hover:bg-white">
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(event) => {
            setFile(
              event.target.files?.[0] || null
            );

            setError("");
            setMessage("");
          }}
        />

        <div>
          <p className="font-semibold">
            {file
              ? file.name
              : "Choose CSV or Excel file"}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            CSV, XLSX, or XLS
          </p>
        </div>
      </label>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const checked =
            operations.includes(option.id);

          return (
            <label
              key={option.id}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition ${
                checked
                  ? "border-slate-300 bg-slate-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  toggleOperation(
                    option.id
                  )
                }
                className="h-4 w-4 accent-slate-950"
              />

              <span>{option.label}</span>
            </label>
          );
        })}
      </div>

      <button
        onClick={runDataAutomation}
        disabled={running}
        className="mt-3 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running
          ? "Processing..."
          : "Run data automation →"}
      </button>

      {error && (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {message}
        </div>
      )}
    </div>
  );
}