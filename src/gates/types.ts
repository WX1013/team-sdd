export type GateFinding = {
  code: string;
  message: string;
  artifact: string;
  nextStep: string;
};

export type GateResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; findings: GateFinding[] };
