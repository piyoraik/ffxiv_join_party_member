import { loadEnv } from "./env.js";
import { postDiscordWebhook, toDiscordCodeBlock } from "./discord.js";
import { queryRange } from "./loki.js";
import { formatJoinPartyEventsText } from "./joinPartyText.js";
import { dedupeJoinPartyEvents, enrichJoinPartyEvents, extractJoinPartyEvents } from "./joinPartyPipeline.js";
import { minusSecondsNs, nowNs } from "./time.js";

/**
 * エントリポイント。
 *
 * - Loki から直近ログを取得
 * - パーティ参加イベント抽出＆重複排除
 * - （任意）Lodestone でURL/高難度達成状況を補完
 * - Discord webhook に送信
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const endNs = nowNs();
  const startNs = minusSecondsNs(endNs, env.lookbackSeconds);

  const entries = await queryRange({
    baseUrl: env.lokiBaseUrl,
    query: env.query,
    startNs,
    endNs,
    limit: 500,
    direction: "BACKWARD"
  });

  const events = extractJoinPartyEvents(entries);

  if (events.length === 0) {
    console.log("No party-join events found.");
    return;
  }

  const targets = dedupeJoinPartyEvents(events);
  const enriched = await enrichJoinPartyEvents(env, targets);

  const text = formatJoinPartyEventsText(enriched);
  const content = toDiscordCodeBlock(text);

  await postDiscordWebhook({
    webhookUrl: env.discordWebhookUrl,
    content,
    username: env.discordUsername,
    avatarUrl: env.discordAvatarUrl
  });

  console.log(`Sent ${targets.length} unique event(s) to Discord.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
