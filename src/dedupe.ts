import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "node:crypto";

export type DedupeConfig = {
  tableName: string;
  ttlSeconds: number;
};

export type DedupeStats = {
  accepted: number;
  duplicate: number;
};

const DEFAULT_TTL_SECONDS = 600;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

/**
 * 重複排除の設定を環境変数から読み取ります。
 *
 * - `DEDUPE_TABLE_NAME` が未設定なら重複排除は無効
 * - `DEDUPE_TTL_SECONDS` はデフォルト10分（600秒）
 */
export function loadDedupeConfigFromEnv(env: NodeJS.ProcessEnv): DedupeConfig | undefined {
  const tableName = env.DEDUPE_TABLE_NAME?.trim();
  if (!tableName) return undefined;

  const ttlSeconds = parsePositiveInt(env.DEDUPE_TTL_SECONDS, DEFAULT_TTL_SECONDS);
  return { tableName, ttlSeconds };
}

/**
 * ログ行の末尾に付与されているID（例: `|c707e700297d867e`）を抽出します。
 *
 * 取得できない場合は `undefined` を返します。
 */
export function extractLogIdFromLine(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;

  const lastPipe = trimmed.lastIndexOf("|");
  if (lastPipe === -1) return undefined;
  const tail = trimmed.slice(lastPipe + 1).trim();

  // ACTログの例では 16桁hex だが、将来を考えて 8桁以上のhexを許容
  if (/^[0-9a-f]{8,}$/i.test(tail)) return tail.toLowerCase();
  return undefined;
}

/**
 * 冪等キー（重複排除用キー）を生成します。
 *
 * - 可能ならログ末尾のIDを利用（最も安定）
 * - 無い場合は行全体のSHA-256（32bytes）をhex化して利用
 */
export function buildIdempotencyKey(line: string): string {
  const logId = extractLogIdFromLine(line);
  if (logId) return `logid:${logId}`;

  const hash = crypto.createHash("sha256").update(line, "utf8").digest("hex");
  return `sha256:${hash}`;
}

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * DynamoDB（条件付きPut）で重複を排除します。
 *
 * - 初回: `PutItem (attribute_not_exists(pk))` が成功 → accepted
 * - 2回目以降: 条件不一致 → duplicate
 */
export async function acceptOnce(params: {
  client: DynamoDBDocumentClient;
  config: DedupeConfig;
  key: string;
  nowSeconds?: number;
}): Promise<"accepted" | "duplicate"> {
  const now = params.nowSeconds ?? nowEpochSeconds();
  const expiresAt = now + params.config.ttlSeconds;

  try {
    await params.client.send(
      new PutCommand({
        TableName: params.config.tableName,
        Item: {
          pk: params.key,
          expiresAt
        },
        ConditionExpression: "attribute_not_exists(pk)"
      })
    );
    return "accepted";
  } catch (error: any) {
    if (error?.name === "ConditionalCheckFailedException") return "duplicate";
    throw error;
  }
}

/**
 * Lambda内で使うDynamoDBクライアントを生成します。
 */
export function createDynamoDocClient(): DynamoDBDocumentClient {
  const client = new DynamoDBClient({});
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true
    }
  });
}

