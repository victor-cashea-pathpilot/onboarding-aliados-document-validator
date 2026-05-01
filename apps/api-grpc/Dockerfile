FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json nest-cli.json tsconfig.base.json biome.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-slim AS runtime

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

CMD ["node", "dist/apps/api-grpc/apps/api-grpc/src/main.js"]
