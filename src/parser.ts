export type PartyJoinEvent = {
  rawLine: string;
  characterRaw: string;
  familyName?: string;
  givenName?: string;
  worldName?: string;
};

const JOIN_MARKER = "がパーティに参加しました";

function extractInnerLine(logLine: string): string {
  const match = logLine.match(/line="([^"]+)"/);
  return match?.[1] ?? logLine;
}

function splitGivenWorld(givenWorld: string): { given: string; world?: string } {
  // Boundary: lower -> Upper (e.g. CocoTitan => Coco + Titan)
  for (let i = 1; i < givenWorld.length; i++) {
    const prev = givenWorld[i - 1] ?? "";
    const curr = givenWorld[i] ?? "";
    if (prev >= "a" && prev <= "z" && curr >= "A" && curr <= "Z") {
      return { given: givenWorld.slice(0, i), world: givenWorld.slice(i) };
    }
  }
  return { given: givenWorld };
}

export function parsePartyJoinEvent(logLine: string): PartyJoinEvent | null {
  const line = extractInnerLine(logLine);
  if (!line.includes(JOIN_MARKER)) return null;

  // Prefer extracting from the pipe-delimited payload if present.
  const payloadMatch = line.match(/\|\|(.+?)がパーティに参加しました/);
  const characterRaw = (payloadMatch?.[1] ?? "").trim();
  if (!characterRaw) return null;

  const tokens = characterRaw.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    return { rawLine: line, characterRaw };
  }

  const familyName = tokens[0];
  if (tokens.length >= 3) {
    const givenName = tokens[1];
    const worldName = tokens.slice(2).join("");
    return { rawLine: line, characterRaw, familyName, givenName, worldName };
  }

  const givenWorld = tokens[1] ?? "";
  const { given, world } = splitGivenWorld(givenWorld);
  return { rawLine: line, characterRaw, familyName, givenName: given, worldName: world };
}

