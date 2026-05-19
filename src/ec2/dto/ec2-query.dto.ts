import { IsOptional, IsString } from 'class-validator';

export class Ec2InstancesQueryDto {
  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  tagName?: string;

  @IsOptional()
  @IsString()
  instanceIds?: string;
}
