import { randomUUID } from 'node:crypto';
import { AppError } from '../common/errors.js';
import { isDate } from '../common/bangkok.js';
import type { AnswerValue, Answers, QuestionDefinition, QuestionInput, QuestionOption, QuestionType } from '../../../../packages/contracts/src/questions.js';

// Contracts stay type-only; runtime lists live with the code that enforces them.
const QUESTION_TYPES: readonly QuestionType[] = ['short_text', 'paragraph', 'single_choice', 'dropdown', 'checkboxes', 'date'];
const CHOICE: QuestionType[] = ['single_choice', 'dropdown', 'checkboxes'];
export const isChoice = (type: string): boolean => CHOICE.includes(type as QuestionType);
const invalid = (message: string, fields?: Record<string, string>) => new AppError(422, 'INVALID_INPUT', message, fields);

export function cleanOptions(type: QuestionType, options: QuestionInput['options']): QuestionOption[] {
  if (!isChoice(type)) {
    if (options?.length) throw invalid('คำถามประเภทนี้ไม่มีตัวเลือก');
    return [];
  }
  if (!Array.isArray(options) || options.length < 1 || options.length > 30) throw invalid('กรุณาเพิ่มตัวเลือก 1–30 รายการ');
  const labels = new Set<string>();
  return options.map((option) => {
    const label = typeof option?.label === 'string' ? option.label.trim() : '';
    if (!label || label.length > 150) throw invalid('ตัวเลือกต้องไม่ว่างและยาวไม่เกิน 150 ตัวอักษร');
    if (labels.has(label)) throw invalid('ตัวเลือกซ้ำกัน');
    labels.add(label);
    return { id: typeof option.id === 'string' && option.id ? option.id : randomUUID(), label };
  });
}

/** Validates the shape of one question definition; ids and options are assigned here. */
export function cleanQuestion(input: QuestionInput): Omit<QuestionDefinition, 'id' | 'position'> & { id: string | null; libraryQuestionId: string | null } {
  const label = typeof input?.label === 'string' ? input.label.trim() : '';
  if (!label || label.length > 300) throw invalid('กรุณาระบุคำถามไม่เกิน 300 ตัวอักษร');
  if (!QUESTION_TYPES.includes(input.type)) throw invalid('ประเภทคำถามไม่ถูกต้อง');
  if (typeof input.required !== 'boolean' || typeof input.sensitive !== 'boolean') throw invalid('กรุณาระบุว่าบังคับตอบและเป็นข้อมูลอ่อนไหวหรือไม่');
  return { id: input.id ?? null, libraryQuestionId: input.libraryQuestionId ?? null, label, type: input.type, options: cleanOptions(input.type, input.options), required: input.required, sensitive: input.sensitive };
}

/** Checks answers against the run's questions and returns only known, normalized values. */
export function validateAnswers(questions: Pick<QuestionDefinition, 'id' | 'label' | 'type' | 'options' | 'required'>[], answers: unknown): Answers {
  if (answers === undefined || answers === null) answers = {};
  if (typeof answers !== 'object' || Array.isArray(answers)) throw invalid('รูปแบบคำตอบไม่ถูกต้อง');
  const raw = answers as Record<string, unknown>;
  const known = new Set(questions.map((q) => q.id));
  if (Object.keys(raw).some((key) => !known.has(key))) throw invalid('มีคำตอบของคำถามที่ไม่มีอยู่');
  const errors: Record<string, string> = {};
  const clean: Answers = {};
  for (const question of questions) {
    const value = raw[question.id];
    const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty) {
      if (question.required) errors[question.id] = 'กรุณาตอบคำถามนี้';
      continue;
    }
    const ids = new Set(question.options.map((o) => o.id));
    let ok: AnswerValue | null = null;
    if (question.type === 'short_text' || question.type === 'paragraph') {
      if (typeof value === 'string' && value.trim().length <= (question.type === 'short_text' ? 300 : 3000)) ok = value.trim();
    } else if (question.type === 'date') {
      if (isDate(value)) ok = value;
    } else if (question.type === 'checkboxes') {
      if (Array.isArray(value) && value.every((v) => typeof v === 'string' && ids.has(v)) && new Set(value).size === value.length) ok = value as string[];
    } else if (typeof value === 'string' && ids.has(value)) ok = value;
    if (ok === null || ok === '') errors[question.id] = 'คำตอบไม่ถูกต้อง';
    else clean[question.id] = ok;
  }
  if (Object.keys(errors).length) throw invalid('กรุณาตรวจสอบคำตอบในแบบฟอร์ม', errors);
  return clean;
}
