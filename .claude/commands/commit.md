Create a well-formed git commit from current changes.

## Steps

1. Read conversation history to identify scope, intent, and rationale.
2. Inspect the working tree: `git status`, `git diff`, `git diff --staged`.
3. Stage intended changes after confirming scope. Sanity-check for build artifacts or temp files.
4. Choose a conventional type and scope: `feat(scope)`, `fix(scope)`, `refactor(scope)`, etc.
5. Write a subject line in imperative mood, <= 72 characters.
6. Write a body with:
   - Summary of key changes (what)
   - Rationale and trade-offs (why)
   - Tests or validation run
7. Append: `Co-authored-by: Claude <noreply@anthropic.com>`
8. Wrap body at 72 characters.
9. Create the commit using a heredoc for the message.
10. Only commit when the message matches the staged changes.
