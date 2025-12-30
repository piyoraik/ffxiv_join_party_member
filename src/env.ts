export type AppEnv = {
  lokiBaseUrl: string;
  query: string;
  lookbackSeconds: number;
  discordWebhookUrl: string;
  discordUsername?: string;
  discordAvatarUrl?: string;
  enableLodestone: boolean;
};

const DEFAULT_LOKI_BASE_URL = "http://loki.monitoring.svc.cluster.local:3100";
const DEFAULT_QUERY =
  '{content="ffxiv",job="ffxiv-dungeon",instance="DESKTOP-LHEGLIC"} |= "がパーティに参加しました"';
const DEFAULT_LOOKBACK_SECONDS = 70;
const DEFAULT_ENABLE_LODESTONE = true;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

/**
 * 環境変数から設定を読み込みます。
 *
 * k8s では `Secret/ConfigMap` 経由で注入する想定です。
 */
export function loadEnv(): AppEnv {
  return {
    lokiBaseUrl: process.env.LOKI_BASE_URL ?? DEFAULT_LOKI_BASE_URL,
    query: process.env.LOKI_QUERY ?? DEFAULT_QUERY,
    lookbackSeconds: parsePositiveInt(process.env.LOOKBACK_SECONDS, DEFAULT_LOOKBACK_SECONDS),
    discordWebhookUrl: requireEnv("DISCORD_WEBHOOK_URL"),
    discordUsername: process.env.DISCORD_USERNAME,
    discordAvatarUrl: process.env.DISCORD_AVATAR_URL,
    enableLodestone: parseBoolean(process.env.ENABLE_LODESTONE, DEFAULT_ENABLE_LODESTONE)
  };
}
