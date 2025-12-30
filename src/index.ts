import { loadEnv } from "./env.js";
import { postDiscordWebhook } from "./discord.js";
import { queryRange } from "./loki.js";
import { parsePartyJoinEvent, type PartyJoinEvent } from "./parser.js";

function nowNs(): string {
  return String(Date.now() * 1_000_000);
}

function minusSecondsNs(endNs: string, seconds: number): string {
  const end = Number.parseInt(endNs, 10);
  const start = end - seconds * 1_000_000_000;
  return String(start);
}

function formatEvent(e: PartyJoinEvent): string {
  if (e.familyName && e.givenName) {
    const worldSuffix = e.worldName ? ` (${e.worldName})` : "";
    return `${e.familyName} ${e.givenName}${worldSuffix}`;
  }
  return e.characterRaw;
}

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

  const events = entries
    .map((e) => parsePartyJoinEvent(e.line))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  if (events.length === 0) {
    console.log("No party-join events found.");
    return;
  }

  const lines = events.map((e) => `- ${formatEvent(e)}`);
  const content = [`パーティ参加ログ（直近${env.lookbackSeconds}s）`, ...lines].join("\n");

  await postDiscordWebhook({
    webhookUrl: env.discordWebhookUrl,
    content,
    username: env.discordUsername,
    avatarUrl: env.discordAvatarUrl
  });

  console.log(`Sent ${events.length} event(s) to Discord.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
