import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
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
    console.error("AutoFind status error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to read job status.",
      },
      { status: 500 }
    );
  }
}
