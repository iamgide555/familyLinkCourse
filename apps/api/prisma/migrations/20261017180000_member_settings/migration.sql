ALTER TABLE "members" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- Earlier members had no display number. Assign stable numbers per organization and
-- advance the sequence before the first new intake is saved.
WITH numbered AS (
  SELECT id, organization_id,
    ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at, id) AS n
  FROM members WHERE member_number IS NULL
), bounds AS (
  SELECT id, organization_id, n +
    COALESCE((SELECT MAX(CAST(SUBSTRING(member_number FROM 3) AS INTEGER))
      FROM members m WHERE m.organization_id = numbered.organization_id
      AND member_number ~ '^FL[0-9]+$'), 0) AS assigned
  FROM numbered
)
UPDATE members m SET member_number = 'FL' || LPAD(bounds.assigned::text, 6, '0')
FROM bounds WHERE m.id = bounds.id;

UPDATE organizations o SET member_sequence = GREATEST(member_sequence,
  COALESCE((SELECT MAX(CAST(SUBSTRING(member_number FROM 3) AS INTEGER))
    FROM members m WHERE m.organization_id = o.id AND member_number ~ '^FL[0-9]+$'), 0));

CREATE TABLE "service_types" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "service_types_organization_id_id_key" ON "service_types"("organization_id", "id");
CREATE UNIQUE INDEX "service_types_organization_id_name_key" ON "service_types"("organization_id", "name");
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "document_types" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sensitive" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "document_types_organization_id_id_key" ON "document_types"("organization_id", "id");
CREATE UNIQUE INDEX "document_types_organization_id_name_key" ON "document_types"("organization_id", "name");
ALTER TABLE "document_types" ADD CONSTRAINT "document_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "member_service_interests" (
  "organization_id" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  "service_type_id" TEXT NOT NULL,
  CONSTRAINT "member_service_interests_pkey" PRIMARY KEY ("organization_id", "member_id", "service_type_id")
);
ALTER TABLE "member_service_interests" ADD CONSTRAINT "member_service_interests_organization_id_member_id_fkey" FOREIGN KEY ("organization_id", "member_id") REFERENCES "members"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_service_interests" ADD CONSTRAINT "member_service_interests_organization_id_service_type_id_fkey" FOREIGN KEY ("organization_id", "service_type_id") REFERENCES "service_types"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "pdpa_requests" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organization_id" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "reason_encrypted" JSONB NOT NULL,
  "resolution_encrypted" JSONB,
  "handled_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  CONSTRAINT "pdpa_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pdpa_requests_organization_id_id_key" ON "pdpa_requests"("organization_id", "id");
CREATE INDEX "pdpa_requests_organization_id_member_id_created_at_idx" ON "pdpa_requests"("organization_id", "member_id", "created_at");
ALTER TABLE "pdpa_requests" ADD CONSTRAINT "pdpa_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pdpa_requests" ADD CONSTRAINT "pdpa_requests_organization_id_member_id_fkey" FOREIGN KEY ("organization_id", "member_id") REFERENCES "members"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pdpa_requests" ADD CONSTRAINT "pdpa_requests_organization_id_handled_by_id_fkey" FOREIGN KEY ("organization_id", "handled_by_id") REFERENCES "users"("organization_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
