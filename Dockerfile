FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    PORT=5000

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .

USER node
EXPOSE 5000

CMD ["node", "server.js"]
