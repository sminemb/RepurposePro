export type SourceVideoResponsePlan =
  | {
      readonly contentLength: number;
      readonly contentRange: null | string;
      readonly end: number;
      readonly start: number;
      readonly status: 200 | 206;
    }
  | { readonly contentRange: string; readonly status: 416 };

export function createSourceVideoResponsePlan(
  rangeHeader: string | undefined,
  fileSizeBytes: number,
): SourceVideoResponsePlan {
  const unsatisfiable = (): SourceVideoResponsePlan => ({
    contentRange: `bytes */${fileSizeBytes}`,
    status: 416,
  });
  if (!Number.isSafeInteger(fileSizeBytes) || fileSizeBytes <= 0) return unsatisfiable();
  if (rangeHeader === undefined) {
    return {
      contentLength: fileSizeBytes,
      contentRange: null,
      end: fileSizeBytes - 1,
      start: 0,
      status: 200,
    };
  }
  if (rangeHeader.includes(",")) return unsatisfiable();
  const match = /^bytes=(\d*)-(\d*)$/u.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) return unsatisfiable();

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = parseInteger(match[2]);
    if (suffixLength === null || suffixLength <= 0) return unsatisfiable();
    start = Math.max(0, fileSizeBytes - suffixLength);
    end = fileSizeBytes - 1;
  } else {
    const parsedStart = parseInteger(match[1]);
    if (parsedStart === null || parsedStart >= fileSizeBytes) return unsatisfiable();
    start = parsedStart;
    if (!match[2]) {
      end = fileSizeBytes - 1;
    } else {
      const parsedEnd = parseInteger(match[2]);
      if (parsedEnd === null || parsedEnd < start) return unsatisfiable();
      end = Math.min(parsedEnd, fileSizeBytes - 1);
    }
  }

  return {
    contentLength: end - start + 1,
    contentRange: `bytes ${start}-${end}/${fileSizeBytes}`,
    end,
    start,
    status: 206,
  };
}

function parseInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
