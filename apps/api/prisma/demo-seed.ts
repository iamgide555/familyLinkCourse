import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { loadConfig } from '../src/config/config.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { bangkokDate, instantOf } from '../src/common/bangkok.js';

/**
 * Idempotent reference data for local testing. Service names are placeholders: the real six services and
 * membership tiers must be supplied by FamilyLink before real use (see docs/decisions).
 */
export const SERVICE_TYPES = ['บริการตัวอย่าง ก', 'บริการตัวอย่าง ข', 'บริการตัวอย่าง ค', 'บริการตัวอย่าง ง', 'บริการตัวอย่าง จ', 'บริการตัวอย่าง ฉ'];
export const DOCUMENT_TYPES: Array<[string, boolean]> = [
  ['บัตรประชาชน', true], ['บัตรคนพิการ', true], ['ทะเบียนบ้าน', true], ['ใบรับรองแพทย์', true],
  ['ใบรับรองการอาศัยในนนทบุรี', true], ['เอกสารอื่น ๆ', true],
];
export async function seedReferenceData(db: PrismaService, organizationId: string): Promise<void> {
  await db.organization.upsert({ where: { id: organizationId }, create: { id: organizationId, name: 'FamilyLink' }, update: {} });
  for (const name of SERVICE_TYPES)
    await db.serviceType.upsert({ where: { organizationId_name: { organizationId, name } }, create: { organizationId, name }, update: {} });
  for (const [name, sensitive] of DOCUMENT_TYPES)
    await db.documentType.upsert({ where: { organizationId_name: { organizationId, name } }, create: { organizationId, name, sensitive }, update: {} });
}
const addDays = (date: string, n: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const label = (name: string) => `${name} (ตัวอย่างสำหรับทดสอบ)`;

/** Optional sample course, runs, tiers and members so the whole flow can be tried straight away. All names are synthetic. */
export async function seedSample(db: PrismaService, organizationId: string, today: string): Promise<string> {
  const courseName = label('คอร์สทักษะการดูแลตนเอง');
  if (await db.course.findFirst({ where: { organizationId, name: courseName } })) return 'Sample data already present.';
  for (const [name, fee, months] of [[label('สมาชิกสามัญ'), '500', 12], [label('สมาชิกตลอดชีพ'), '5000', null]] as const)
    await db.membershipTier.upsert({ where: { organizationId_name: { organizationId, name } }, create: { organizationId, name, fee, durationMonths: months }, update: {} });
  const course = await db.course.create({ data: { organizationId, name: courseName, description: 'คอร์สตัวอย่างสำหรับทดสอบระบบ 2 วัน' } });
  const questions = [
    { label: 'ชื่อเล่น', type: 'short_text', options: [], required: true, sensitive: false, position: 0 },
    { label: 'อาหารที่แพ้หรือโรคประจำตัว', type: 'paragraph', options: [], required: false, sensitive: true, position: 1 },
  ];
  for (const q of questions) await db.courseQuestion.create({ data: { organizationId, courseId: course.id, ...q } });
  const makeRun = async (batchName: string, dates: string[], opts: { capacity: number; requireApproval: boolean; perSession: boolean }) => {
    const run = await db.courseRun.create({ data: { organizationId, courseId: course.id, batchName, location: 'ห้องอบรมสมาคม', capacity: opts.perSession ? null : opts.capacity, requireApproval: opts.requireApproval, waitlistEnabled: true, perSessionRegistration: opts.perSession, cancelDeadlineDays: 7 } });
    for (const [i, date] of dates.entries())
      await db.courseSession.create({ data: { organizationId, runId: run.id, dayNo: i + 1, date, startTime: '09:00', endTime: '16:00', startsAt: instantOf(date, '09:00'), endsAt: instantOf(date, '16:00'), location: 'ห้องอบรมสมาคม', capacity: opts.perSession ? opts.capacity : null } });
    for (const [position, q] of questions.entries()) await db.runQuestion.create({ data: { organizationId, runId: run.id, ...q, position } });
  };
  await makeRun('รุ่นเปิดรับลงทะเบียน (ต้องอนุมัติ ที่นั่ง 3)', [addDays(today, 10), addDays(today, 11)], { capacity: 3, requireApproval: true, perSession: false });
  await makeRun('รุ่นเลือกลงทะเบียนรายวัน (ที่นั่งวันละ 2)', [addDays(today, 14), addDays(today, 15)], { capacity: 2, requireApproval: false, perSession: true });
  await makeRun('รุ่นที่เรียนวันนี้ (ลอง เช็คชื่อ / รับหน้างาน)', [today, addDays(today, 1)], { capacity: 2, requireApproval: false, perSession: false });
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  let sequence = org.memberSequence;
  for (const [first, last, birth, phone] of [['สมศรี', 'ตัวอย่างหนึ่ง', '1965-03-15', '0811111101'], ['สมชาย', 'ตัวอย่างสอง', '1990-07-20', '0811111102'], ['มาลี', 'ตัวอย่างสาม', '1978-11-02', '0811111103']] as const) {
    sequence += 1;
    await db.member.create({ data: { organizationId, firstName: first, lastName: last, normalizedFirstName: first, normalizedLastName: last, birthDate: birth, phoneMobile: phone, source: 'paper', memberNumber: `FL${String(sequence).padStart(6, '0')}` } });
  }
  await db.organization.update({ where: { id: organizationId }, data: { memberSequence: sequence } });
  return 'Sample data created: 2 membership tiers, 1 course with 3 runs, 3 paper members.';
}
async function main(): Promise<void> {
  if (existsSync('.env')) loadEnvFile('.env');
  const config = loadConfig(process.env);
  const db = new PrismaService(config);
  try {
    await seedReferenceData(db, config.organizationId);
    console.log('Reference data ready.');
    if (process.argv.includes('--sample')) console.log(await seedSample(db, config.organizationId, bangkokDate(new Date())));
  } finally {
    await db.$disconnect();
  }
}
if (process.argv[1]?.endsWith('demo-seed.ts')) main().catch((error) => { console.error(error); process.exit(1); });
