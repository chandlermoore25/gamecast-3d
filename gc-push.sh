#!/usr/bin/env bash
    # gc-push.sh — push your local folder to GitHub (Git Bash/WSL/macOS/Linux)
    set -euo pipefail

    usage() {
      cat <<'USAGE'
Usage: ./gc-push.sh [-m "message"] [-r remote_url] [-b branch] [--allow-empty]
Defaults:
  -m auto: GameCast update <UTC timestamp>
  -r https://github.com/chandlermoore25/gamecast-3d.git
  -b main
Examples:
  ./gc-push.sh -m "auto: update"
  ./gc-push.sh -m "deploy: manual trigger" --allow-empty
  GC_REMOTE_URL=https://github.com/you/gamecast-3d.git ./gc-push.sh -m "update"
USAGE
    }

    # Defaults
    MSG="auto: GameCast update $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
    REMOTE="${GC_REMOTE_URL:-https://github.com/chandlermoore25/gamecast-3d.git}"
    BRANCH="${GC_BRANCH:-main}"
    ALLOW_EMPTY=0

    # Parse args
    while [[ $# -gt 0 ]]; do
      case "$1" in
        -m|--message) shift; MSG="${1:-$MSG}";;
        -r|--remote)  shift; REMOTE="${1:-$REMOTE}";;
        -b|--branch)  shift; BRANCH="${1:-$BRANCH}";;
        --allow-empty) ALLOW_EMPTY=1;;
        -h|--help) usage; exit 0;;
        *) echo "Unknown arg: $1"; usage; exit 1;;
      esac
      shift || true
    done

    log(){ echo "[gc-push] $*"; }

    # Resolve script dir (repo root expected)
    here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    cd "$here"
    log "start $(date -u +'%Y-%m-%dT%H:%M:%SZ') in $here"

    # Ensure git exists
    if ! command -v git >/dev/null 2>&1; then
      echo "[git not found] Install Git (Git Bash on Windows): https://git-scm.com/downloads" >&2
      exit 1
    fi
    log "$(git --version)"

    run_git(){ log "git $*"; git "$@"; }

    # Repo init if needed
    if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      log "not inside a git repository -> initializing"
      if git init -b "$BRANCH" >/dev/null 2>&1; then :; else
        run_git init
        run_git checkout -B "$BRANCH"
      fi
      run_git remote add origin "$REMOTE" || true
      log "initialized repo and set origin to $REMOTE"
    else
      log "already inside a git repo"
      if ! git remote | grep -qx origin; then
        run_git remote add origin "$REMOTE"
        log "added origin $REMOTE"
      else
        cur="$(git remote get-url origin 2>/dev/null || true)"
        if [[ "$cur" != "$REMOTE" && -n "$REMOTE" ]]; then
          run_git remote set-url origin "$REMOTE"
          log "updated origin to $REMOTE"
        else
          log "origin already set correctly"
        fi
      fi
    fi

    # Ensure target branch
    if ! git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
      run_git checkout -B "$BRANCH"
    else
      run_git checkout "$BRANCH"
    fi

    # Rebase onto remote if possible
    run_git fetch origin || true
    if ! git rev-parse --verify "origin/$BRANCH" >/dev/null 2>&1; then
      log "no remote branch origin/$BRANCH yet - continuing"
    else
      run_git pull --rebase origin "$BRANCH" || log "pull --rebase failed - continuing"
    fi

    # Stage & commit
    run_git add -A
    if git diff --cached --quiet; then
      if [[ $ALLOW_EMPTY -eq 1 ]]; then
        log "working tree clean, creating an empty commit to trigger deploy"
        run_git commit --allow-empty -m "$MSG"
      else
        log "nothing to commit - working tree clean"
        # still try pushing to sync tracking branch
        run_git push -u origin "$BRANCH" || { echo "[push failed] check remote permissions (HTTPS token/SSH)"; exit 1; }
        log "done."
        exit 0
      fi
    else
      run_git commit -m "$MSG"
    fi

    # Push
    run_git push -u origin "$BRANCH" || { echo "[push failed] check remote permissions (HTTPS token/SSH)"; exit 1; }
    log "done."
