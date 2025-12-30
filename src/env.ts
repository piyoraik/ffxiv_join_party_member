export type AppEnv = {
  discordWebhookUrl: string;
  enableLodestone: boolean;
  defaultWorldName?: string;
};

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
    discordWebhookUrl: requireEnv("DISCORD_WEBHOOK_URL"),
    enableLodestone: parseBoolean(process.env.ENABLE_LODESTONE, DEFAULT_ENABLE_LODESTONE),
    // ゲーム仕様: ログ提供者と同一ワールドの場合、ログにワールド名が含まれないことがあるため補完用に使用します。
    defaultWorldName: process.env.DEFAULT_WORLD_NAME?.trim() || undefined
  };
}
