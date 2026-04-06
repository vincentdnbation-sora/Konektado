FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --no-frozen-lockfile

COPY . .

RUN pnpm run build

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
