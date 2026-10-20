# The shop pages. Built in one stage and copied into a bare runtime, so the image carries the
# server and the assets but none of the build tooling.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# npm install, not npm ci: the image's npm is older than the one that wrote the lockfile and
# refuses it outright. The versions in package.json are exact, so the install is still pinned.
RUN npm install --no-audit --no-fund
COPY . .
# The NEXT_PUBLIC_ values are read at build time and baked into the browser bundle, so
# .env.production has to be present here, not only at run time.
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# Cloud Run tells the container which port to listen on; Next reads PORT.
ENV PORT=8080
# standalone carries its own node_modules; static and public are not inside it.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 8080
CMD ["node", "server.js"]
