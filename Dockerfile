FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
COPY server ./server
RUN npm test && npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force \
    && mkdir -p /app/data && chown node:node /app/data
COPY --from=build /app/dist ./dist
COPY --from=build /app/public/data/japan.geojson ./public/data/japan.geojson
COPY --from=build /app/server/app.mjs /app/server/db.mjs /app/server/index.mjs ./server/

USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node --input-type=module -e "const r = await fetch('http://127.0.0.1:' + process.env.PORT + '/api/health'); if (!r.ok) process.exit(1)"
CMD ["node", "server/index.mjs"]
