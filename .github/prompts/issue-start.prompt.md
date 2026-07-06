---
mode: agent
model: GPT-5 mini
tools: ['runCommands', 'todos']
description: GitHubのIssueを読み込んで修正を行う
---

# 概要

引数の番号に該当するGitHubのIssueから情報を取得し、修正を行う

## コマンド例

```
/issue-start 123
```

## 実行手順

1. **現在のブランチと未コミット変更を確認**:
    ```bash
    git branch --show-current
    git status --porcelain
    ```
    - mainブランチではない場合は警告を表示し、Mainブランチに切り替えるよう促します
    - 未コミットの変更がある場合はスタッシュを行ってください

2. **mainブランチを更新**:
    ```bash
    git pull origin main
    ```

3. **Issueの内容を読み込む**:
    ```bash
    gh issue view <Issue番号> --json title,body
    ```

4. **自分をIssueにアサインする**:
    ```bash
    gh issue edit <Issue番号> --add-assignee @me
    ```

5. **Issueの詳細を分析**:
    - タイトルと本文を確認
    - ラベル、マイルストーン、アサインを確認
    - 関連するPRやコメントを確認

6. **既存ブランチをチェック**:
    ```bash
    git branch --list <Issue番号>*
    ```
    - 既存ブランチがある場合は警告を表示し、作業を中止します

7. **新しいブランチを作成**:
    ```bash
    git checkout -b <type>/issue-<Issue番号>-<簡潔な説明>
    ```
    - 既存ブランチがないことを確認した上で、新しいブランチを作成します
    - Issueの内容に基づいてブランチ名を決定します

    タイプ例:
    - feature: 新機能
    - fix: バグ修正
    - docs: ドキュメント
    - style: フォーマット変更
    - refactor: リファクタリング
    - test: テスト追加・修正
    - chore: その他の変更

8. **作業計画の策定**:
   - 解析した修正点に基づいて、どのようにコードを修正するか計画を立てます
   - Todoリスト形式でユーザーに提示します

9. **修正の実行**:
   - 解析した修正点に基づいてコードの修正を行います

10. **修正内容の報告**:
   - どのような修正を行ったかをユーザーに報告します

11. **結果の報告**:
   - 修正が完了したことをユーザーに通知します

**注意事項**

- 日本語でユーザーとコミュニケーションを取ります
- すべての行動は@.github/copilot-instructions.mdのルールに従います
- gitコマンドとghコマンドがインストールされていることを確認してください
- gitコマンドとghコマンドを正確に使用してください
- Issue番号は必須パラメータです
- mainブランチ以外で作業している場合は、mainブランチに切り替えてから作業を開始してください
- 未コミットの変更がある場合は、スタッシュを行ってから作業を開始してください