export type VerifyMode = 'normal' | 'hook' | 'ci';

export type AuditFinding = {
  code: string;
  message: string;
  artifact: string;
  nextStep: string;
};

export type AuditResult =
  | { ok: true; findings: [] }
  | { ok: false; findings: AuditFinding[] };
