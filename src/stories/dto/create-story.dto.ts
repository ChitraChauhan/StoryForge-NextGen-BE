import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateStoryDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @IsIn(['draft', 'published', 'archived', 'primary'])
  status?: string;
}
