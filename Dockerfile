FROM node:20-alpine AS build
WORKDIR /app
COPY package.json yarn.lock tsconfig.json ./
RUN corepack enable
RUN yarn install
COPY src ./src
RUN yarn build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY package.json ./
CMD ["node", "dist/index.js"]
