import { IsString, IsOptional, IsIn } from 'class-validator';

export class UpdateStoryDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @IsIn(['draft', 'published', 'archived', 'primary'])
  status?: string;
}

export class CreateChapterDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  content?: string;
}

export class UpdateChapterDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  content?: string;
}

export class ShareStoryDto {
  @IsString()
  userId: string;
}
