import { MigrationInterface, QueryRunner } from 'typeorm';

export class FeaturedProducts1764500000000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query('ALTER TABLE products ADD COLUMN is_featured boolean NOT NULL DEFAULT false');
  }
  async down(runner: QueryRunner) {
    await runner.query('ALTER TABLE products DROP COLUMN is_featured');
  }
}
