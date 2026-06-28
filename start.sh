#!/bin/sh
set -e

# Express API — внутренний порт 3001
INTERNAL_PORT=3001 node dist/server.cjs &

# Next.js — публичный порт (Railway задаёт PORT)
cd frontend && npm start
