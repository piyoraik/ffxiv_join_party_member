import { postDiscordWebhook, toDiscordCodeBlock } from "../discord.js";
import { loadEnv } from "../env.js";
import { formatJoinPartyEventsText } from "../joinPartyText.js";
import { buildJoinPartyTargets, enrichJoinPartyEvents } from "../joinPartyPipeline.js";

type LambdaResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
};

function jsonResponse(statusCode: number, body: unknown): LambdaResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  };
}

function parseJsonBody(event: any): unknown {
  const body = event?.body;
  if (typeof body !== "string") return body;
  const decoded = event?.isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
  try {
    return JSON.parse(decoded);
  } catch {
    return decoded;
  }
}

function extractLines(payload: unknown): string[] {
  if (!payload) return [];

  // そのまま record が来るケース: { line: "..." }
  if (typeof (payload as any).line === "string") return [(payload as any).line];

  // out_http などが tag/time/record で包むケース: { record: { line: "..." } }
  if (typeof (payload as any).record?.line === "string") return [(payload as any).record.line];

  // バッチ: { records: [...] } / [..., ...]
  if (Array.isArray(payload)) return payload.flatMap((p) => extractLines(p));
  if (Array.isArray((payload as any).records)) return (payload as any).records.flatMap((p: unknown) => extractLines(p));

  return [];
}

/**
 * Fluentd からの POST を受けて、パーティ参加イベントのみ Discord に通知します。
 *
 * 想定:
 * - Fluentd 側で「がパーティに参加しました」を filter 済み（ただし二重チェックして安全側に倒す）
 */
export const handler = async (event: any): Promise<LambdaResponse> => {
  const env = loadEnv();
  const payload = parseJsonBody(event);

  const lines = extractLines(payload);
  if (lines.length === 0) return jsonResponse(204, { message: "no lines" });

  const targets = buildJoinPartyTargets({ defaultWorldName: env.defaultWorldName, lines });
  if (targets.length === 0) return jsonResponse(204, { message: "no events" });

  const enriched = await enrichJoinPartyEvents(env, targets);
  const text = formatJoinPartyEventsText(enriched);

  await postDiscordWebhook({
    webhookUrl: env.discordWebhookUrl,
    content: toDiscordCodeBlock(text)
  });

  return jsonResponse(200, { sent: targets.length });
};
