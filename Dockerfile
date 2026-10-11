# Solstice CTF — dependency-free Node app (vanilla http + node:sqlite). No npm install needed.
FROM node:22-slim

WORKDIR /app
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Deterministic seed (same RNG seed in, same data out) baked in at build time. `data/` is also
# declared a volume below so a container restart (or a live /ctf-admin.html reset) can rewrite it
# without needing a rebuild.
RUN node src/seed/outer-seed.js && node src/seed/seed.js

VOLUME ["/app/data"]

CMD ["node", "src/server.js"]
