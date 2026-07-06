# GitHub Copilot 作業指示書

このリポジトリにおける開発ルールの **正本は [`AGENTS.md`](../AGENTS.md)** です。Copilot で作業する場合も、原則として `AGENTS.md` のルールに従ってください。

ルール変更が必要な場合は本ファイルではなく `AGENTS.md` を更新してください。

## Copilot 利用時の要点

`AGENTS.md` から、特に Copilot の作業に関係する項目を抜粋します。詳細は必ず [`AGENTS.md`](../AGENTS.md) を参照してください。

### 言語設定

- すべてのコミュニケーション・コメント・ドキュメントは **日本語** で記述する
- 変数名・関数名は適切な英語を使用する（業界標準に従う）
- 技術用語・コマンド・URL・ライブラリ名などは英語のまま使用してよい

### コード例

```python
# 良い例：コメントは日本語
def calculate_total(items):
    """
    商品リストの合計金額を計算する

    Args:
        items: 商品のリスト

    Returns:
        合計金額
    """
    total = 0
    for item in items:
        total += item.price
    return total
```

### ブランチ運用ポリシー

`main` ブランチへの直接コミット・プッシュは **絶対に禁止** です。`feature/`, `fix/`, `docs/`, `refactor/`, `test/` のいずれかの命名規則に従って作業ブランチを作成してください。

詳細は `AGENTS.md` の「ブランチ運用ポリシー」セクションを参照してください。

---

**この指示書の目的**: Copilot をサブツールとして利用する際にも、`AGENTS.md` で定めたプロジェクト共通ルールに沿った作業を行えるようにする。
