import { IsString, MinLength } from 'class-validator';

export class FailExportJobDto {
  @IsString()
  @MinLength(1)
  errorMessage: string;
}
