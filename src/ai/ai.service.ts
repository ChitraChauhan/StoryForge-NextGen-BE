import { Injectable, InternalServerErrorException } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class AiService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async enhancePrompt(prompt: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a creative writing assistant. Enhance the given story prompt to make it more vivid, compelling, and detailed. Keep the enhanced prompt concise (2-4 sentences) but rich in imagery and narrative potential.',
          },
          { role: 'user', content: `Enhance this story prompt: "${prompt}"` },
        ],
        max_tokens: 300,
        temperature: 0.8,
      });
      return response.choices[0]?.message?.content?.trim() || prompt;
    } catch (error) {
      throw new InternalServerErrorException('AI service error: ' + error.message);
    }
  }

  async generateIdeas(genre?: string, theme?: string): Promise<string[]> {
    try {
      const context = [genre && `Genre: ${genre}`, theme && `Theme: ${theme}`]
        .filter(Boolean)
        .join(', ');
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a creative writing assistant. Generate exactly 5 unique and engaging story ideas. Return them as a JSON array of strings. No extra text, just the JSON array.',
          },
          {
            role: 'user',
            content: `Generate 5 creative story ideas${context ? ` for: ${context}` : ''}.`,
          },
        ],
        max_tokens: 600,
        temperature: 0.9,
      });
      const raw = response.choices[0]?.message?.content?.trim() || '[]';
      try {
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : [raw];
      } catch {
        return [raw];
      }
    } catch (error) {
      throw new InternalServerErrorException('AI service error: ' + error.message);
    }
  }

  async improveChapter(content: string, instructions?: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert creative writing editor. Improve the given chapter content by enhancing the prose, pacing, and imagery while preserving the author\'s voice and story intent. Return only the improved text.',
          },
          {
            role: 'user',
            content: `${instructions ? `Instructions: ${instructions}\n\n` : ''}Improve this chapter:\n\n${content}`,
          },
        ],
        max_tokens: 1500,
        temperature: 0.7,
      });
      return response.choices[0]?.message?.content?.trim() || content;
    } catch (error) {
      throw new InternalServerErrorException('AI service error: ' + error.message);
    }
  }
}
