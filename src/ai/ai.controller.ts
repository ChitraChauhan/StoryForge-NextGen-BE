import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('enhance-prompt')
  async enhancePrompt(@Body() body: { prompt: string }) {
    const enhanced = await this.aiService.enhancePrompt(body.prompt);
    return { enhanced };
  }

  @Post('generate-ideas')
  async generateIdeas(@Body() body: { genre?: string; theme?: string }) {
    const ideas = await this.aiService.generateIdeas(body.genre, body.theme);
    return { ideas };
  }

  @Post('improve-chapter')
  async improveChapter(
    @Body() body: { content: string; instructions?: string },
  ) {
    const improved = await this.aiService.improveChapter(
      body.content,
      body.instructions,
    );
    return { improved };
  }
}
