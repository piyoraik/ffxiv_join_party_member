import type { AppEnv } from "./env.js";
import type { LokiLogEntry } from "./loki.js";
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
 * Loki のログエントリ一覧から「パーティ参加」イベントだけを抽出します。
 */
export function extractJoinPartyEvents(entries: LokiLogEntry[]): PartyJoinEvent[] {
  return entries
    .map((e) => parsePartyJoinEvent(e.line))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));
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
  env: Pick<AppEnv, "enableLodestone">,
  events: PartyJoinEvent[]
): Promise<JoinPartyEnriched[]> {
  if (!env.enableLodestone) return events.map((event) => ({ event }));

  const enriched: JoinPartyEnriched[] = [];
  for (const event of events) {
    enriched.push(await enrichJoinPartyEventWithLodestone(event));
    await sleep(250);
  }
  return enriched;
}

