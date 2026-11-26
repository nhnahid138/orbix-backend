import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminAuditLog, User } from '../database/entities.js';

@Injectable()
export class AdminAuditService {
  constructor(
    @InjectRepository(AdminAuditLog)
    private readonly logs: Repository<AdminAuditLog>,
  ) {}

  async record(input: {
    actorId: number;
    action: string;
    entityType: string;
    entityId?: string | number;
    ip?: string;
    requestId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.logs.save(
      this.logs.create({
        actor: { id: input.actorId } as User,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId == null ? null : String(input.entityId),
        ip: input.ip?.slice(0, 64) ?? null,
        requestId: input.requestId?.slice(0, 80) ?? null,
        metadata: input.metadata ?? {},
      }),
    );
  }
}
