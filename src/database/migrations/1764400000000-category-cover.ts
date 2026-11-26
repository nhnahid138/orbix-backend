import { MigrationInterface, QueryRunner } from 'typeorm';

export class CategoryCover1764400000000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query('ALTER TABLE categories ADD COLUMN cover_image_url text');
  }

  async down(runner: QueryRunner) {
    await runner.query('ALTER TABLE categories DROP COLUMN cover_image_url');
  }
}
