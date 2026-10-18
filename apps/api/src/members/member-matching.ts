import type { MemberName } from '../../../../packages/contracts/src/members.js';
export function normalizeName(name: MemberName): MemberName {
  return {
    firstName: name.firstName
      .trim()
      .replace(/^(นางสาว|เด็กหญิง|เด็กชาย|นาย|นาง)\s*/, '')
      .replace(/\s+/g, ' ')
      .trim(),
    lastName: name.lastName.trim().replace(/\s+/g, ' '),
  };
}
