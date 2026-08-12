import { ArtifactStore, validateRequiredSections } from '../artifacts/artifact-store.js';
import type { ApprovalArtifact, DeliveryMetadata } from '../domain/types.js';
import type { GateFinding, GateResult } from './types.js';

type GateInput = { delivery: DeliveryMetadata; artifacts: ArtifactStore };

const designSections = [
  'System Boundary', 'Overall Architecture', 'Module Design', 'Data Model', 'API',
  'Core Flow', 'Permissions', 'Error Handling', 'Performance', 'Security',
  'Observability', 'Deployment', 'Compatibility / Migration', 'Test Strategy', 'Technical Risks',
] as const;

function finding(code: string, message: string, artifact: string, nextStep: string): GateFinding {
  return { code, message, artifact, nextStep };
}

async function hasCurrentApproval(input: GateInput, artifact: ApprovalArtifact): Promise<boolean> {
  const approval = input.delivery.approvals[artifact];
  if (!approval) return false;
  return input.artifacts.hasCurrentHash({ deliveryId: input.delivery.id, kind: artifact }, approval.hash);
}

function findingsFromSections(errors: string[], artifact: string, prefix: string): GateFinding[] {
  return errors.map((message) => finding(
    `${prefix}_${message.includes('placeholder') ? 'PLACEHOLDER' : 'SECTION_MISSING'}`,
    message,
    artifact,
    `Update ${artifact} to satisfy the required content contract.`,
  ));
}

export async function evaluateRequirementGate(input: GateInput): Promise<GateResult> {
  const findings: GateFinding[] = [];
  let markdown = '';
  try {
    markdown = await input.artifacts.read({ deliveryId: input.delivery.id, kind: 'requirement' });
  } catch {
    findings.push(finding('REQUIREMENT_ARTIFACT_MISSING', 'Requirement artifact is missing.', 'requirement.md', 'Create requirement.md with the required sections.'));
  }

  if (markdown) {
    for (const error of validateRequiredSections(markdown, ['Source', 'Scope', 'Baseline'])) {
      if (error === 'Missing required section: Baseline') {
        findings.push(finding('REQUIREMENT_BASELINE_MISSING', 'Requirement baseline is missing.', 'requirement.md', 'Add a final Baseline section.'));
      } else {
        findings.push(...findingsFromSections([error], 'requirement.md', 'REQUIREMENT'));
      }
    }
    if (/##\s+Questions[\s\S]*?Status:\s*unresolved/i.test(markdown)) {
      findings.push(finding('REQUIREMENT_BLOCKING_QUESTION', 'Requirement has unresolved blocking questions.', 'requirement.md', 'Resolve all blocking questions.'));
    }
  }

  if (!(await hasCurrentApproval(input, 'requirement'))) {
    findings.push(finding('REQUIREMENT_APPROVAL_MISSING', 'Requirement has no current human approval.', 'requirement.md', 'Request a human approval for the current artifact hash.'));
  }

  return findings.length === 0 ? { ok: true } : { ok: false, findings };
}

export async function evaluateDesignGate(input: GateInput): Promise<GateResult> {
  if (input.delivery.type === 'FEATURE_CHANGE' && input.delivery.design?.required === false) {
    return { ok: true, skipped: true };
  }

  const findings: GateFinding[] = [];
  if (input.delivery.type === 'FEATURE_CHANGE' && !input.delivery.design) {
    findings.push(finding('DESIGN_DECISION_MISSING', 'Feature change has no design decision.', 'delivery.yaml', 'Record whether design is required and why.'));
  }

  let markdown = '';
  try {
    markdown = await input.artifacts.read({ deliveryId: input.delivery.id, kind: 'design' });
  } catch {
    findings.push(finding('DESIGN_ARTIFACT_MISSING', 'Design artifact is missing.', 'design.md', 'Create design.md with all required sections.'));
  }

  if (markdown) {
    findings.push(...findingsFromSections(validateRequiredSections(markdown, designSections), 'design.md', 'DESIGN'));
  }
  if (!(await hasCurrentApproval(input, 'design'))) {
    findings.push(finding('DESIGN_APPROVAL_MISSING', 'Design has no current human approval.', 'design.md', 'Request a human approval for the current artifact hash.'));
  }

  return findings.length === 0 ? { ok: true } : { ok: false, findings };
}
