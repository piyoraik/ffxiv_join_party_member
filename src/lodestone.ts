import * as cheerio from "cheerio";
import { fetchText } from "./http.js";

const LODESTONE_BASE_URL = "https://jp.finalfantasyxiv.com";
const LODESTONE_HEADERS: Record<string, string> = {
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "ja,en;q=0.8",
  "User-Agent": "ffxiv_join_party_member/1.0 (+https://jp.finalfantasyxiv.com)"
};

export type LodestoneCreatorInfo = {
  name: string;
  world: string;
};

/**
 * Lodestone のキャラクター検索URLを生成します。
 *
 * 例:
 * `https://jp.finalfantasyxiv.com/lodestone/character/?q=Noah+Stella&worldname=Asura&...`
 */
export function buildLodestoneSearchUrl(info: LodestoneCreatorInfo): string {
  const url = new URL("/lodestone/character/", LODESTONE_BASE_URL);
  const params = url.searchParams;

  params.set("q", info.name);
  params.set("worldname", info.world);
  params.set("classjob", "");
  params.set("race_tribe", "");

  // Lodestone の検索フォームが投げるパラメータに寄せています。
  params.append("gcid", "1");
  params.append("gcid", "2");
  params.append("gcid", "3");
  params.append("gcid", "0");

  params.append("blog_lang", "ja");
  params.append("blog_lang", "en");
  params.append("blog_lang", "de");
  params.append("blog_lang", "fr");

  params.set("order", "");
  return url.toString();
}

/**
 * キャラクター検索結果HTMLから、先頭に表示されるキャラクターURLを取得します。
 */
export function parseTopCharacterUrlFromSearchHtml(html: string): string | undefined {
  const $ = cheerio.load(html);
  const href = $("a.entry__link").first().attr("href");
  if (!href) return undefined;
  return new URL(href, LODESTONE_BASE_URL).toString();
}

export type LodestoneCharacterIdentity = {
  name: string;
  world: string;
};

/**
 * キャラクターページHTMLから「キャラクター名/ワールド名」を抽出します。
 *
 * `character.html` の例では以下から取れます:
 * - 名前: `p.frame__chara__name` / `span[itemprop="name"]`
 * - ワールド: `p.frame__chara__world`（例: `Unicorn [Meteor]` → `Unicorn`）
 */
export function parseCharacterIdentityFromCharacterHtml(html: string): LodestoneCharacterIdentity | undefined {
  const $ = cheerio.load(html);

  const name =
    $("p.frame__chara__name").first().text().trim() ||
    $("span[itemprop='name']").first().text().trim();

  // Example: "Unicorn [Meteor]" => "Unicorn"
  const worldRaw = $("p.frame__chara__world").first().text().trim();
  const world = worldRaw ? worldRaw.split("[")[0]?.trim() ?? "" : "";

  if (name && world) return { name, world };

  // フォールバック: <title>Piyo Lambda | FINAL FANTASY XIV, The Lodestone</title>
  const title = $("title").first().text().trim();
  const titleName = title.split("|")[0]?.trim() ?? "";
  if (titleName && world) return { name: titleName, world };

  return undefined;
}

/**
 * Lodestone のキャラクター検索を行い、先頭にヒットしたキャラクターURLを返します。
 */
export async function fetchTopCharacterUrl(searchUrl: string): Promise<string | undefined> {
  const html = await fetchText(searchUrl, { timeoutMs: 30_000, headers: LODESTONE_HEADERS });
  return parseTopCharacterUrlFromSearchHtml(html);
}

/**
 * Lodestone のキャラクターページを取得し、identity（名前/ワールド）を返します。
 */
export async function fetchCharacterIdentity(characterUrl: string): Promise<LodestoneCharacterIdentity | undefined> {
  const html = await fetchText(characterUrl, { timeoutMs: 30_000, headers: LODESTONE_HEADERS });
  return parseCharacterIdentityFromCharacterHtml(html);
}
