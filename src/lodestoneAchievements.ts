import * as cheerio from "cheerio";
import { fetchText } from "./http.js";

const LODESTONE_BASE_URL = "https://jp.finalfantasyxiv.com";
const ULTIMATE_CATEGORY_ID = 4;
const LODESTONE_HEADERS: Record<string, string> = {
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "ja,en;q=0.8",
  "User-Agent": "ffxiv_join_party_member/1.0 (+https://jp.finalfantasyxiv.com)"
};

export const HIGH_END_ACHIEVEMENTS = [
  { name: "絶バハムートを狩りし者", short: "絶バハ", group: "ultimate" },
  { name: "絶アルテマウェポンを破壊せし者", short: "絶テマ", group: "ultimate" },
  { name: "絶アレキサンダーを破壊せし者", short: "絶アレキ", group: "ultimate" },
  { name: "絶竜詩戦争を平定せし者", short: "絶竜詩", group: "ultimate" },
  { name: "絶オメガ検証戦を完遂せし者", short: "絶オメガ", group: "ultimate" },
  { name: "絶もうひとつの未来を見届けし者", short: "絶エデン", group: "ultimate" },
  { name: "万魔殿の辺獄を完全制覇せし者：ランク1", short: "【パンデモ】辺獄", group: "savage" },
  { name: "万魔殿の煉獄を完全制覇せし者：ランク1", short: "【パンデモ】煉獄", group: "savage" },
  { name: "万魔殿の天獄を完全制覇せし者：ランク1", short: "【パンデモ】天獄", group: "savage" },
  { name: "アルカディアのライトヘビー級を完全制覇せし者：ランク1", short: "【アルカディア】ライトヘビー", group: "savage" },
  { name: "アルカディアのクルーザー級を完全制覇せし者：ランク1", short: "【アルカディア】クルーザー", group: "savage" },
  { name: "アルカディアのヘビー級を完全制覇せし者：ランク1", short: "【アルカディア】ヘビー", group: "savage" }
] as const;

export type HighEndAchievementName = (typeof HIGH_END_ACHIEVEMENTS)[number]["name"];
export type HighEndAchievementGroup = (typeof HIGH_END_ACHIEVEMENTS)[number]["group"];

/**
 * アチーブ正式名 → 表示用略称 のルックアップを返します。
 */
export function getHighEndAchievementShortMap(): Map<HighEndAchievementName, string> {
  return new Map(HIGH_END_ACHIEVEMENTS.map((a) => [a.name, a.short]));
}

/**
 * アチーブ正式名 → 種別（絶/零式） のルックアップを返します。
 */
export function getHighEndAchievementGroupMap(): Map<HighEndAchievementName, HighEndAchievementGroup> {
  return new Map(HIGH_END_ACHIEVEMENTS.map((a) => [a.name, a.group]));
}

/**
 * キャラクターURL（例: `https://.../lodestone/character/12345/`）から characterId を抽出します。
 */
export function parseCharacterIdFromUrl(characterUrl: string): string | undefined {
  const match = characterUrl.match(/\/lodestone\/character\/(\d+)\//);
  return match?.[1];
}

/**
 * Lodestone のアチーブメント一覧URL（カテゴリ指定）を生成します。
 */
export function buildAchievementCategoryUrl(characterUrl: string): string | undefined {
  const characterId = parseCharacterIdFromUrl(characterUrl);
  if (!characterId) return undefined;
  return new URL(
    `/lodestone/character/${characterId}/achievement/category/${ULTIMATE_CATEGORY_ID}/#anchor_achievement`,
    LODESTONE_BASE_URL
  ).toString();
}

export type HighEndAchievementParseResult = {
  status: "ok" | "private_or_unavailable";
  clears: HighEndAchievementName[];
};

/**
 * アチーブメント一覧HTMLから、指定した高難度（絶/零式）アチーブの達成状況を判定します。
 *
 * 判定方法:
 * - 対象の `<li class="entry">` 内に `time.entry__activity__time` が存在するか（=日付が入る）
 */
export function parseHighEndClearsFromAchievementHtml(html: string): HighEndAchievementParseResult {
  const $ = cheerio.load(html);

  const targetSet = new Set<string>(HIGH_END_ACHIEVEMENTS.map((a) => a.name));
  const clears = new Set<HighEndAchievementName>();
  let foundAny = false;

  $("li.entry").each((_, el) => {
    const entry = $(el);
    const name = entry.find("p.entry__activity__txt").first().text().trim();
    if (!targetSet.has(name)) return;

    foundAny = true;
    const hasDate = entry.find("time.entry__activity__time").length > 0;
    if (hasDate) clears.add(name as HighEndAchievementName);
  });

  return {
    status: foundAny ? "ok" : "private_or_unavailable",
    clears: Array.from(clears)
  };
}

/**
 * Lodestone のアチーブメント一覧ページHTMLを取得します。
 */
export async function fetchAchievementCategoryHtml(url: string): Promise<string> {
  return await fetchText(url, { timeoutMs: 30_000, headers: LODESTONE_HEADERS });
}
