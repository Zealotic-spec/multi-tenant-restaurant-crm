#!/bin/sh

# Start Express API on internal port 3001
INTERNAL_PORT=3001 node dist/server.cjs &

# Wait until Express is accepting connections using Node.js (nc may not be available)
echo "[start] Waiting for API on 127.0.0.1:3001..."
i=0
until node -e "
  var net = require('net');
  var c = net.createConnection({port:3001, host:'127.0.0.1'});
  c.on('connect', function(){ c.destroy(); process.exit(0); });
  c.on('error', function(){ process.exit(1); });
" 2>/dev/null; do
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
