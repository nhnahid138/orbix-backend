import type { MigrationInterface, QueryRunner } from 'typeorm';

export class StoreBranding1764200000000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`CREATE TABLE store_branding (
      id integer PRIMARY KEY CHECK (id = 1),
      version integer NOT NULL DEFAULT 1,
      content jsonb NOT NULL
    )`);
    await runner.query('INSERT INTO store_branding (id, content) VALUES (1, $1::jsonb)', [JSON.stringify({
      brand: 'Orbix', logo: '', tagline: 'Your destination for smartphones, computing and everyday tech.',
      phoneLabel: 'Phone', phone: '', emailLabel: 'Email', email: 'hello@orbix.store',
      locationHeading: 'Locations', aboutHeading: 'Explore Orbix', policyHeading: 'Policies',
      locations: [{label: 'Dhaka, Bangladesh', detail: 'Saturday–Thursday · 10 AM–6 PM', href: '/contact'}],
      about: [{label:'All products',href:'/products'}, {label:'Order tracking',href:'/account/orders'}, {label:'Contact us',href:'/contact'}, {label:'FAQs',href:'/faq'}],
      policies: [{label:'Privacy policy',href:'/privacy'}, {label:'Delivery & returns',href:'/shipping'}, {label:'Terms of service',href:'/terms'}],
      apps: [], social: [], copyright: '© 2026 Orbix Gadgets. All rights reserved.', credit: '', creditUrl: '',
    })]);
  }

  async down(runner: QueryRunner) {
    await runner.query('DROP TABLE store_branding');
  }
}
