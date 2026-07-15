# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS deps
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM deps AS build
WORKDIR /workspace
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app

RUN addgroup -g 10000 hermes \
  && adduser -D -H -u 10000 -G hermes hermes \
  && mkdir -p /app/data /tmp \
  && chown -R hermes:hermes /app /tmp

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000

COPY --from=build --chown=hermes:hermes /workspace/package.json /app/package.json
COPY --from=build --chown=hermes:hermes /workspace/node_modules /app/node_modules
COPY --from=build --chown=hermes:hermes /workspace/apps/api/dist /app/apps/api/dist
COPY --from=build --chown=hermes:hermes /workspace/apps/api/package.json /app/apps/api/package.json

USER hermes
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
