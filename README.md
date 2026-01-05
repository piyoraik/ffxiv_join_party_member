# ffxiv_join_party_member

FFXIV のログ（ACTなど）から「がパーティに参加しました」を検出し、Discord webhook へ送信します。

現在の想定構成は「Fluentd（Windowsでtail）→ Lambda（SAMでデプロイ）→ Discord」です。

キャラクター名は `苗字 名前ワールド名` の想定で、`名前` と `ワールド名` は `CocoTitan => Coco + Titan` のように「小文字→大文字」の境界で分割します（分割できない場合はそのまま送ります）。

Discord への通知は `ffxiv_ptfinder` と同様にコードブロック形式（```）で送信します。

## Env

- `DISCORD_WEBHOOK_URL` (required): Discord の webhook URL
- `ENABLE_LODESTONE` (optional): default `true`（Lodestone 取得を無効化する場合は `false`）
- `DEFAULT_WORLD_NAME` (optional): ログにワールド名が含まれない場合の補完（ログ提供者と同一ワールドのケース）
- `DEDUPE_TABLE_NAME` (optional): DynamoDB重複排除テーブル名（SAMで自動作成・デフォルト有効）
- `DEDUPE_TTL_SECONDS` (optional): 重複排除TTL（秒）。デフォルト `600`（10分）
- `ALLOWED_SOURCE_IPS` (optional): 許可する送信元IP（カンマ区切り）。指定時は一致しないリクエストを `403` で拒否

## Local run（開発用）

```sh
yarn install
yarn build
DISCORD_WEBHOOK_URL=... yarn start
```

## Fluentd -> Lambda (SAM)

このリポジトリには、Fluentd から「パーティ参加」ログのみを受けて Discord に通知する Lambda（Function URL）を同梱しています。

### Deploy

`template.yaml` を使ってデプロイします（例）。

```sh
sam build
sam deploy --guided \
  --parameter-overrides \
    DiscordWebhookUrl='https://discord.com/api/webhooks/...' \
    DefaultWorldName='Unicorn' \
    EnableLodestone='true'
```

デプロイ後に出力される `Outputs.ApiEndpoint` を Fluentd 側の送信先URLに設定してください。

### API Gateway（HTTP API）

このプロジェクトは API Gateway（HTTP API）経由で Lambda を呼び出します。
`template.yaml` でスロットリングを `1 rps / burst 2` に設定しています。

### 同時実行について

`template.yaml` では `ReservedConcurrentExecutions: 1` を設定しており、Lambdaの同時実行を1に制限しています。
これにより、同一タイミングで複数リクエストが来ても処理が直列化され、Lodestone/Discordの並列実行を抑えられます（超過分は 429 でスロットリングされ、送信側のリトライで後追い処理されます）。

### DynamoDB（重複排除）の確認

CloudWatch Logs に `dedupe.result` が出力されます。`accepted` / `duplicate` が期待通りになっているか確認してください。

### Fluentd config

`fluent.conf` は Lambda に送るものだけ `grep` で絞ります。

補足:
- Discord への通知内容はコードブロック（```）で送信します
