FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY apps/mcp/package.json apps/mcp/package.json
COPY apps/mcp/tsconfig.json apps/mcp/tsconfig.json

RUN npm ci

COPY apps/mcp apps/mcp

RUN npm run build --workspace @signal/mcp

ENV HOST=0.0.0.0
ENV PORT=8080

CMD ["npm", "run", "start:http", "--workspace", "@signal/mcp"]
