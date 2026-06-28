#!/bin/sh

# Start Express API on internal port 3001
INTERNAL_PORT=3001 node dist/server.cjs &

# Wait until Express is accepting connections (max 60s)
echo "[start] Waiting for API on 127.0.0.1:3001..."
i=0
until nc -z 127.0.0.1 3001 2>/dev/null; do
  i=$((i+1))
  if [ $i -ge 60 ]; then
    echo "[start] API did not start in 60s, aborting"
    exit 1
  fi
  sleep 1
done
echo "[start] API ready after ${i}s"

# Start Next.js on Railway's public PORT
cd frontend && npm start
