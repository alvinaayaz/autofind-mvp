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
          data.error || "Could not start automation."
        );
      }

      if (!data.jobId) {
        throw new Error("Automation job was not created.");
      }

      setMessage("Automation started...");

      for (let attempt = 0; attempt < 180; attempt++) {
        await new Promise((resolve) =>
          setTimeout(resolve, 2000)
        );

        const statusResponse = await fetch(
          "/api/execute/status?jobId=" +
            encodeURIComponent(data.jobId)
        );

        const statusData = await statusResponse.json();

        if (!statusResponse.ok) {
          throw new Error(
            statusData.error ||
              "Could not read automation status."
          );
        }

        if (statusData.status === "waiting_for_human") {
          const result = statusData.result || {};

          setCandidates(
            Array.isArray(result.candidates)
              ? result.candidates
              : []
          );

          setExecution(
            Array.isArray(result.execution)
              ? result.execution
              : []
          );

          setMessage(
            "Automation paused — your decision is needed."
          );

          return;
        }

        if (statusData.status === "completed") {
          const result = statusData.result || {};

          setExecution(
            Array.isArray(result.execution)
              ? result.execution
              : []
          );

          setMessage(
            "Automation complete. " +
              (result.originalCount ?? 0) +
              " rows processed ? " +
              (result.finalCount ?? 0) +
              " unique rows exported."
          );

          if (result.excelBase64) {
            const binary = atob(result.excelBase64);
            const bytes = new Uint8Array(binary.length);

            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }

            const blob = new Blob([bytes], {
              type:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });

            const downloadUrl =
              URL.createObjectURL(blob);

            const link =
              document.createElement("a");

            link.href = downloadUrl;
            link.download =
              result.filename ||
              "autofind-results.xlsx";

            document.body.appendChild(link);
            link.click();
            link.remove();

            URL.revokeObjectURL(downloadUrl);
          }

          return;
        }

        if (statusData.status === "failed") {
          throw new Error(
            statusData.error ||
              "Automation failed."
          );
        }

        setMessage(
          resume
            ? "Continuing automation..."
            : "Running automation..."
        );
      }

      throw new Error(
        "Automation is taking too long. Please check the job status."
      );
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
        `${data.originalRows} rows processed ? ${data.finalRows} rows exported. Removed ${data.removedDuplicates} duplicates and ${data.removedEmptyRows} empty rows.`
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
          : "Run data automation ?"}
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
