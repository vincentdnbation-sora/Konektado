FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --no-frozen-lockfile

COPY . .

RUN pnpm run build

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && echo 'Starting node...' && node dist/main 2>&1; echo 'Node exited with code:' $?"]
