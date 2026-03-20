Pull latest origin/main into the current branch and resolve merge conflicts.

## Steps

1. Verify git status is clean or commit/stash first.
2. Enable rerere: `git config rerere.enabled true && git config rerere.autoupdate true`
3. Fetch: `git fetch origin`
4. Sync remote feature branch: `git pull --ff-only origin $(git branch --show-current)`
5. Merge: `git -c merge.conflictstyle=zdiff3 merge origin/main`
6. If conflicts:
   - Inspect with `git status` and `git diff`
   - Summarize intent of both sides before editing
   - Prefer minimal, intention-preserving edits
   - Resolve one file at a time
   - Ensure no conflict markers remain: `git diff --check`
7. Summarize the merge: conflicts resolved, assumptions made, follow-ups needed.

Only ask the user when resolution depends on product intent not inferable from code.
