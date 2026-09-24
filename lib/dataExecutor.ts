import * as XLSX from "xlsx";

export type DataOperation =
  | "remove_duplicates"
  | "remove_empty_rows"
  | "trim_values"
  | "normalize_columns";

export type DataExecutionResult = {
  success: boolean;
  originalRows: number;
  finalRows: number;
  removedDuplicates: number;
  removedEmptyRows: number;
  operations: string[];
  rows: Record<string, unknown>[];
  excelBase64: string;
  filename: string;
};

function normalizeValue(
  value: unknown
): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function rowIsEmpty(
  row: Record<string, unknown>
): boolean {
  return Object.values(row).every(
    (value) =>
      String(value ?? "").trim() === ""
  );
}

function dedupeRows(
  rows: Record<string, unknown>[]
): {
  rows: Record<string, unknown>[];
  removed: number;
} {
  const seen = new Set<string>();
  const result: Record<string, unknown>[] =
    [];

  for (const row of rows) {
    const key = Object.entries(row)
      .map(
        ([column, value]) =>
          `${column}:${normalizeValue(value)}`
      )
      .join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(row);
  }

  return {
    rows: result,
    removed:
      rows.length - result.length,
  };
}

function trimRows(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  return rows.map((row) => {
    const cleaned: Record<
      string,
      unknown
    > = {};

    for (const [key, value] of Object.entries(
      row
    )) {
      cleaned[key.trim()] =
        typeof value === "string"
          ? value.trim()
          : value;
    }

    return cleaned;
  });
}

function normalizeColumnNames(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  return rows.map((row) => {
    const normalized: Record<
      string,
      unknown
    > = {};

    for (const [key, value] of Object.entries(
      row
    )) {
      normalized[
        key
          .trim()
          .replace(/\s+/g, " ")
      ] = value;
    }

    return normalized;
  });
}

function createExcelBase64(
  rows: Record<string, unknown>[]
): string {
  const worksheet =
    XLSX.utils.json_to_sheet(rows);

  worksheet["!cols"] =
    Object.keys(rows[0] || {}).map(
      () => ({
        wch: 25,
      })
    );

  const workbook =
    XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "AutoFind Results"
  );

  const buffer =
    XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

  return Buffer.from(
    buffer
  ).toString("base64");
}

export function processSpreadsheet(
  buffer: Buffer,
  operations: DataOperation[]
): DataExecutionResult {
  const workbook =
    XLSX.read(buffer, {
      type: "buffer",
    });

  const firstSheet =
    workbook.Sheets[
      workbook.SheetNames[0]
    ];

  if (!firstSheet) {
    throw new Error(
      "The spreadsheet does not contain a worksheet."
    );
  }

  let rows =
    XLSX.utils.sheet_to_json<
      Record<string, unknown>
    >(firstSheet, {
      defval: "",
    });

  const originalRows =
    rows.length;

  let removedEmptyRows = 0;
  let removedDuplicates = 0;

  if (
    operations.includes(
      "remove_empty_rows"
    )
  ) {
    const before =
      rows.length;

    rows =
      rows.filter(
        (row) =>
          !rowIsEmpty(row)
      );

    removedEmptyRows =
      before - rows.length;
  }

  if (
    operations.includes(
      "trim_values"
    )
  ) {
    rows =
      trimRows(rows);
  }

  if (
    operations.includes(
      "normalize_columns"
    )
  ) {
    rows =
      normalizeColumnNames(rows);
  }

  if (
    operations.includes(
      "remove_duplicates"
    )
  ) {
    const result =
      dedupeRows(rows);

    rows =
      result.rows;

    removedDuplicates =
      result.removed;
  }

  const excelBase64 =
    createExcelBase64(
      rows
    );

  return {
    success: true,

    originalRows,

    finalRows:
      rows.length,

    removedDuplicates,

    removedEmptyRows,

    operations,

    rows,

    excelBase64,

    filename:
      `autofind-cleaned-${Date.now()}.xlsx`,
  };
}