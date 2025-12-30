/**
 * 指定ミリ秒だけ待機します。
 */
export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Discord のコードブロック形式に変換し、2000文字制限に引っかからないように切り詰めます。
 */
export function toDiscordCodeBlock(text: string, maxChars = 1900): string {
  const sanitized = text.replace(/```/g, "'''").trim();
  const truncated =
    sanitized.length > maxChars ? sanitized.slice(0, maxChars - 1).trimEnd() + "…" : sanitized;
  return "```\n" + truncated + "\n```";
}

type WebhookPayload = {
  content: string;
  username?: string;
  avatar_url?: string;
};

/**
 * Discord webhook にpayloadをPOSTします（ステータス判定は呼び出し側）。
 */
async function sendWebhook(webhookUrl: string, payload: WebhookPayload): Promise<Response> {
  return await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

/**
 * Discord Webhook に送信します（レート制限: HTTP 429 の場合は 1 回だけリトライします）。
 */
export async function postDiscordWebhook(params: {
  webhookUrl: string;
  content: string;
  username?: string;
  avatarUrl?: string;
}): Promise<void> {
  const payload: WebhookPayload = {
    content: params.content,
    username: params.username,
    avatar_url: params.avatarUrl
  };

  const response = await sendWebhook(params.webhookUrl, payload);
  if (response.ok) return;

  if (response.status === 429) {
    let retryAfterMs = 1500;
    try {
      const data = (await response.json()) as { retry_after?: number };
      if (typeof data.retry_after === "number") retryAfterMs = Math.ceil(data.retry_after * 1000);
    } catch {
      // 無視（JSONが読めない場合はデフォルト値で待機）
    }
    await sleep(retryAfterMs);

    const retry = await sendWebhook(params.webhookUrl, payload);
    if (retry.ok) return;

    const body = await retry.text().catch(() => "");
    throw new Error(
      `Discord webhook failed: ${retry.status} ${retry.statusText}${body ? `: ${body}` : ""}`
    );
  }

  const body = await response.text().catch(() => "");
  throw new Error(
    `Discord webhook failed: ${response.status} ${response.statusText}${body ? `: ${body}` : ""}`
  );
}
