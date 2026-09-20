# The deployed server (src/server/main.ts): the front end and the server are each
# built into one stage and run from the other. The server is a single file
# (dist-server/main.js), which is what makes a cold start quick; node_modules is
# still there for the one package that has to stay outside it (@google/design.md
# reads a file that sits beside its own code).

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run typecheck && npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist dist
COPY --from=build /app/dist-server dist-server
# Made photographs are kept here unless PHOTOS_DIR names somewhere that lasts.
RUN mkdir -p .cache/photos && chown -R node:node .cache
USER node
# The platform says which port, in PORT.
CMD ["node", "dist-server/main.js"]
