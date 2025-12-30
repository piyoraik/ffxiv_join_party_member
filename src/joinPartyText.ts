import type { PartyJoinEvent } from "./parser.js";

export type HighEndStatus = "ok" | "private_or_unavailable" | "error";

export type JoinPartyEnriched = {
  event: PartyJoinEvent;
  lodestoneSearchUrl?: string;
  lodestoneCharacterUrl?: string;
  highEndStatus?: HighEndStatus;
  ultimateClearsShort?: string[];
  savageClearsShort?: string[];
};

function formatHighEndClears(
  enriched: JoinPartyEnriched,
  group: "ultimate" | "savage"
): string {
  if (!enriched.lodestoneCharacterUrl && !enriched.lodestoneSearchUrl) return "";

  const status = enriched.highEndStatus;
  if (status === "private_or_unavailable") return "非公開/取得不可";
  if (status === "error") return "取得エラー";

  const clears = group === "ultimate" ? (enriched.ultimateClearsShort ?? []) : (enriched.savageClearsShort ?? []);
  if (clears.length === 0) return "なし";
  return clears.join(" / ");
}

function formatActor(event: PartyJoinEvent): string {
  if (event.familyName && event.givenName && event.worldName) {
    return `${event.familyName} ${event.givenName} @ ${event.worldName}`;
  }
  return event.characterRaw;
}

export function formatJoinPartyEventText(enriched: JoinPartyEnriched): string {
  const url = enriched.lodestoneCharacterUrl ?? enriched.lodestoneSearchUrl ?? "";
  return [
    `参加者: ${formatActor(enriched.event)}`,
    `ロードストーン: ${url}`,
    `絶クリア: ${formatHighEndClears(enriched, "ultimate")}`,
    `零式クリア: ${formatHighEndClears(enriched, "savage")}`
  ].join("\n");
}

export function formatJoinPartyEventsText(enriched: JoinPartyEnriched[]): string {
  return enriched.map((e) => formatJoinPartyEventText(e)).join("\n\n");
}

