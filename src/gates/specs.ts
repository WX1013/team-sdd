import { validateRequiredSections, type ArtifactStore } from '../artifacts/artifact-store.js';
import type { DeliveryMetadata, SpecId } from '../domain/types.js';
import type { GateFinding, GateResult } from './types.js';
import { coverageFindingIds, requirementIds } from './coverage.js';

type SpecGateInput = { delivery: DeliveryMetadata; artifacts: ArtifactStore };
type PackGateInput = SpecGateInput & { specId: SpecId };

const specSections = [
  'Goal', 'Requirement Sources', 'Scope', 'Out of Scope', 'Acceptance Criteria',
  'Dependencies', 'Constraints', 'Expected Impact',
] as const;

function finding(code: string, message: string, artifact: string, nextStep: string): GateFinding {
  return { code, message, artifact, nextStep };
}

function section(markdown: string, heading: string): string {
  const headings = [...markdown.matchAll(/^##\s+(.+)$/gm)];
  const index = headings.findIndex((match) => match[1]?.trim() === heading);
  if (index < 0) return '';
  const current = headings[index]!;
  const start = (current.index ?? 0) + current[0].length;
  const end = headings[index + 1]?.index ?? markdown.length;
  return markdown.slice(start, end);
}

function acceptanceCriteria(markdown: string): string[] {
  return [...new Set(section(markdown, 'Acceptance Criteria').match(/\bAC-\d+\b/g) ?? [])];
}

function dependencies(markdown: string): string[] {
  const value = section(markdown, 'Dependencies');
  if (/^\s*(none|n\/a|-)?\s*$/i.test(value)) return [];
  return [...new Set(value.match(/\bSP-[A-Za-z0-9][A-Za-z0-9_-]*\b/g) ?? [])];
}

function planTasks(markdown: string): Array<{ title: string; body: string }> {
  const matches = [...markdown.matchAll(/^###\s+Task\s+(.+)$/gm)];
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? markdown.length;
    return { title: match[1]?.trim() ?? '', body: markdown.slice(start, end) };
  });
}

export function findDependencyCycle(graph: ReadonlyMap<string, readonly string[]>): string[] | undefined {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const trail: string[] = [];

  const visit = (node: string): string[] | undefined => {
    if (visiting.has(node)) return [...trail.slice(trail.indexOf(node)), node];
    if (visited.has(node)) return undefined;
    visiting.add(node);
    trail.push(node);
    for (const dependency of graph.get(node) ?? []) {
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    trail.pop();
    visiting.delete(node);
    visited.add(node);
    return undefined;
  };

  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return undefined;
}

export async function evaluateSpecGate(input: SpecGateInput): Promise<GateResult> {
  const findings: GateFinding[] = [];
  let requirement = '';
  try {
    requirement = await input.artifacts.read({ deliveryId: input.delivery.id, kind: 'requirement' });
  } catch {
    // Requirement Gate reports its missing source artifact separately.
  }
  const sourceText: string[] = [];
  if (input.delivery.specs.length === 0) {
    findings.push(finding('SPEC_PACK_MISSING', 'At least one Spec Pack is required.', 'delivery.yaml', 'Create a Spec Pack with a spec.md artifact.'));
  }

  const ids = new Set<string>(input.delivery.specs.map(({ id }) => id));
  const graph = new Map<string, readonly string[]>();
  for (const spec of input.delivery.specs) {
    let markdown: string;
    try {
      markdown = await input.artifacts.read({ deliveryId: input.delivery.id, specId: spec.id, kind: 'spec' });
    } catch {
      findings.push(finding('SPEC_ARTIFACT_MISSING', `Spec artifact is missing for ${spec.id}.`, `${spec.id}/spec.md`, 'Create the required Spec Pack artifact.'));
      continue;
    }
    for (const issue of validateRequiredSections(markdown, specSections)) {
      findings.push(finding('SPEC_CONTENT_INVALID', `${spec.id}: ${issue}`, `${spec.id}/spec.md`, 'Complete the Spec Pack content contract.'));
    }
    sourceText.push(section(markdown, 'Requirement Sources'));
    const deps = dependencies(markdown);
    for (const dependency of deps) {
      if (!ids.has(dependency)) {
        findings.push(finding('SPEC_DEPENDENCY_INVALID', `${spec.id} depends on unknown Spec Pack ${dependency}.`, `${spec.id}/spec.md`, 'Reference an existing Spec Pack or remove the dependency.'));
      }
    }
    graph.set(spec.id, deps);
  }

  for (const id of coverageFindingIds(requirementIds(requirement), sourceText.join('\n'))) {
    findings.push(finding(
      'SPEC_REQUIREMENT_COVERAGE_MISSING',
      `Spec Pack set does not cover Requirement identifier ${id}.`,
      'specs/',
      `Reference ${id} from at least one Spec Pack Requirement Sources section.`,
    ));
  }

  const cycle = findDependencyCycle(graph);
  if (cycle) {
    findings.push(finding('SPEC_DEPENDENCY_CYCLE', `Spec dependencies contain a cycle: ${cycle.join(' -> ')}.`, 'specs/', 'Remove one dependency from the cycle.'));
  }

  const approval = input.delivery.approvals.spec;
  if (!approval || approval.hash !== await input.artifacts.hashSpecSet(input.delivery)) {
    findings.push(finding('SPEC_APPROVAL_MISSING', 'Spec Pack set has no current human approval.', 'specs/', 'Request a human approval for the current Spec Pack set.'));
  }

  return findings.length === 0 ? { ok: true } : { ok: false, findings };
}

export async function evaluatePlanGate(input: PackGateInput): Promise<GateResult> {
  const findings: GateFinding[] = [];
  const specSummary = input.delivery.specs.find((candidate) => candidate.id === input.specId);
  let spec = '';
  let plan = '';
  try {
    spec = await input.artifacts.read({ deliveryId: input.delivery.id, specId: input.specId, kind: 'spec' });
  } catch {
    findings.push(finding('SPEC_ARTIFACT_MISSING', 'Spec artifact is missing.', `${input.specId}/spec.md`, 'Create spec.md before planning.'));
  }
  try {
    plan = await input.artifacts.read({ deliveryId: input.delivery.id, specId: input.specId, kind: 'plan' });
  } catch {
    findings.push(finding('PLAN_ARTIFACT_MISSING', 'Plan artifact is missing.', `${input.specId}/plan.md`, 'Create plan.md with test, implementation, and verification tasks.'));
  }
  if (plan) {
    for (const issue of validateRequiredSections(plan, [])) {
      findings.push(finding('PLAN_CONTENT_INVALID', issue, `${input.specId}/plan.md`, 'Remove the placeholder from the plan.'));
    }
    for (const criterion of acceptanceCriteria(spec)) {
      if (!new RegExp(`(?:Covers\\s+)?${criterion}\\b`, 'i').test(plan)) {
        findings.push(finding('PLAN_AC_UNCOVERED', `Plan does not cover ${criterion}.`, `${input.specId}/plan.md`, `Add a task and verification for ${criterion}.`));
      }
    }
    const tasks = planTasks(plan);
    if (tasks.length === 0) {
      findings.push(finding('PLAN_TASK_MISSING', 'Plan requires at least one ### Task section.', `${input.specId}/plan.md`, 'Add a Task with Test, Implementation, and Verification subsections.'));
    }
    for (const task of tasks) {
      for (const [heading, code] of [
        ['Test', 'PLAN_TASK_TEST_MISSING'],
        ['Implementation', 'PLAN_TASK_IMPLEMENTATION_MISSING'],
        ['Verification', 'PLAN_TASK_VERIFICATION_MISSING'],
      ] as const) {
        if (!new RegExp(`^####\\s+${heading}\\s*$`, 'mi').test(task.body)) {
          findings.push(finding(code, `Plan task ${task.title} is missing its ${heading} subsection.`, `${input.specId}/plan.md`, `Add a ${heading} subsection to Task ${task.title}.`));
        }
      }
    }
  }
  if (specSummary) {
    for (const dependency of dependencies(spec)) {
      const dependencySpec = input.delivery.specs.find((candidate) => candidate.id === dependency);
      if (!dependencySpec || dependencySpec.state !== 'DONE') {
        findings.push(finding('PLAN_DEPENDENCY_NOT_DONE', `Plan dependency ${dependency} is not DONE.`, `${input.specId}/plan.md`, `Complete dependency ${dependency} before submitting this plan.`));
      }
    }
  }
  return findings.length === 0 ? { ok: true } : { ok: false, findings };
}

export async function evaluateCheckGate(input: PackGateInput): Promise<GateResult> {
  let check = '';
  try {
    check = await input.artifacts.read({ deliveryId: input.delivery.id, specId: input.specId, kind: 'check' });
  } catch {
    return { ok: false, findings: [finding('CHECK_ARTIFACT_MISSING', 'Check artifact is missing.', `${input.specId}/check.md`, 'Create check.md with fresh verification evidence.')] };
  }
  let spec = '';
  try {
    spec = await input.artifacts.read({ deliveryId: input.delivery.id, specId: input.specId, kind: 'spec' });
  } catch {
    return { ok: false, findings: [finding('SPEC_ARTIFACT_MISSING', 'Spec artifact is missing.', `${input.specId}/spec.md`, 'Create spec.md before submitting Check.')] };
  }
  const requiredEvidence = ['Tests PASS', 'Build PASS'];
  const findings = requiredEvidence
    .filter((evidence) => !check.includes(evidence))
    .map((evidence) => finding('CHECK_EVIDENCE_MISSING', `Check is missing evidence: ${evidence}.`, `${input.specId}/check.md`, `Record fresh ${evidence} evidence.`));
  for (const criterion of acceptanceCriteria(spec)) {
    if (!new RegExp(`\\b${criterion}\\s+PASS\\b`, 'i').test(section(check, 'Acceptance Criteria'))) {
      findings.push(finding('CHECK_AC_UNCOVERED', `Check does not record ${criterion} PASS.`, `${input.specId}/check.md`, `Record fresh PASS evidence for ${criterion}.`));
    }
  }
  const review = section(check, 'Code Review');
  if (!/\bCritical Issues:\s*0\b/i.test(review) || !/\bImportant Issues:\s*0\b/i.test(review)) {
    findings.push(finding('CHECK_REVIEW_NOT_CLEAN', 'Check Code Review must record Critical Issues: 0 and Important Issues: 0.', `${input.specId}/check.md`, 'Resolve review findings and record zero Critical and Important issues.'));
  }
  if (!section(check, 'Fresh Verification Evidence').trim()) {
    findings.push(finding('CHECK_FRESH_EVIDENCE_MISSING', 'Check requires fresh verification evidence.', `${input.specId}/check.md`, 'Record command, time, and result in Fresh Verification Evidence.'));
  }
  return findings.length === 0 ? { ok: true } : { ok: false, findings };
}
