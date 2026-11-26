import { MigrationInterface, QueryRunner } from 'typeorm';

export class CategoryMainImage1764600000000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query('ALTER TABLE categories ADD COLUMN main_image_url text');
  }

  async down(runner: QueryRunner) {
    await runner.query('ALTER TABLE categories DROP COLUMN main_image_url');
  }
}
