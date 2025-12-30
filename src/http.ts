export type FetchTextOptions = {
  timeoutMs: number;
  headers?: Record<string, string>;
};

/**
 * 指定URLをGETして、レスポンスボディを文字列として返します。
 *
 * - `timeoutMs` を超えたら Abort します
 * - HTTPエラーは本文（取得できれば）を含めて例外にします
 */
export async function fetchText(url: string, options: FetchTextOptions): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: options.headers,
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} ${response.statusText}${body ? `: ${body}` : ""}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

