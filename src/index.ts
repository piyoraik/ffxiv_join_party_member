import { loadEnv } from "./env.js";
import { postDiscordWebhook } from "./discord.js";
import { queryRange } from "./loki.js";
import { parsePartyJoinEvent, type PartyJoinEvent } from "./parser.js";
import { buildLodestoneSearchUrl, fetchTopCharacterUrl } from "./lodestone.js";
import {
  buildAchievementCategoryUrl,
  fetchAchievementCategoryHtml,
  getHighEndAchievementGroupMap,
  getHighEndAchievementShortMap,
  parseHighEndClearsFromAchievementHtml
} from "./lodestoneAchievements.js";

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type LodestoneEnriched = {
  event: PartyJoinEvent;
  lodestoneSearchUrl?: string;
  lodestoneCharacterUrl?: string;
  achievementUrl?: string;
  highEndStatus?: "ok" | "private_or_unavailable" | "error";
  ultimateClearsShort?: string[];
  savageClearsShort?: string[];
};

async function enrichWithLodestone(event: PartyJoinEvent): Promise<LodestoneEnriched> {
  if (!event.familyName || !event.givenName || !event.worldName) return { event };

  const name = `${event.familyName} ${event.givenName}`;
  const searchUrl = buildLodestoneSearchUrl({ name, world: event.worldName });

  let characterUrl: string | undefined;
  try {
    characterUrl = await fetchTopCharacterUrl(searchUrl);
  } catch {
    return { event, lodestoneSearchUrl: searchUrl, highEndStatus: "error" };
  }

  if (!characterUrl) return { event, lodestoneSearchUrl: searchUrl };

  const achievementUrl = buildAchievementCategoryUrl(characterUrl);
  if (!achievementUrl) return { event, lodestoneSearchUrl: searchUrl, lodestoneCharacterUrl: characterUrl };

  try {
    const html = await fetchAchievementCategoryHtml(achievementUrl);
    const parsed = parseHighEndClearsFromAchievementHtml(html);

    const shortMap = getHighEndAchievementShortMap();
    const groupMap = getHighEndAchievementGroupMap();
    const ultimate: string[] = [];
    const savage: string[] = [];
    for (const name of parsed.clears) {
      const short = shortMap.get(name) ?? name;
      const group = groupMap.get(name);
      if (group === "ultimate") ultimate.push(short);
      if (group === "savage") savage.push(short);
    }

    return {
      event,
      lodestoneSearchUrl: searchUrl,
      lodestoneCharacterUrl: characterUrl,
      achievementUrl,
      highEndStatus: parsed.status,
      ultimateClearsShort: ultimate,
      savageClearsShort: savage
    };
  } catch {
    return {
      event,
      lodestoneSearchUrl: searchUrl,
      lodestoneCharacterUrl: characterUrl,
      achievementUrl,
      highEndStatus: "error"
    };
  }
}

function formatEnriched(e: LodestoneEnriched): string {
  const base = formatEvent(e.event);
  const url = e.lodestoneCharacterUrl ?? e.lodestoneSearchUrl;
  const urlText = url ? ` Lodestone: ${url}` : "";

  if (!e.highEndStatus) return `${base}${urlText}`;
  if (e.highEndStatus === "private_or_unavailable") return `${base}${urlText} 高難度: 非公開/取得不可`;
  if (e.highEndStatus === "error") return `${base}${urlText} 高難度: 取得失敗`;

  const ult = (e.ultimateClearsShort ?? []).join(", ");
  const sav = (e.savageClearsShort ?? []).join(", ");
  const ultText = ult ? ` 絶: ${ult}` : " 絶: -";
  const savText = sav ? ` 零式: ${sav}` : " 零式: -";
  return `${base}${urlText}${ultText}${savText}`;
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

  const unique = new Map<string, PartyJoinEvent>();
  for (const e of events) {
    const key = e.familyName && e.givenName && e.worldName ? `${e.familyName} ${e.givenName}@${e.worldName}` : e.characterRaw;
    if (!unique.has(key)) unique.set(key, e);
  }

  const targets = Array.from(unique.values());
  const enriched: LodestoneEnriched[] = [];
  if (env.enableLodestone) {
    for (const e of targets) {
      enriched.push(await enrichWithLodestone(e));
      await sleep(250);
    }
  } else {
    enriched.push(...targets.map((event) => ({ event })));
  }

  const lines = enriched.map((e) => `- ${formatEnriched(e)}`);
  const content = [`パーティ参加ログ（直近${env.lookbackSeconds}s）`, ...lines].join("\n");

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
