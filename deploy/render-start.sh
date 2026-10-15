#!/usr/bin/env bash
# Compatibility wrapper. The Node entrypoint also works on Windows.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node deploy/render-start.cjs "$@"
