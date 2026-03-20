Land a PR: resolve conflicts, wait for checks, squash-merge.

## Steps

1. Locate the PR for the current branch.
2. Confirm checks are green locally.
3. If uncommitted changes: run `/commit` then `/push`.
4. Check mergeability against main.
5. If conflicts: run `/pull` to resolve, then `/push`.
6. Ensure review comments are acknowledged.
7. Watch checks: `gh pr checks --watch`
8. If checks fail: inspect logs, fix, commit, push, re-watch.
9. When green: `gh pr merge --squash`

Do not merge while review comments are outstanding.
Do not enable auto-merge.
