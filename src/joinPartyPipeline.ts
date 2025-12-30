import type { AppEnv } from "./env.js";
import type { PartyJoinEvent } from "./parser.js";
import type { JoinPartyEnriched } from "./joinPartyText.js";
import { sleep } from "./discord.js";
import { enrichJoinPartyEventWithLodestone } from "./lodestoneEnrichment.js";
import { parsePartyJoinEvent } from "./parser.js";

function buildEventKey(event: PartyJoinEvent): string {
  if (event.familyName && event.givenName && event.worldName) {
    return `${event.familyName} ${event.givenName}@${event.worldName}`;
  }
  return event.characterRaw;
}

/**
 * ログ文字列一覧から「パーティ参加」イベントだけを抽出します。
 */
export function extractJoinPartyEventsFromLines(lines: string[]): PartyJoinEvent[] {
  return lines.map((line) => parsePartyJoinEvent(line)).filter((e): e is NonNullable<typeof e> => Boolean(e));
}

/**
 * ゲーム仕様による「ワールド名省略」を補完します。
 *
 * ログ提供者と参加者が同一ワールドの場合、ログにワールド名が含まれず
 * `Azu Scalaがパーティに参加しました。` のように 2語で終わることがあります。
 *
 * その場合、`DEFAULT_WORLD_NAME` で指定されたワールド名を代入します。
 */
export function fillMissingWorldName(defaultWorldName: string | undefined, event: PartyJoinEvent): PartyJoinEvent {
  if (!defaultWorldName) return event;
  if (event.worldName) return event;
  if (!event.familyName || !event.givenName) return event;
  return { ...event, worldName: defaultWorldName };
}

/**
 * ログ行一覧から参加イベントを抽出し、ワールド名補完と重複排除まで行います。
 */
export function buildJoinPartyTargets(params: {
  defaultWorldName?: string;
  lines: string[];
}): PartyJoinEvent[] {
  const extracted = extractJoinPartyEventsFromLines(params.lines);
  const normalized = extracted.map((event) => fillMissingWorldName(params.defaultWorldName, event));
  return dedupeJoinPartyEvents(normalized);
}

/**
 * 同一キャラクターの複数行（同一検索範囲内）をまとめて重複排除します。
 *
 * - 重複対策は「同一キャラを何度も並べない」目的のみ
 * - 送信済み位置の永続化は要件外（再起動で再送は許容）
 */
export function dedupeJoinPartyEvents(events: PartyJoinEvent[]): PartyJoinEvent[] {
  const unique = new Map<string, PartyJoinEvent>();
  for (const event of events) {
    const key = buildEventKey(event);
    if (!unique.has(key)) unique.set(key, event);
  }
  return Array.from(unique.values());
}

/**
 * 参加イベントを Lodestone 情報で拡張します（必要な場合のみ）。
 */
export async function enrichJoinPartyEvents(
  env: Pick<AppEnv, "enableLodestone" | "defaultWorldName">,
  events: PartyJoinEvent[]
): Promise<JoinPartyEnriched[]> {
  const normalized = events.map((event) => fillMissingWorldName(env.defaultWorldName, event));
  if (!env.enableLodestone) return normalized.map((event) => ({ event }));

  const enriched: JoinPartyEnriched[] = [];
  for (const event of normalized) {
    enriched.push(await enrichJoinPartyEventWithLodestone(event));
    await sleep(250);
  }
  return enriched;
}
