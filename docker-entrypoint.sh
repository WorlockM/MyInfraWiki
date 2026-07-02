#!/bin/sh
set -e

# When started as root (the default), make sure /data is writable by the
# unprivileged node user — pre-existing volumes were created root-owned by
# older images — then drop privileges. When started with a custom user via
# `user:` in compose, run as-is.
if [ "$(id -u)" = "0" ]; then
  if [ "$(stat -c %u /data)" != "1000" ] || [ -n "$(find /data ! -user node -print -quit)" ]; then
    chown -R node:node /data
  fi
  exec su-exec node "$@"
fi

exec "$@"
