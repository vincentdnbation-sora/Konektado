FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY pnpm-lock.yaml ./

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
