import { NextResponse } from "next/server";
import {
  processSpreadsheet,
  type DataOperation,
} from "@/lib/dataExecutor";

const allowedOperations:
  DataOperation[] = [
    "remove_duplicates",
    "remove_empty_rows",
    "trim_values",
    "normalize_columns",
  ];

export async function POST(
  request: Request
) {
  try {
    const formData =
      await request.formData();

    const file =
      formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error:
            "Please upload a CSV or Excel file.",
        },
        { status: 400 }
      );
    }

    const filename =
      file.name.toLowerCase();

    const isSupported =
      filename.endsWith(".csv") ||
      filename.endsWith(".xlsx") ||
      filename.endsWith(".xls");

    if (!isSupported) {
      return NextResponse.json(
        {
          error:
            "Only CSV, XLSX, and XLS files are supported.",
        },
        { status: 400 }
      );
    }

    const operationValues =
      formData.getAll(
        "operations"
      );

    const operations =
      operationValues
        .map((value) =>
          String(value)
        )
        .filter(
          (
            value
          ): value is DataOperation =>
            allowedOperations.includes(
              value as DataOperation
            )
        );

    if (
      operations.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Select at least one data operation.",
        },
        { status: 400 }
      );
    }

    const arrayBuffer =
      await file.arrayBuffer();

    const buffer =
      Buffer.from(arrayBuffer);

    const result =
      processSpreadsheet(
        buffer,
        operations
      );

    return NextResponse.json(
      result
    );
  } catch (error) {
    console.error(
      "AutoFind data automation error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process spreadsheet.",
      },
      { status: 500 }
    );
  }
}