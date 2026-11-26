import { MigrationInterface, QueryRunner } from 'typeorm';

export class HomeBanners1764100000000 implements MigrationInterface {
  name = 'HomeBanners1764100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE home_banners (
        id SERIAL PRIMARY KEY,
        eyebrow varchar(100) NOT NULL,
        title varchar(180) NOT NULL,
        subtitle text,
        image_url varchar(2048) NOT NULL,
        cta_label varchar(80) NOT NULL DEFAULT 'Shop now',
        cta_href varchar(255) NOT NULL DEFAULT '/products',
        sort_order integer NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        starts_at timestamptz,
        ends_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_home_banners_schedule CHECK (
          starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at
        )
      );
      CREATE INDEX idx_home_banners_active_order
      ON home_banners(is_active, sort_order, id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE home_banners');
  }
}
