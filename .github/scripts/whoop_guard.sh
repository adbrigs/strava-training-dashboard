#!/usr/bin/env bash
# Guards for the WHOOP refresh workflow (.github/workflows/schedule.yml).
#
# WHOOP refresh tokens are single-use. WHOOP sends sleep.updated and
# recovery.updated in the same second, so two runs fire together, and a run
# queued behind another one starts with the already-used token.
#
#   whoop_guard.sh skip-check   Prints skip=true if a refresh that STARTED AFTER
#                               this run was triggered already succeeded. That
#                               refresh already fetched everything this run was
#                               triggered for, so nothing is lost by skipping.
#
#   whoop_guard.sh token-check  Called when the fetch got HTTP 400 on the token.
#                               If another refresh succeeded after this run was
#                               triggered, it rotated the token: re-trigger a
#                               fresh run (which gets the new token) and exit 0.
#                               Otherwise the token really is bad: exit 1.
#
# Needs GH_TOKEN (actions read; token-check also needs repo scope to dispatch),
# GITHUB_REPOSITORY and GITHUB_RUN_ID.
set -euo pipefail

repo="$GITHUB_REPOSITORY"
created=$(gh api "repos/$repo/actions/runs/$GITHUB_RUN_ID" --jq .created_at)
echo "This run was triggered at $created."

# Print "<started_at> <completed_at>" of the refresh job for each of the last
# few runs whose refresh job actually ran and succeeded (not skipped).
recent_successes() {
  for id in $(gh run list --repo "$repo" --workflow schedule.yml --status success \
                --limit 5 --json databaseId --jq '.[].databaseId'); do
    [ "$id" = "$GITHUB_RUN_ID" ] && continue
    gh api "repos/$repo/actions/runs/$id/jobs" \
      --jq '.jobs[] | select(.name == "run-refresh" and .conclusion == "success")
            | "\(.started_at) \(.completed_at)"'
  done
}

case "${1:-}" in
  skip-check)
    while read -r started _; do
      if [[ "$started" > "$created" ]]; then
        echo "::notice::Skipping duplicate run: a refresh started at $started (after this run was triggered) already succeeded."
        echo "skip=true" >> "$GITHUB_OUTPUT"
        exit 0
      fi
    done < <(recent_successes)
    echo "skip=false" >> "$GITHUB_OUTPUT"
    ;;

  token-check)
    while read -r _ completed; do
      if [[ "$completed" > "$created" ]]; then
        echo "::notice::Token was rotated by a refresh that finished at $completed. Re-triggering a fresh run so no data is missed."
        gh api "repos/$repo/dispatches" -f event_type=whoop-data >/dev/null
        exit 0
      fi
    done < <(recent_successes)
    echo "::error::WHOOP refresh token is invalid or expired (HTTP 400), and no other run explains it."
    echo "Open the dashboard → Settings → 'Generate cron token' → update WHOOP_REFRESH_TOKEN in GitHub Secrets."
    exit 1
    ;;

  *)
    echo "usage: $0 skip-check|token-check" >&2
    exit 2
    ;;
esac
