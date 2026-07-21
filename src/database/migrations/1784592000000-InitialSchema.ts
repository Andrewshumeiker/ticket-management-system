import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1784592000000 implements MigrationInterface {
  name = 'InitialSchema1784592000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(100) NOT NULL,
        "email" character varying(150) NOT NULL,
        "phone" character varying(20),
        "department" character varying(100),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" SERIAL NOT NULL,
        "name" character varying(100) NOT NULL,
        "slug" character varying(50) NOT NULL,
        "sla_hours" integer NOT NULL DEFAULT 24,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_categories_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_categories" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "tickets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying(20) NOT NULL,
        "title" character varying(200) NOT NULL,
        "description" text NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'OPEN',
        "priority" character varying(10) NOT NULL DEFAULT 'MEDIUM',
        "image_url" character varying(500),
        "idempotency_key" character varying(100),
        "resolved_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "category_id" integer NOT NULL,
        "created_by" uuid,
        "assigned_to" uuid,
        CONSTRAINT "UQ_tickets_code" UNIQUE ("code"),
        CONSTRAINT "UQ_tickets_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "PK_tickets" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tickets_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id"),
        CONSTRAINT "FK_tickets_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id"),
        CONSTRAINT "FK_tickets_assigned_to" FOREIGN KEY ("assigned_to") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_tickets_status" ON "tickets" ("status")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_tickets_priority" ON "tickets" ("priority")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_tickets_created_at" ON "tickets" ("created_at")',
    );
    await queryRunner.query(`
      CREATE TABLE "ticket_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "from_status" character varying(20),
        "to_status" character varying(20) NOT NULL,
        "note" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "ticket_id" uuid,
        "changed_by" uuid,
        CONSTRAINT "PK_ticket_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_history_ticket" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_history_changed_by" FOREIGN KEY ("changed_by") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_history_created_at" ON "ticket_history" ("created_at")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "ticket_history"');
    await queryRunner.query('DROP TABLE "tickets"');
    await queryRunner.query('DROP TABLE "categories"');
    await queryRunner.query('DROP TABLE "users"');
  }
}
