import { loadEnv } from "./env.js";
import { postDiscordWebhook, sleep, toDiscordCodeBlock } from "./discord.js";
import { queryRange } from "./loki.js";
import { parsePartyJoinEvent, type PartyJoinEvent } from "./parser.js";
import { buildLodestoneSearchUrl, fetchCharacterIdentity, fetchTopCharacterUrl } from "./lodestone.js";
import {
  buildAchievementCategoryUrl,
  fetchAchievementCategoryHtml,
  getHighEndAchievementGroupMap,
  getHighEndAchievementShortMap,
  parseHighEndClearsFromAchievementHtml
} from "./lodestoneAchievements.js";
import { formatJoinPartyEventsText, type JoinPartyEnriched } from "./joinPartyText.js";

function nowNs(): string {
  return String(Date.now() * 1_000_000);
}

function minusSecondsNs(endNs: string, seconds: number): string {
  const end = Number.parseInt(endNs, 10);
  const start = end - seconds * 1_000_000_000;
  return String(start);
}

async function enrichWithLodestone(event: PartyJoinEvent): Promise<JoinPartyEnriched> {
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

  // 参加者と同姓同名（かつ同ワールド）のキャラページであることを確認できた場合のみ、Lodestone 情報を出力します。
  try {
    const identity = await fetchCharacterIdentity(characterUrl);
    const expectedName = name.trim();
    const expectedWorld = event.worldName.trim();
    const matched =
      identity &&
      identity.name.trim() === expectedName &&
      identity.world.trim().toLowerCase() === expectedWorld.toLowerCase();
    if (!matched) return { event };
  } catch {
    // 取得できない場合は誤検出防止のため Lodestone 情報を出さない
    return { event };
  }

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
      highEndStatus: parsed.status,
      ultimateClearsShort: ultimate,
      savageClearsShort: savage
    };
  } catch {
    return {
      event,
      lodestoneSearchUrl: searchUrl,
      lodestoneCharacterUrl: characterUrl,
      highEndStatus: "error"
    };
  }
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
  const enriched: JoinPartyEnriched[] = [];
  if (env.enableLodestone) {
    for (const e of targets) {
      enriched.push(await enrichWithLodestone(e));
      await sleep(250);
    }
  } else {
    enriched.push(...targets.map((event) => ({ event })));
  }

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
