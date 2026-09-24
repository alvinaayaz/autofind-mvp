import { NextResponse } from "next/server";
import { analyzeWorkflow } from "@/lib/analyzer";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.workflow || typeof body.workflow !== "string") {
      return NextResponse.json(
        { error: "Workflow is required." },
        { status: 400 }
      );
    }

    const analysis = await analyzeWorkflow(body.workflow);

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("AutoFind analysis error:", error);

    return NextResponse.json(
      { error: "Failed to analyze workflow." },
      { status: 500 }
    );
  }
}