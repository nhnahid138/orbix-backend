import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class TestService implements OnModuleInit {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS "test" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar(255),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }
}
