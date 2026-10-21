# App image, built by CI (.github/workflows/deploy.yml) and run on the server
# by deploy/compose.yaml. The same image runs the app and, in a one-off
# container, the database migrations.

# Node.js LTS, the same major version as in local development
FROM node:24-alpine AS base

# --- Build ------------------------------------------------------------------
FROM base AS build
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Exactly the pnpm version from "packageManager" in package.json
RUN npm install -g "$(node -p 'require("./package.json").packageManager')"
RUN pnpm install --frozen-lockfile

COPY . .
RUN NEXT_OUTPUT=standalone pnpm build
# The runtime image has no node_modules for scripts, so the migration script
# is bundled with its dependencies into one file
RUN pnpm exec esbuild src/db/migrate.ts --bundle --platform=node --format=cjs \
      --external:pg-native --outfile=dist/migrate.cjs

# --- Runtime ----------------------------------------------------------------
FROM base AS runtime
LABEL org.opencontainers.image.source="https://github.com/kropush/personal-crm"
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/dist/migrate.cjs ./migrate.cjs

USER node
EXPOSE 3000
CMD ["node", "server.js"]
