# Claude Usage Checker

Claude Code の使用状況（トークン使用量・推定コスト）を確認できる静的 Web ページです。Claude Code がローカルに保存する使用ログ（`~/.claude/projects/**/*.jsonl`）をブラウザで読み込み、集計して可視化します。

## 主な機能

- **推定総コスト / 総トークン / 対象期間 / API リクエスト数** の統計タイル
- **日別の推定コスト・トークン数** の棒グラフ（表表示への切替つき）
- **モデル別内訳**（入力 / 出力 / キャッシュ書込 / キャッシュ読取 / コスト構成比）
- コスト推定に使用した **料金レート表**
- フォルダ選択・ファイル選択・ドラッグ&ドロップによるログの読み込み
- サンプルデータによる動作確認
- **完全クライアントサイド**: ログはブラウザ内でのみ解析され、外部には一切送信されません
- **ライト / ダークテーマ対応**: OS の設定に自動追従します

## 使い方

1. ページを開く（GitHub Pages、またはローカルで `src/index.html` を直接開く）
2. 「フォルダを選択」で `~/.claude/projects` を選ぶか、`.jsonl` ファイルをドラッグ&ドロップする
3. 集計結果が表示されます（「サンプルデータを表示」で動作確認も可能）

## コストの推定方法

表示されるコストは公開 API 料金（USD）に基づく**推定値**です。キャッシュ書込は入力単価の 1.25 倍（5 分 TTL）、キャッシュ読取は 0.1 倍で計算しています。Pro / Max などサブスクリプション利用時の実際の請求額とは異なります。

## 技術スタック

- Vanilla JavaScript（ランタイムの依存パッケージなし）
- 手書き SVG によるグラフ描画
- HTML / CSS
- ESLint（開発用）
- GitHub Pages（ホスティング）

## 開発

### 必要な環境

- Node.js 22（CI の `node-version` に合わせる）

### コマンド

```bash
npm ci              # 依存関係のインストール（開発用の ESLint のみ）
npm run lint        # ESLint
npm run type-check  # 型チェック（TypeScript 未導入のためメッセージを表示するだけ）
npm run build       # src/ を dist/ へコピー
```

PR ごとに `.github/workflows/ci.yml` が lint / 型チェック / ビルドを実行します。

## ディレクトリ構成

```text
src/
  index.html   ページ本体
  styles.css   スタイル（ライト/ダークテーマ）
  app.js       JSONL 解析・集計・描画ロジック
scripts/
  build.mjs    dist/ へのコピースクリプト
```

## デプロイ

- `main` への PR マージ時に `.github/workflows/deploy.yml` が `dist/` を GitHub Pages へデプロイします
- PR ごとに `.github/workflows/pr-preview.yml` がプレビューを gh-pages の `pr-<番号>/` に公開し、URL と QR コードを PR にコメントします（PR クローズ時に削除）

## 開発ルール

開発ルールは [AGENTS.md](./AGENTS.md) を参照してください。
貢献の手順は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。

## ライセンス

MIT
