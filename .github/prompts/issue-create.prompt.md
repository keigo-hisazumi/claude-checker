---
mode: agent
model: GPT-5 mini
tools: ['runCommands', 'todos']
description: GitHubにIssueを登録する
---

# 概要

GitHubにIssueを登録する

## コマンド例

```
/issue-create
```

## 実行手順

1. **Issueタイトルの作成**:
    - 作成するために必要な情報を会話履歴から収集します

2. **Issue本文の作成**:
    - 作成するために必要な情報を会話履歴から収集します

3. **Issueの提案**:
    - タイトルと本文をユーザーに確認します

4. **Issueの作成**:
    ```bash
    gh issue create --title "<ここにIssueタイトルを記載>" --body "$(cat <<'EOF'
    <ここにIssue本文を記載>
    EOF
    )"
    ```

5. **結果の報告**:
    - 作成されたIssueのURLを報告します

## 注意事項

- 日本語でユーザーとコミュニケーションを取ります
- すべての行動は@.github/copilot-instructions.mdのルールに従います
- gitコマンドとghコマンドがインストールされていることを確認してください
- gitコマンドとghコマンドを正確に使用してください
