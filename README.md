# ffxiv_join_party_member

FFXIV のログ（ACTなど）から「がパーティに参加しました」を検出し、Discord webhook へ送信します。

現在の想定構成は「Fluentd（Windowsでtail）→ Lambda（SAMでデプロイ）→ Discord」です。

キャラクター名は `苗字 名前ワールド名` の想定で、`名前` と `ワールド名` は `CocoTitan => Coco + Titan` のように「小文字→大文字」の境界で分割します（分割できない場合はそのまま送ります）。

Discord への通知は `ffxiv_ptfinder` と同様にコードブロック形式（```）で送信します。

## Env

- `DISCORD_WEBHOOK_URL` (required): Discord の webhook URL
- `ENABLE_LODESTONE` (optional): default `true`（Lodestone 取得を無効化する場合は `false`）
- `DEFAULT_WORLD_NAME` (optional): ログにワールド名が含まれない場合の補完（ログ提供者と同一ワールドのケース）

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

デプロイ後に出力される `FunctionUrl` を Fluentd 側の `{input_lambda_url}` に設定してください。

### Fluentd config

`fluent.conf` は Lambda に送るものだけ `grep` で絞ります。

補足:
- Discord への通知内容はコードブロック（```）で送信します
