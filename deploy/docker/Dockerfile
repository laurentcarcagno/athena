# Images d'Athena : api, worker (même image, commande différente) et web.
# Construire depuis la racine du dépôt :  docker build -f deploy/docker/Dockerfile --target api -t athena-api .

# ---------- construction ----------
FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @athena/ui build && pnpm --filter @athena/api build && pnpm --filter @athena/web build
RUN pnpm --filter @athena/api deploy --prod /out/api

# ---------- api et worker ----------
# Image sans shell ni gestionnaire de paquets, utilisateur non privilégié.
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out/api /app
EXPOSE 3001
# Le worker utilise la même image : `command: ["dist/worker.js"]`. Les migrations : `["dist/migrate-cli.js"]`.
CMD ["dist/main.js"]

# ---------- web ----------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS web
# Modèle rendu au démarrage par l'image nginx (envsubst) : ATHENA_API_UPSTREAM et résolveurs du conteneur.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 ATHENA_API_UPSTREAM=http://athena-api:3001
COPY deploy/docker/nginx.conf /etc/nginx/templates/default.conf.template
COPY deploy/docker/headers.inc /etc/nginx/headers.inc
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
