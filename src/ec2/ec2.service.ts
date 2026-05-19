import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ec2InstancesQueryDto } from './dto/ec2-query.dto';

export interface Ec2InstanceSummary {
  instanceId: string;
  name?: string;
  state?: string;
  instanceType?: string;
  publicIpAddress?: string;
  privateIpAddress?: string;
  availabilityZone?: string;
  launchTime?: Date;
  tags: Record<string, string>;
}

@Injectable()
export class Ec2Service {
  private readonly logger = new Logger(Ec2Service.name);

  constructor(private readonly configService: ConfigService) {}

  async findInstances(query: Ec2InstancesQueryDto): Promise<Ec2InstanceSummary[]> {
    const aws = await this.loadAwsEc2Client();
    const client = this.createClient(aws);
    const instanceIds = this.parseInstanceIds(query.instanceIds);

    this.ensureInstancesAllowed(instanceIds);

    const filters = [];
    if (query.state) {
      filters.push({ Name: 'instance-state-name', Values: [query.state] });
    }
    if (query.tagName) {
      filters.push({ Name: 'tag:Name', Values: [query.tagName] });
    }

    try {
      const result = await client.send(
        new aws.DescribeInstancesCommand({
          InstanceIds: instanceIds.length > 0 ? instanceIds : undefined,
          Filters: filters.length > 0 ? filters : undefined,
        }),
      );

      return (result.Reservations || []).flatMap((reservation) =>
        (reservation.Instances || []).map((instance) => this.mapInstance(instance)),
      );
    } catch (error) {
      this.logger.error('EC2 describe instances failed', error?.stack || error);
      throw new ServiceUnavailableException('EC2 describe instances failed');
    }
  }

  async findInstance(instanceId: string): Promise<Ec2InstanceSummary> {
    const [instance] = await this.findInstances({ instanceIds: instanceId });
    if (!instance) {
      throw new BadRequestException(`EC2 instance ${instanceId} was not found`);
    }
    return instance;
  }

  async getInstanceStatus(instanceId: string) {
    const aws = await this.loadAwsEc2Client();
    const client = this.createClient(aws);
    this.ensureInstancesAllowed([instanceId]);

    try {
      const result = await client.send(
        new aws.DescribeInstanceStatusCommand({
          InstanceIds: [instanceId],
          IncludeAllInstances: true,
        }),
      );
      return result.InstanceStatuses?.[0] || null;
    } catch (error) {
      this.logger.error(`EC2 status lookup failed for ${instanceId}`, error?.stack || error);
      throw new ServiceUnavailableException('EC2 status lookup failed');
    }
  }

  startInstance(instanceId: string) {
    return this.changeInstanceState('start', instanceId);
  }

  stopInstance(instanceId: string) {
    return this.changeInstanceState('stop', instanceId);
  }

  rebootInstance(instanceId: string) {
    return this.changeInstanceState('reboot', instanceId);
  }

  private async changeInstanceState(action: 'start' | 'stop' | 'reboot', instanceId: string) {
    this.ensureManagementEnabled(action);
    this.ensureInstancesAllowed([instanceId]);

    const aws = await this.loadAwsEc2Client();
    const client = this.createClient(aws);
    const commandByAction = {
      start: aws.StartInstancesCommand,
      stop: aws.StopInstancesCommand,
      reboot: aws.RebootInstancesCommand,
    };

    try {
      const result = await client.send(
        new commandByAction[action]({ InstanceIds: [instanceId] }),
      );
      this.logger.log(`EC2 ${action} requested for ${instanceId}`);
      return {
        action,
        instanceId,
        requested: true,
        result,
      };
    } catch (error) {
      this.logger.error(`EC2 ${action} failed for ${instanceId}`, error?.stack || error);
      throw new ServiceUnavailableException(`EC2 ${action} failed`);
    }
  }

  private createClient(aws: any) {
    const region = this.configService.get<string>('AWS_EC2_REGION')
      || this.configService.get<string>('AWS_REGION')
      || 'us-east-1';
    return new aws.EC2Client({ region });
  }

  private ensureManagementEnabled(action: string): void {
    if (this.configService.get<string>('EC2_MANAGEMENT_ENABLED') === 'true') return;
    throw new ForbiddenException(
      `EC2 ${action} is disabled. Set EC2_MANAGEMENT_ENABLED=true to allow instance actions.`,
    );
  }

  private ensureInstancesAllowed(instanceIds: string[]): void {
    const allowed = this.getAllowedInstanceIds();
    if (allowed.length === 0 || instanceIds.length === 0) return;

    const blocked = instanceIds.filter((id) => !allowed.includes(id));
    if (blocked.length > 0) {
      throw new ForbiddenException(`EC2 instance is not allowed: ${blocked.join(', ')}`);
    }
  }

  private getAllowedInstanceIds(): string[] {
    return this.parseInstanceIds(
      this.configService.get<string>('AWS_EC2_ALLOWED_INSTANCE_IDS') || '',
    );
  }

  private parseInstanceIds(value?: string): string[] {
    return (value || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  private mapInstance(instance: any): Ec2InstanceSummary {
    const tags = Object.fromEntries(
      (instance.Tags || [])
        .filter((tag) => tag.Key && tag.Value)
        .map((tag) => [tag.Key, tag.Value]),
    );

    return {
      instanceId: instance.InstanceId,
      name: tags.Name,
      state: instance.State?.Name,
      instanceType: instance.InstanceType,
      publicIpAddress: instance.PublicIpAddress,
      privateIpAddress: instance.PrivateIpAddress,
      availabilityZone: instance.Placement?.AvailabilityZone,
      launchTime: instance.LaunchTime,
      tags,
    };
  }

  private async loadAwsEc2Client(): Promise<any> {
    try {
      const importer = new Function('specifier', 'return import(specifier)');
      return importer('@aws-sdk/client-ec2');
    } catch {
      throw new ServiceUnavailableException('@aws-sdk/client-ec2 is not installed');
    }
  }
}
