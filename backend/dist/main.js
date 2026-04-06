"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, transform: true }));
    const allowedOrigins = [
        'http://localhost:3000',
        'https://konektado-beta.vercel.app',
        process.env.FRONTEND_URL,
    ].filter(Boolean);
    app.enableCors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            }
            else {
                callback(new Error(`CORS: origin ${origin} not allowed`));
            }
        },
        credentials: true,
    });
    app.setGlobalPrefix('api');
    await app.listen(process.env.PORT || 3001);
    console.log(`Backend running on http://localhost:${process.env.PORT || 3001}`);
}
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    console.error('UNHANDLED REJECTION:', reason);
    process.exit(1);
});
bootstrap().catch((err) => {
    console.error('BOOTSTRAP ERROR:', err);
    process.exit(1);
});
//# sourceMappingURL=main.js.map