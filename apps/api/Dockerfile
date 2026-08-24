FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install --include=dev

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate \
  && npx tsc -p tsconfig.build.json --noCheck \
  && test -f dist/main.js

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends \
      openssl ca-certificates \
      tesseract-ocr tesseract-ocr-por tesseract-ocr-eng \
      poppler-utils \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./
RUN mkdir -p /app/uploads
EXPOSE 3001
CMD ["node", "dist/main.js"]
