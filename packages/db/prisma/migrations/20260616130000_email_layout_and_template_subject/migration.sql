-- AlterTable
ALTER TABLE "notification_templates" ADD COLUMN     "subject" TEXT;

-- CreateTable
CREATE TABLE "email_layouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "draft" JSONB NOT NULL DEFAULT '{}',
    "published" JSONB,
    "published_at" TIMESTAMP(3),
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_layouts_tenant_id_key" ON "email_layouts"("tenant_id");

-- AddForeignKey
ALTER TABLE "email_layouts" ADD CONSTRAINT "email_layouts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
