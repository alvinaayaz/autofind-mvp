import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";

type JobPayload = {
  rows: unknown[];
  workflowSteps: unknown[];
  resume: boolean;
  selectedRows: unknown[];
  approvedRows: unknown[];
};

function createJobId(): string {
  return crypto.randomUUID();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as JobPayload;

    const jobId = createJobId();

    const job = {
      jobId,
      status: "queued",
      stage: body.resume ? "resume" : "initial",
      payload: body,
      createdAt: Date.now(),
    };

    await env.AUTOFIND_JOBS.put(
      `job:${jobId}`,
      JSON.stringify(job),
      {
        expirationTtl: 86400,
      }
    );

    const token = env.GITHUB_ACTIONS_TOKEN;

    if (!token) {
      return NextResponse.json(
        { error: "GitHub Actions token is not configured." },
        { status: 500 }
      );
    }

    const githubResponse = await fetch(
      "https://api.github.com/repos/alvinaayaz/autofind-mvp/dispatches",
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "AutoFind",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: "autofind-job",
          client_payload: {
            jobId,
            stage: body.resume ? "resume" : "initial",
          },
        }),
      }
    );

    if (!githubResponse.ok) {
      const detail = await githubResponse.text();

      await env.AUTOFIND_JOBS.put(
        `job:${jobId}`,
        JSON.stringify({
          ...job,
          status: "failed",
          error: `GitHub dispatch failed: ${detail}`,
        }),
        {
          expirationTtl: 86400,
        }
      );

      return NextResponse.json(
        {
          error: "Could not start GitHub Actions job.",
          detail,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      jobId,
      status: "queued",
    });
  } catch (error) {
    console.error("AutoFind dispatcher error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to queue automation.",
      },
      { status: 500 }
    );
  }
}
