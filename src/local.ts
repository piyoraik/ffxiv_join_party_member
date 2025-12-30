import { handler } from "./lambda/handler.js";

/**
 * 開発用ローカルランナー。
 *
 * 標準入力（JSON）を Lambda Function URL の event っぽい形で handler に渡します。
 *
 * 例:
 * `echo '{"line":"00|...||Azu Scalaがパーティに参加しました。|..."}' | DISCORD_WEBHOOK_URL=... node dist/local.js`
 */
async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString("utf8").trim();
  if (!body) {
    console.error("No stdin body. Provide JSON payload via stdin.");
    process.exitCode = 2;
    return;
  }

  const result = await handler({
    headers: {},
    body
  });

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

