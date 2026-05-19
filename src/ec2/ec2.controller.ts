import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Ec2InstancesQueryDto } from './dto/ec2-query.dto';
import { Ec2Service } from './ec2.service';

@Controller('ec2')
@UseGuards(JwtAuthGuard)
export class Ec2Controller {
  constructor(private readonly ec2Service: Ec2Service) {}

  @Get('instances')
  findInstances(@Query() query: Ec2InstancesQueryDto) {
    return this.ec2Service.findInstances(query);
  }

  @Get('instances/:id')
  findInstance(@Param('id') id: string) {
    return this.ec2Service.findInstance(id);
  }

  @Get('instances/:id/status')
  getInstanceStatus(@Param('id') id: string) {
    return this.ec2Service.getInstanceStatus(id);
  }

  @Post('instances/:id/start')
  startInstance(@Param('id') id: string) {
    return this.ec2Service.startInstance(id);
  }

  @Post('instances/:id/stop')
  stopInstance(@Param('id') id: string) {
    return this.ec2Service.stopInstance(id);
  }

  @Post('instances/:id/reboot')
  rebootInstance(@Param('id') id: string) {
    return this.ec2Service.rebootInstance(id);
  }
}
