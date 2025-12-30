import type { PartyJoinEvent } from "./parser.js";
import type { JoinPartyEnriched } from "./joinPartyText.js";
import { buildLodestoneSearchUrl, fetchCharacterIdentity, fetchTopCharacterUrl } from "./lodestone.js";
import {
  buildAchievementCategoryUrl,
  fetchAchievementCategoryHtml,
  getHighEndAchievementGroupMap,
  getHighEndAchievementShortMap,
  parseHighEndClearsFromAchievementHtml
} from "./lodestoneAchievements.js";

type VerifiedCharacter = {
  searchUrl: string;
  characterUrl: string;
};

function buildExpectedIdentity(event: PartyJoinEvent): { name: string; world: string } | undefined {
  if (!event.familyName || !event.givenName || !event.worldName) return undefined;
  return { name: `${event.familyName} ${event.givenName}`.trim(), world: event.worldName.trim() };
}

function isSameIdentity(
  actual: { name: string; world: string },
  expected: { name: string; world: string }
): boolean {
  return actual.name.trim() === expected.name && actual.world.trim().toLowerCase() === expected.world.toLowerCase();
}

/**
 * Lodestone 検索結果の先頭キャラURLが「参加者本人」かどうかをキャラページHTMLから確認します。
 *
 * 同姓同名が存在するため、ワールドまで一致した場合のみ採用します。
 * 一致しない（または確認できない）場合は `undefined` を返します。
 */
async function fetchVerifiedTopCharacter(params: {
  expectedName: string;
  expectedWorld: string;
}): Promise<VerifiedCharacter | undefined> {
  const searchUrl = buildLodestoneSearchUrl({ name: params.expectedName, world: params.expectedWorld });

  const characterUrl = await fetchTopCharacterUrl(searchUrl);
  if (!characterUrl) return undefined;

  const identity = await fetchCharacterIdentity(characterUrl);
  if (!identity) return undefined;

  const matched = isSameIdentity(identity, { name: params.expectedName, world: params.expectedWorld });
  if (!matched) return undefined;

  return { searchUrl, characterUrl };
}

/**
 * Lodestone アチーブメント一覧から「絶/零式」の達成状況を抽出して、表示用の略称配列として返します。
 */
async function fetchHighEndClears(characterUrl: string): Promise<{
  status: "ok" | "private_or_unavailable";
  ultimate: string[];
  savage: string[];
}> {
  const achievementUrl = buildAchievementCategoryUrl(characterUrl);
  if (!achievementUrl) return { status: "private_or_unavailable", ultimate: [], savage: [] };

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

  return { status: parsed.status, ultimate, savage };
}

/**
 * パーティ参加イベントを Lodestone 情報（URL/絶/零式）で拡張します。
 *
 * - 同姓同名対策として「キャラページの名前/ワールド」が一致した場合のみ出力対象にします
 * - Lodestone 側の取得に失敗しても通知処理自体は継続します
 */
export async function enrichJoinPartyEventWithLodestone(event: PartyJoinEvent): Promise<JoinPartyEnriched> {
  const expected = buildExpectedIdentity(event);
  if (!expected) return { event };

  try {
    const verified = await fetchVerifiedTopCharacter({
      expectedName: expected.name,
      expectedWorld: expected.world
    });
    if (!verified) return { event };

    try {
      const clears = await fetchHighEndClears(verified.characterUrl);
      return {
        event,
        lodestoneSearchUrl: verified.searchUrl,
        lodestoneCharacterUrl: verified.characterUrl,
        highEndStatus: clears.status,
        ultimateClearsShort: clears.ultimate,
        savageClearsShort: clears.savage
      };
    } catch {
      return {
        event,
        lodestoneSearchUrl: verified.searchUrl,
        lodestoneCharacterUrl: verified.characterUrl,
        highEndStatus: "error"
      };
    }
  } catch {
    return { event };
  }
}

