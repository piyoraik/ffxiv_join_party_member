import * as cheerio from "cheerio";

const LODESTONE_BASE_URL = "https://jp.finalfantasyxiv.com";

export type LodestoneCreatorInfo = {
  name: string;
  world: string;
};

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

export function parseTopCharacterUrlFromSearchHtml(html: string): string | undefined {
  const $ = cheerio.load(html);
  const href = $("a.entry__link").first().attr("href");
  if (!href) return undefined;
  return new URL(href, LODESTONE_BASE_URL).toString();
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ja,en;q=0.8",
        "User-Agent": "ffxiv_join_party_member/1.0 (+https://jp.finalfantasyxiv.com)"
      },
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} ${response.statusText}${body ? `: ${body}` : ""}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchTopCharacterUrl(searchUrl: string): Promise<string | undefined> {
  const html = await fetchText(searchUrl, 30_000);
  return parseTopCharacterUrlFromSearchHtml(html);
}

