import type { Id } from './core.js';
export type QuestionType = 'short_text' | 'paragraph' | 'single_choice' | 'dropdown' | 'checkboxes' | 'date';
export type QuestionOption = { id: string; label: string };
export type QuestionDefinition = {
  id: Id;
  label: string;
  type: QuestionType;
  options: QuestionOption[];
  required: boolean;
  sensitive: boolean;
  position: number;
};
export type QuestionInput = {
  id?: Id | null;
  libraryQuestionId?: Id | null;
  label: string;
  type: QuestionType;
  options?: Array<{ id?: string; label: string }>;
  required: boolean;
  sensitive: boolean;
};
export type LibraryQuestion = Omit<QuestionDefinition, 'position' | 'required'> & { active: boolean };
export type AnswerValue = string | string[];
export type Answers = Record<Id, AnswerValue>;
