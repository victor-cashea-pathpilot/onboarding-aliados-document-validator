FROM node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS build

WORKDIR /app

COPY package.json package-lock.json nest-cli.json tsconfig.base.json biome.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS runtime

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

RUN groupadd --system appgroup && useradd --system --gid appgroup appuser

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/packages ./packages

USER appuser

EXPOSE 8080

CMD ["node", "dist/apps/case-explorer/apps/case-explorer/src/main.js"]
