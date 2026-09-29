import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";

function authorized(request: Request): boolean {
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${env.GITHUB_ACTIONS_TOKEN}`;
}

export async function POST(request: Request) {
  try {
    if (!authorized(request)) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const jobId = body.jobId;

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json(
        { error: "jobId is required." },
        { status: 400 }
      );
    }

    const existing = await env.AUTOFIND_JOBS.get(
      `job:${jobId}`,
      "json"
    );

    if (!existing) {
      return NextResponse.json(
        { error: "Job not found." },
        { status: 404 }
      );
    }

    const updated = {
      ...existing,
      status: body.status || "completed",
      stage: body.stage || existing.stage,
      result: body.result || null,
      error: body.error || null,
      completedAt: Date.now(),
    };

    await env.AUTOFIND_JOBS.put(
      `job:${jobId}`,
      JSON.stringify(updated),
      {
        expirationTtl: 86400,
      }
    );

    return NextResponse.json({
      success: true,
      jobId,
      status: updated.status,
    });
  } catch (error) {
    console.error("AutoFind callback error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save callback.",
      },
      { status: 500 }
    );
  }
}
