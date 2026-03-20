Push current branch to origin and create or update the PR.

## Steps

1. Identify current branch and remote state.
2. Run local validation before pushing.
3. Push: `git push -u origin HEAD`
4. If rejected:
   - Non-fast-forward: run `/pull` first, then retry.
   - Only use `--force-with-lease` if history was rewritten.
   - Auth/permission errors: stop and surface the error.
5. Ensure PR exists:
   - No PR: `gh pr create --title "<title>"`
   - Open PR: update title/body if scope changed.
   - Closed/merged PR: create a new branch + PR.
6. Write PR body using `.github/pull_request_template.md` if present.
7. Reply with the PR URL.
