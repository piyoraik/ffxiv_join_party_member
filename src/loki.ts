export type LokiQueryRangeResponse = {
  status: "success" | "error";
  data?: {
    resultType: "streams";
    result: Array<{
      stream: Record<string, string>;
      values: Array<[string, string]>;
    }>;
  };
  errorType?: string;
  error?: string;
};

export type LokiLogEntry = {
  timestampNs: string;
  line: string;
};

function asLokiErrorMessage(payload: LokiQueryRangeResponse): string | null {
  if (payload.status === "success") return null;
  const type = payload.errorType ? ` (${payload.errorType})` : "";
  return `${payload.error ?? "Loki error"}${type}`;
}

export async function queryRange(params: {
  baseUrl: string;
  query: string;
  startNs: string;
  endNs: string;
  limit?: number;
  direction?: "FORWARD" | "BACKWARD";
}): Promise<LokiLogEntry[]> {
  const url = new URL("/loki/api/v1/query_range", params.baseUrl);
  url.searchParams.set("query", params.query);
  url.searchParams.set("start", params.startNs);
  url.searchParams.set("end", params.endNs);
  url.searchParams.set("limit", String(params.limit ?? 500));
  url.searchParams.set("direction", params.direction ?? "BACKWARD");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Loki query failed: ${response.status} ${response.statusText}${body ? `: ${body}` : ""}`);
  }

  const payload = (await response.json()) as LokiQueryRangeResponse;
  const errorMessage = asLokiErrorMessage(payload);
  if (errorMessage) throw new Error(`Loki query failed: ${errorMessage}`);

  const result = payload.data?.result ?? [];
  const entries: LokiLogEntry[] = [];
  for (const stream of result) {
    for (const value of stream.values) {
      entries.push({ timestampNs: value[0], line: value[1] });
    }
  }

  // Loki may return unsorted when multiple streams are involved.
  entries.sort((a, b) => (a.timestampNs < b.timestampNs ? -1 : a.timestampNs > b.timestampNs ? 1 : 0));
  return entries;
}

