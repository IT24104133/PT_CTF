#!/usr/bin/env bash
# Start command for Render (or any platform that re-runs your start command on every deploy and
# every restart, rather than running a one-off build step). Render's filesystem is ephemeral
# UNLESS a persistent disk is attached and mounted over `data/` -- if you skip that, this reseeds
# from scratch on every redeploy, which wipes all player progress. With a persistent disk attached,
# this only seeds once, on the very first boot, and every later restart just starts the server
# against the data that's already there.
set -e
cd "$(dirname "$0")/.."

if [ ! -f data/db/peoplehub.sqlite ]; then
  echo "No existing database found -- seeding fresh (first boot, or no persistent disk attached)..."
  node src/seed/outer-seed.js
  node src/seed/seed.js
else
  echo "Existing database found in data/ -- skipping seed, starting with current data."
fi

exec node src/server.js
