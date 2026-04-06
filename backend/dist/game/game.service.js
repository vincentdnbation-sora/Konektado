"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const WOULD_YOU_RATHER = [
    { id: 1, optionA: 'Travel the world for a year', optionB: 'Stay home with unlimited money' },
    { id: 2, optionA: 'Always be late', optionB: 'Always be early' },
    { id: 3, optionA: 'Lose all your money', optionB: 'Lose all your memories' },
    { id: 4, optionA: 'Be able to fly', optionB: 'Be able to read minds' },
    { id: 5, optionA: 'Live in the city', optionB: 'Live in the countryside' },
    { id: 6, optionA: 'Only eat sweet food', optionB: 'Only eat savory food' },
    { id: 7, optionA: 'Know when you will die', optionB: 'Know how you will die' },
    { id: 8, optionA: 'Have more time', optionB: 'Have more money' },
];
let GameService = class GameService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async startGame(matchId) {
        const questions = this.shuffle(WOULD_YOU_RATHER).slice(0, 5);
        const game = await this.prisma.gameSession.create({
            data: { matchId, questions, answers: {}, scores: {} },
        });
        return game;
    }
    async submitAnswer(matchId, userId, questionId, answer) {
        const game = await this.prisma.gameSession.findUnique({ where: { matchId } });
        if (!game || game.completed)
            return null;
        const answers = game.answers;
        if (!answers[userId])
            answers[userId] = {};
        answers[userId][questionId] = answer;
        const questions = game.questions;
        const allAnswered = questions.every(q => Object.keys(answers).length === 2 &&
            Object.values(answers).every((ua) => ua[q.id] !== undefined));
        const updated = await this.prisma.gameSession.update({
            where: { matchId },
            data: { answers, completed: allAnswered },
        });
        return { game: updated, allAnswered };
    }
    async getGame(matchId) {
        return this.prisma.gameSession.findUnique({ where: { matchId } });
    }
    shuffle(arr) {
        return [...arr].sort(() => Math.random() - 0.5);
    }
};
exports.GameService = GameService;
exports.GameService = GameService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], GameService);
//# sourceMappingURL=game.service.js.map