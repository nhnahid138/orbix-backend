import { MigrationInterface, QueryRunner } from 'typeorm';

export class VariantCost1764300000000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query('ALTER TABLE product_variants ADD COLUMN cost_minor integer CHECK (cost_minor >= 0)');
  }

  async down(runner: QueryRunner) {
    await runner.query('ALTER TABLE product_variants DROP COLUMN cost_minor');
  }
}
