import { postDiscordWebhook, toDiscordCodeBlock } from "../discord.js";
import { loadEnv } from "../env.js";
import { formatJoinPartyEventsText } from "../joinPartyText.js";
import { buildJoinPartyTargets, enrichJoinPartyEvents } from "../joinPartyPipeline.js";
import { buildIdempotencyKey, createDynamoDocClient, loadDedupeConfigFromEnv, acceptOnce } from "../dedupe.js";

type LambdaResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
};

type LambdaContext = {
  awsRequestId?: string;
};

function jsonResponse(statusCode: number, body: unknown): LambdaResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  };
}

function logJson(level: "debug" | "info" | "warn" | "error", message: string, fields?: Record<string, unknown>): void {
  const payload = {
    level,
    message,
    ...fields
  };
  // CloudWatch Logs で検索しやすいように1行JSONで出力
  console.log(JSON.stringify(payload));
}

function parseAllowedSourceIps(value: string | undefined): Set<string> | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  const ips = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ips.length === 0) return undefined;
  return new Set(ips);
}

function getSourceIp(event: any): string | undefined {
  // HTTP API (API Gateway v2)
  const v2 = event?.requestContext?.http?.sourceIp;
  if (typeof v2 === "string" && v2.trim()) return v2.trim();

  // REST API (API Gateway v1)
  const v1 = event?.requestContext?.identity?.sourceIp;
  if (typeof v1 === "string" && v1.trim()) return v1.trim();

  // Some proxies forward this (not trusted in general, but usable for logging)
  const xff = event?.headers?.["x-forwarded-for"] ?? event?.headers?.["X-Forwarded-For"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0]?.trim();

  return undefined;
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
export const handler = async (event: any, context?: LambdaContext): Promise<LambdaResponse> => {
  const startedAt = Date.now();
  const env = loadEnv();
  const payload = parseJsonBody(event);

  const requestId = context?.awsRequestId;
  const sourceIp = getSourceIp(event);
  const allowlist = parseAllowedSourceIps(process.env.ALLOWED_SOURCE_IPS);
  if (allowlist) {
    const allowed = sourceIp ? allowlist.has(sourceIp) : false;
    if (!allowed) {
      logJson("warn", "handler.forbidden_ip", {
        requestId,
        sourceIp: sourceIp ?? null,
        allowlistSize: allowlist.size,
        durationMs: Date.now() - startedAt
      });
      return jsonResponse(403, { message: "forbidden" });
    }
  }

  logJson("info", "handler.start", {
    requestId,
    sourceIp: sourceIp ?? null,
    enableLodestone: env.enableLodestone,
    hasDefaultWorldName: Boolean(env.defaultWorldName)
  });

  const lines = extractLines(payload);
  if (lines.length === 0) {
    logJson("info", "handler.no_lines", { requestId, durationMs: Date.now() - startedAt });
    return jsonResponse(204, { message: "no lines" });
  }

  const targets = buildJoinPartyTargets({ defaultWorldName: env.defaultWorldName, lines });
  if (targets.length === 0) {
    logJson("info", "handler.no_events", {
      requestId,
      linesCount: lines.length,
      durationMs: Date.now() - startedAt
    });
    return jsonResponse(204, { message: "no events" });
  }

  // DynamoDBで10分TTLの重複排除（同一イベントの再送を抑制）
  const dedupeConfig = loadDedupeConfigFromEnv(process.env);
  const dedupeClient = dedupeConfig ? createDynamoDocClient() : undefined;
  const dedupedTargets = dedupeConfig && dedupeClient
    ? await (async () => {
        const accepted = [];
        let duplicate = 0;
        for (const event of targets) {
          const key = buildIdempotencyKey(event.rawLine);
          const result = await acceptOnce({ client: dedupeClient, config: dedupeConfig, key });
          if (result === "accepted") accepted.push(event);
          else duplicate++;
        }
        logJson("info", "dedupe.result", {
          requestId,
          tableName: dedupeConfig.tableName,
          ttlSeconds: dedupeConfig.ttlSeconds,
          inputTargets: targets.length,
          accepted: accepted.length,
          duplicate
        });
        return accepted;
      })()
    : targets;

  if (dedupedTargets.length === 0) {
    logJson("info", "handler.duplicate_only", {
      requestId,
      linesCount: lines.length,
      targetsCount: targets.length,
      durationMs: Date.now() - startedAt
    });
    return jsonResponse(204, { message: "duplicate" });
  }

  const enriched = await enrichJoinPartyEvents(env, dedupedTargets);
  const text = formatJoinPartyEventsText(enriched);

  await postDiscordWebhook({
    webhookUrl: env.discordWebhookUrl,
    content: toDiscordCodeBlock(text)
  });

  logJson("info", "handler.sent", {
    requestId,
    linesCount: lines.length,
    targetsCount: targets.length,
    sent: dedupedTargets.length,
    durationMs: Date.now() - startedAt
  });

  return jsonResponse(200, { sent: dedupedTargets.length });
};
