# ffxiv_join_party_member

Kubernetes 上の Loki を `query_range` で検索し、「がパーティに参加しました」を検出して Discord webhook へ送信する CronJob です。

キャラクター名は `苗字 名前ワールド名` の想定で、`名前` と `ワールド名` は `CocoTitan => Coco + Titan` のように「小文字→大文字」の境界で分割します（分割できない場合はそのまま送ります）。

## Env

- `DISCORD_WEBHOOK_URL` (required): Discord の webhook URL（k8s Secret 推奨）
- `LOKI_BASE_URL` (optional): default `http://loki.monitoring.svc.cluster.local:3100`
- `LOOKBACK_SECONDS` (optional): default `70`
- `LOKI_QUERY` (optional): default は要件の固定クエリ
- `DISCORD_USERNAME` / `DISCORD_AVATAR_URL` (optional): webhook の表示調整

## Local run

```sh
yarn install
yarn build
DISCORD_WEBHOOK_URL=... yarn start
```

## Build image

```sh
docker build -t your-registry/ffxiv-party-join-notifier:latest .
```

## Deploy to k8s

1. `k8s/secret-discord-webhook.yaml` の `REPLACE_ME` を置換して apply
2. `k8s/cronjob.yaml` の `image: REPLACE_ME_IMAGE` を置換して apply

```sh
kubectl apply -f k8s/secret-discord-webhook.yaml
kubectl apply -f k8s/cronjob.yaml
```
