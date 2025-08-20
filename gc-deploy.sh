#!/usr/bin/env bash
# gc-deploy.sh — trigger Pages deploy via empty commit (or with changes if present)
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"
./gc-push.sh -m "deploy: manual trigger" --allow-empty "$@"
