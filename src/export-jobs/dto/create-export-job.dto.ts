import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateExportJobDto {
  @IsOptional()
  @IsString()
  @IsIn(['pdf', 'docx', 'zip'])
  format?: 'pdf' | 'docx' | 'zip';
}
