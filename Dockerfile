FROM node:24.20.0-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build
EXPOSE 3000
CMD ["sh", "-c", "node backend/dist/server.js migrate && exec node backend/dist/server.js"]
