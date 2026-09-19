# The deployed server (src/server/main.ts): the front end is built in one stage
# and served, beside the pipelines, from the other.

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY tsconfig.json ./
COPY src src
COPY --from=build /app/dist dist
# Made photographs are kept here unless PHOTOS_DIR names somewhere that lasts.
RUN mkdir -p .cache/photos && chown -R node:node .cache
USER node
# The platform says which port, in PORT.
CMD ["node_modules/.bin/tsx", "src/server/main.ts"]
