import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";

function authorized(request: Request): boolean {
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${env.GITHUB_ACTIONS_TOKEN}`;
}

export async function GET(request: Request) {
  try {
    if (!authorized(request)) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const jobId = url.searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required." },
        { status: 400 }
      );
    }

    const job = await env.AUTOFIND_JOBS.get(
      `job:${jobId}`,
      "json"
    );

    if (!job) {
      return NextResponse.json(
        { error: "Job not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(job);
  } catch (error) {
    console.error("AutoFind job retrieval error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to retrieve job.",
      },
      { status: 500 }
    );
  }
}
