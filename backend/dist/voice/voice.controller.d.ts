import { VoiceService } from './voice.service';
export declare class VoiceController {
    private voiceService;
    constructor(voiceService: VoiceService);
    getToken(body: {
        roomName: string;
    }, req: any): Promise<{
        token: string;
        url: string | undefined;
    }>;
}
