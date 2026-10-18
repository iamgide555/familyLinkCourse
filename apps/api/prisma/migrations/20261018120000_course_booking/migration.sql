-- CreateTable
CREATE TABLE "question_library" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_service_tags" (
    "organization_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "service_type_id" TEXT NOT NULL,

    CONSTRAINT "course_service_tags_pkey" PRIMARY KEY ("organization_id","course_id","service_type_id")
);

-- CreateTable
CREATE TABLE "course_questions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "library_question_id" TEXT,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "course_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "batch_name" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "capacity" INTEGER,
    "require_approval" BOOLEAN NOT NULL DEFAULT false,
    "waitlist_enabled" BOOLEAN NOT NULL DEFAULT true,
    "per_session_registration" BOOLEAN NOT NULL DEFAULT false,
    "registration_opens_at" TIMESTAMP(3),
    "registration_closes_at" TIMESTAMP(3),
    "cancel_deadline_days" INTEGER NOT NULL DEFAULT 7,
    "status" TEXT NOT NULL DEFAULT 'active',
    "structure_locked" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(3),
    "queue_counter" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_sessions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "day_no" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "online_url" TEXT NOT NULL DEFAULT '',
    "capacity" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "cancel_reason_encrypted" JSONB,
    "cancelled_at" TIMESTAMP(3),
    "rescheduled_at" TIMESTAMP(3),
    "cancel_deadline_override" TIMESTAMP(3),
    "queue_counter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "course_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_questions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "course_question_id" TEXT,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "run_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "status" TEXT,
    "queue_seq" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'member',
    "registered_by" TEXT NOT NULL DEFAULT 'member',
    "snapshot_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registration_sessions" (
    "organization_id" TEXT NOT NULL,
    "registration_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "queue_seq" INTEGER,
    "snapshot_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_sessions_pkey" PRIMARY KEY ("registration_id","session_id")
);

-- CreateTable
CREATE TABLE "registration_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "registration_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registration_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "registration_id" TEXT NOT NULL,
    "session_id" TEXT,
    "kind" TEXT NOT NULL,
    "reason_encrypted" JSONB,
    "actor_kind" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "organization_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "marked_by" TEXT NOT NULL,
    "marked_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("session_id","member_id")
);

-- CreateTable
CREATE TABLE "operation_records" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "question_library_organization_id_id_key" ON "question_library"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "courses_organization_id_id_key" ON "courses"("organization_id", "id");

-- CreateIndex
CREATE INDEX "course_questions_organization_id_course_id_position_idx" ON "course_questions"("organization_id", "course_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "course_questions_organization_id_id_key" ON "course_questions"("organization_id", "id");

-- CreateIndex
CREATE INDEX "course_runs_organization_id_course_id_idx" ON "course_runs"("organization_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_runs_organization_id_id_key" ON "course_runs"("organization_id", "id");

-- CreateIndex
CREATE INDEX "course_sessions_organization_id_run_id_starts_at_idx" ON "course_sessions"("organization_id", "run_id", "starts_at");

-- CreateIndex
CREATE INDEX "course_sessions_organization_id_date_idx" ON "course_sessions"("organization_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "course_sessions_organization_id_id_key" ON "course_sessions"("organization_id", "id");

-- CreateIndex
CREATE INDEX "run_questions_organization_id_run_id_position_idx" ON "run_questions"("organization_id", "run_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "run_questions_organization_id_id_key" ON "run_questions"("organization_id", "id");

-- CreateIndex
CREATE INDEX "registrations_organization_id_run_id_status_idx" ON "registrations"("organization_id", "run_id", "status");

-- CreateIndex
CREATE INDEX "registrations_organization_id_member_id_idx" ON "registrations"("organization_id", "member_id");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_organization_id_id_key" ON "registrations"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_run_id_member_id_key" ON "registrations"("run_id", "member_id");

-- CreateIndex
CREATE INDEX "registration_sessions_organization_id_session_id_status_idx" ON "registration_sessions"("organization_id", "session_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "registration_snapshots_organization_id_id_key" ON "registration_snapshots"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "registration_snapshots_registration_id_version_key" ON "registration_snapshots"("registration_id", "version");

-- CreateIndex
CREATE INDEX "registration_events_organization_id_registration_id_created_idx" ON "registration_events"("organization_id", "registration_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "registration_events_organization_id_id_key" ON "registration_events"("organization_id", "id");

-- CreateIndex
CREATE INDEX "attendance_organization_id_member_id_idx" ON "attendance"("organization_id", "member_id");

-- CreateIndex
CREATE UNIQUE INDEX "operation_records_organization_id_key_key" ON "operation_records"("organization_id", "key");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_service_tags" ADD CONSTRAINT "course_service_tags_organization_id_course_id_fkey" FOREIGN KEY ("organization_id", "course_id") REFERENCES "courses"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_service_tags" ADD CONSTRAINT "course_service_tags_organization_id_service_type_id_fkey" FOREIGN KEY ("organization_id", "service_type_id") REFERENCES "service_types"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_questions" ADD CONSTRAINT "course_questions_organization_id_course_id_fkey" FOREIGN KEY ("organization_id", "course_id") REFERENCES "courses"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_runs" ADD CONSTRAINT "course_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_runs" ADD CONSTRAINT "course_runs_organization_id_course_id_fkey" FOREIGN KEY ("organization_id", "course_id") REFERENCES "courses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sessions" ADD CONSTRAINT "course_sessions_organization_id_run_id_fkey" FOREIGN KEY ("organization_id", "run_id") REFERENCES "course_runs"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_questions" ADD CONSTRAINT "run_questions_organization_id_run_id_fkey" FOREIGN KEY ("organization_id", "run_id") REFERENCES "course_runs"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_organization_id_run_id_fkey" FOREIGN KEY ("organization_id", "run_id") REFERENCES "course_runs"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_organization_id_member_id_fkey" FOREIGN KEY ("organization_id", "member_id") REFERENCES "members"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_sessions" ADD CONSTRAINT "registration_sessions_organization_id_registration_id_fkey" FOREIGN KEY ("organization_id", "registration_id") REFERENCES "registrations"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_sessions" ADD CONSTRAINT "registration_sessions_organization_id_session_id_fkey" FOREIGN KEY ("organization_id", "session_id") REFERENCES "course_sessions"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_snapshots" ADD CONSTRAINT "registration_snapshots_organization_id_registration_id_fkey" FOREIGN KEY ("organization_id", "registration_id") REFERENCES "registrations"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_events" ADD CONSTRAINT "registration_events_organization_id_registration_id_fkey" FOREIGN KEY ("organization_id", "registration_id") REFERENCES "registrations"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_organization_id_session_id_fkey" FOREIGN KEY ("organization_id", "session_id") REFERENCES "course_sessions"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

