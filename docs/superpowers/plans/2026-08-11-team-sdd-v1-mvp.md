# Team SDD V1 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repository-local, agent-agnostic Team SDD npm package that governs Delivery and Spec Pack workflows through validated artifacts, human approvals, and append-only events.

**Architecture:** A single TypeScript ESM package is divided into dependency-light domain values, filesystem-backed storage and artifact adapters, deterministic Gate functions, a workflow service, and a thin Commander CLI. The workflow service is the only component that may transition state; it validates artifacts and evaluates Gates before persisting metadata and events.

**Tech Stack:** Node.js 20+, TypeScript (ESM), Vitest, Zod, YAML, Commander.

## Global Constraints

- Target Node.js 20+ and use ESM TypeScript throughout.
- Validate every YAML boundary with Zod; never silently repair malformed metadata.
- All new behavior follows red-green-refactor with Vitest.
- Workflow logic must be capability-driven and may not branch on an Agent name.
- `delivery.yaml` is the sole mutable machine record; `.sdd/events/<delivery>.jsonl` is append-only.
- Only `workflow` services may request a state transition, and only after the applicable Gate passes.
- No MCP server, Git hook, CI integration, remote store, or agent-specific entrypoint is included in this MVP.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `package.json` | Package scripts, ESM metadata, runtime and test dependencies, `sdd` bin mapping |
| `tsconfig.json` | Strict NodeNext TypeScript compilation |
| `src/domain/types.ts` | States, branded IDs, metadata, events, and result types |
| `src/domain/errors.ts` | Stable domain and Gate error types |
| `src/domain/transitions.ts` | Legal Delivery and Spec state transitions |
| `src/storage/ports.ts` | Metadata, event, and filesystem interfaces |
| `src/storage/local-repositories.ts` | YAML metadata persistence and JSONL append-only events |
| `src/artifacts/paths.ts` | Canonical repository paths |
| `src/artifacts/artifact-store.ts` | Markdown reads, section validation, and SHA-256 hashes |
| `src/gates/requirements.ts` | Requirement and Design Gate rules |
| `src/gates/specs.ts` | Spec, Plan, and Check Gate rules plus dependency cycle detection |
| `src/workflow/service.ts` | `init`, `new`, `status`, `approve`, `verify`, and `next` use cases |
| `src/runtime/next-context.ts` | Activity and logical-skill context resolution |
| `src/cli.ts` | Commander command registration, output, and exit-code mapping |
| `src/index.ts` | Public library exports |
| `tests/**/*.test.ts` | Unit, filesystem integration, and CLI behavior tests |

---

### Task 1: Establish the TypeScript package and executable test harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts`
- Create: `tests/package.test.ts`

**Interfaces:**
- Consumes: Node.js 20+.
- Produces: `npm test`, `npm run typecheck`, and `parseDeliveryId(input): DeliveryId` for all later domain and storage tasks.

- [ ] **Step 1: Write the failing package-surface test**

```ts
// tests/package.test.ts
import { describe, expect, it } from 'vitest';
import { parseDeliveryId } from '../src/index.js';

describe('Delivery ID parsing', () => {
  it('accepts a Delivery ID with the DLV prefix', () => {
    expect(parseDeliveryId('DLV-001')).toBe('DLV-001');
  });

  it('rejects IDs without the DLV prefix', () => {
    expect(() => parseDeliveryId('001')).toThrow('Invalid Delivery ID');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/package.test.ts`

Expected: FAIL because the package configuration and `src/index.ts` do not exist.

- [ ] **Step 3: Add the minimum package configuration and export**

```json
{
  "name": "@team-sdd/core",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.0.0",
    "vitest": "^3.0.0"
  }
}
```

```ts
// src/domain/types.ts
export type DeliveryId = `DLV-${string}`;

export function parseDeliveryId(input: string): DeliveryId {
  if (!/^DLV-[A-Za-z0-9][A-Za-z0-9_-]*$/.test(input)) {
    throw new Error(`Invalid Delivery ID: ${input}`);
  }
  return input;
}

// src/index.ts
export { parseDeliveryId } from './domain/types.js';
```

- [ ] **Step 4: Run the focused test and typecheck**

Run: `npm test -- tests/package.test.ts && npm run typecheck`

Expected: PASS with zero TypeScript diagnostics.

- [ ] **Step 5: Commit the package foundation**

```bash
git add package.json tsconfig.json src/domain/types.ts src/index.ts tests/package.test.ts
git commit -m "chore: establish Team SDD TypeScript package"
```

### Task 2: Define domain values and legal state transitions

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/errors.ts`
- Create: `src/domain/transitions.ts`
- Create: `tests/domain/transitions.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: no application-specific module.
- Produces: `DeliveryState`, `SpecState`, `DeliveryMetadata`, `Approval`, `transitionDelivery()`, and `transitionSpec()` for Gates and workflow services.

- [ ] **Step 1: Write failing legal-and-illegal-transition tests**

```ts
import { describe, expect, it } from 'vitest';
import { transitionDelivery, transitionSpec } from '../../src/domain/transitions.js';

describe('state transitions', () => {
  it('moves a delivery from REQUIREMENT to DESIGN', () => {
    expect(transitionDelivery('REQUIREMENT', 'DESIGN')).toBe('DESIGN');
  });

  it('rejects a delivery jump from REQUIREMENT to DONE', () => {
    expect(() => transitionDelivery('REQUIREMENT', 'DONE')).toThrow('Illegal delivery transition');
  });

  it('moves a Spec Pack from CODE to CHECK', () => {
    expect(transitionSpec('CODE', 'CHECK')).toBe('CHECK');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/domain/transitions.test.ts`

Expected: FAIL because `src/domain/transitions.ts` does not exist.

- [ ] **Step 3: Implement immutable values and transition guards**

```ts
const deliveryTransitions = {
  REQUIREMENT: ['DESIGN', 'SPEC'], DESIGN: ['SPEC'], SPEC: ['EXECUTION'],
  EXECUTION: ['CHECK'], CHECK: ['DONE'], DONE: [],
} as const;

export function transitionDelivery(from: DeliveryState, to: DeliveryState): DeliveryState {
  if (!deliveryTransitions[from].includes(to as never)) {
    throw new DomainError('ILLEGAL_DELIVERY_TRANSITION', `Illegal delivery transition: ${from} -> ${to}`);
  }
  return to;
}
```

Define the analogous `SpecState` table (`READY → PLAN → CODE → CHECK → DONE`), `Approval`, and `DeliveryMetadata` structures from the design document. `DomainError` carries a stable `code` and message.

- [ ] **Step 4: Run domain tests and typecheck**

Run: `npm test -- tests/domain/transitions.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the domain model**

```bash
git add src/domain tests/domain src/index.ts
git commit -m "feat: add workflow domain and transition guards"
```

### Task 3: Persist validated Delivery metadata and append-only events

**Files:**
- Create: `src/storage/ports.ts`
- Create: `src/storage/local-repositories.ts`
- Create: `tests/storage/local-repositories.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `DeliveryMetadata`, `DomainError`.
- Produces: `DeliveryRepository.read(id)`, `DeliveryRepository.save(metadata)`, and `EventRepository.append(event)`.

- [ ] **Step 1: Write failing filesystem-persistence tests**

```ts
it('round-trips validated delivery metadata as YAML', async () => {
  const repository = new LocalDeliveryRepository(tempRoot);
  await repository.save(delivery);

  await expect(repository.read('DLV-001')).resolves.toEqual(delivery);
});

it('appends, rather than overwrites, JSONL events', async () => {
  await events.append(createdEvent);
  await events.append(transitionedEvent);

  await expect(readFile(eventPath, 'utf8')).resolves.toMatch(/^.+\n.+\n$/s);
});
```

- [ ] **Step 2: Run the storage tests to verify they fail**

Run: `npm test -- tests/storage/local-repositories.test.ts`

Expected: FAIL because the local repositories are missing.

- [ ] **Step 3: Add the YAML schema and append-only implementation**

Install `yaml` and `zod`. Define `DeliveryMetadataSchema` with literal state unions and strict object fields. Implement repository paths as `sdd/deliveries/<id>/delivery.yaml`; reject invalid files with `DomainError('INVALID_DELIVERY_METADATA', ...)`. Append one serialized event plus `\n` with `appendFile`, never `writeFile`, at `.sdd/events/<id>.jsonl`.

```ts
export interface DeliveryRepository {
  read(id: string): Promise<DeliveryMetadata>;
  save(delivery: DeliveryMetadata): Promise<void>;
}

export interface EventRepository {
  append(event: WorkflowEvent): Promise<void>;
}
```

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm test -- tests/storage/local-repositories.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit local persistence**

```bash
git add package.json package-lock.json src/storage tests/storage
git commit -m "feat: persist delivery metadata and workflow events"
```

### Task 4: Implement artifact paths, content validation, and approval hashes

**Files:**
- Create: `src/artifacts/paths.ts`
- Create: `src/artifacts/artifact-store.ts`
- Create: `tests/artifacts/artifact-store.test.ts`

**Interfaces:**
- Consumes: Node filesystem, Delivery and Spec IDs.
- Produces: `ArtifactStore.read(kind, ref)`, `ArtifactStore.hash(kind, ref)`, and `validateRequiredSections(markdown, sections)`.

- [ ] **Step 1: Write failing artifact contract tests**

```ts
it('uses the canonical requirement artifact path', () => {
  expect(requirementPath(root, 'DLV-001')).toBe(join(root, 'sdd/deliveries/DLV-001/requirement.md'));
});

it('invalidates an approval when its artifact content changes', async () => {
  const firstHash = await store.hash({ deliveryId: 'DLV-001', kind: 'requirement' });
  await writeFile(requirementPath(root, 'DLV-001'), '# Requirement\n## Source\nChanged');

  await expect(store.hasCurrentHash({ deliveryId: 'DLV-001', kind: 'requirement' }, firstHash)).resolves.toBe(false);
});
```

- [ ] **Step 2: Run the artifact tests to verify they fail**

Run: `npm test -- tests/artifacts/artifact-store.test.ts`

Expected: FAIL because the path and artifact store modules are missing.

- [ ] **Step 3: Implement canonical paths and SHA-256 functions**

```ts
export function requirementPath(root: string, deliveryId: string): string {
  return join(root, 'sdd', 'deliveries', deliveryId, 'requirement.md');
}

export function sha256(content: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}
```

Validate headings by exact `## <section>` matches and flag a case-insensitive `TBD` or `TODO` token. Provide canonical functions for requirement, design, spec, plan, and check artifact paths.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm test -- tests/artifacts/artifact-store.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the artifact store**

```bash
git add src/artifacts tests/artifacts
git commit -m "feat: add artifact contracts and approval hashing"
```

### Task 5: Add Requirement and Design Gates with approval validation

**Files:**
- Create: `src/gates/types.ts`
- Create: `src/gates/requirements.ts`
- Create: `tests/gates/requirements.test.ts`

**Interfaces:**
- Consumes: `ArtifactStore`, `Approval`, `DeliveryMetadata`.
- Produces: `evaluateRequirementGate(input): GateResult` and `evaluateDesignGate(input): GateResult`.

- [ ] **Step 1: Write failing Gate tests**

```ts
it('reports baseline and human approval as separate Requirement Gate findings', async () => {
  const result = await evaluateRequirementGate({ delivery, artifacts });

  expect(result.ok).toBe(false);
  expect(result.findings.map(({ code }) => code)).toEqual([
    'REQUIREMENT_BASELINE_MISSING',
    'REQUIREMENT_APPROVAL_MISSING',
  ]);
});

it('skips the Design Gate only for a feature change with an explicit false decision', async () => {
  await expect(evaluateDesignGate({ delivery: featureWithoutDesign, artifacts })).resolves.toMatchObject({ ok: true, skipped: true });
});
```

- [ ] **Step 2: Run the Gate tests to verify they fail**

Run: `npm test -- tests/gates/requirements.test.ts`

Expected: FAIL because Gate functions are missing.

- [ ] **Step 3: Implement deterministic findings**

Use `GateFinding` values with `code`, `message`, `artifact`, and `nextStep`. Require the Requirement sections `Source`, `Scope`, and `Baseline`; treat a heading matching `## Questions` with unresolved status as a blocking question. Require an approval whose stored hash equals the artifact hash. Require Design for application initialization and require the sections in the PRD design checklist for an applicable Design Gate.

```ts
export type GateResult = { ok: true; skipped?: boolean } | { ok: false; findings: GateFinding[] };
```

- [ ] **Step 4: Run Gate tests and the full suite**

Run: `npm test -- tests/gates/requirements.test.ts && npm test && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the Requirement and Design Gates**

```bash
git add src/gates tests/gates
git commit -m "feat: validate requirement and design gates"
```

### Task 6: Add Spec, Plan, and Check Gates

**Files:**
- Create: `src/gates/specs.ts`
- Create: `tests/gates/specs.test.ts`
- Modify: `src/gates/types.ts`

**Interfaces:**
- Consumes: Delivery metadata, Spec artifacts, `ArtifactStore`.
- Produces: `evaluateSpecGate()`, `evaluatePlanGate()`, `evaluateCheckGate()`, and `findDependencyCycle()`.

- [ ] **Step 1: Write failing Spec dependency and Plan coverage tests**

```ts
it('rejects cyclic Spec dependencies', async () => {
  const result = await evaluateSpecGate({ delivery: cyclicDelivery, artifacts });

  expect(result).toMatchObject({ ok: false });
  expect(result.findings).toContainEqual(expect.objectContaining({ code: 'SPEC_DEPENDENCY_CYCLE' }));
});

it('rejects a plan that does not cover every acceptance criterion', async () => {
  const result = await evaluatePlanGate({ spec, plan: '# Plan\n### Task 1: One task', artifacts });

  expect(result.findings).toContainEqual(expect.objectContaining({ code: 'PLAN_AC_UNCOVERED' }));
});
```

- [ ] **Step 2: Run the Gate tests to verify they fail**

Run: `npm test -- tests/gates/specs.test.ts`

Expected: FAIL because Spec Gate functions are absent.

- [ ] **Step 3: Implement Spec graph and artifact rules**

Parse `Dependencies` and `Acceptance Criteria` headings from each Spec. Detect cycles with depth-first traversal, return the closed cycle path, and require `Goal`, `Scope`, `Out of Scope`, `Acceptance Criteria`, `Dependencies`, `Constraints`, and `Expected Impact`. Plan validation requires every AC identifier to appear in a task section and each task to contain a verification marker. Check validation requires tests/build/static-check evidence plus AC pass evidence.

- [ ] **Step 4: Run focused and full tests**

Run: `npm test -- tests/gates/specs.test.ts && npm test && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit remaining Gates**

```bash
git add src/gates tests/gates
git commit -m "feat: add spec plan and check gates"
```

### Task 7: Implement workflow service actions and `next` context

**Files:**
- Create: `src/runtime/next-context.ts`
- Create: `src/workflow/service.ts`
- Create: `tests/workflow/service.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: storage and artifact ports plus all Gate functions.
- Produces: `SddService`, `createSddService(dependencies)`, `StatusResult`, `NextResult`, and `VerificationResult`.

- [ ] **Step 1: Write failing public-service behavior tests**

```ts
it('records a human requirement approval and makes the approval hash current', async () => {
  await service.approve({ deliveryId: 'DLV-001', artifact: 'requirement', approvedBy: 'wangxin' });

  await expect(service.getStatus({ deliveryId: 'DLV-001' })).resolves.toMatchObject({
    delivery: { approvals: { requirement: { actorType: 'human', approvedBy: 'wangxin' } } },
  });
});

it('returns the requirement activity without advancing state when the Requirement Gate is blocked', async () => {
  await expect(service.getNext({ deliveryId: 'DLV-001' })).resolves.toMatchObject({
    activity: 'REQUIREMENT',
    blockers: [expect.objectContaining({ code: 'REQUIREMENT_BASELINE_MISSING' })],
  });
});
```

- [ ] **Step 2: Run the service tests to verify they fail**

Run: `npm test -- tests/workflow/service.test.ts`

Expected: FAIL because the service factory is absent.

- [ ] **Step 3: Implement actions as one transaction-shaped workflow**

`init` writes `.sdd/config.yaml`; `createDelivery` validates the ID and creates `delivery.yaml` plus `delivery.created`; `approve` computes the current artifact hash and appends `*.approved`; `verify` evaluates the active Gate; `getNext` resolves one of `REQUIREMENT`, `DESIGN`, `SPEC_SPLIT`, `PLAN`, `CODE`, or `CHECK`. When the current Gate passes, `getNext` invokes the transition guard, saves metadata, appends a transition event, and returns the new activity context; otherwise it returns blockers without modifying state.

```ts
export function createSddService(deps: ServiceDependencies): SddService {
  return { init, createDelivery, getStatus, approve, getNext, verify };
}
```

- [ ] **Step 4: Run service tests and all tests**

Run: `npm test -- tests/workflow/service.test.ts && npm test && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit workflow services**

```bash
git add src/workflow src/runtime src/index.ts tests/workflow
git commit -m "feat: add governed Team SDD workflow service"
```

### Task 8: Expose the MVP through a CLI and complete end-to-end verification

**Files:**
- Create: `src/cli.ts`
- Create: `tests/cli.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `SddService` and Commander.
- Produces: executable `sdd` commands: `init`, `new`, `status`, `approve`, `verify`, and `next`.

- [ ] **Step 1: Write failing CLI tests using a temporary repository**

```ts
it('creates and reports a Delivery through the CLI', async () => {
  const created = await runCli(['new', 'DLV-001', '--title', 'Student records', '--type', 'APPLICATION_INIT'], root);
  const status = await runCli(['status', 'DLV-001'], root);

  expect(created.exitCode).toBe(0);
  expect(status.stdout).toContain('DLV-001 · Student records');
  expect(status.stdout).toContain('Requirement');
});

it('returns a non-zero exit code and actionable Gate finding for a blocked verification', async () => {
  const result = await runCli(['verify', 'DLV-001'], root);

  expect(result.exitCode).toBe(2);
  expect(result.stderr).toContain('Requirement baseline is missing');
});
```

- [ ] **Step 2: Run CLI tests to verify they fail**

Run: `npm test -- tests/cli.test.ts`

Expected: FAIL because the executable entrypoint is missing.

- [ ] **Step 3: Implement thin command adapters**

Install `commander`, add `"bin": { "sdd": "./dist/cli.js" }`, and register commands that parse input, create the service with the current directory as repository root, display service results, and set exit code `2` for Gate failures and `1` for domain or filesystem errors. No CLI command may evaluate a Gate or update metadata directly.

- [ ] **Step 4: Run the complete verification suite**

Run: `npm test && npm run typecheck`

Expected: PASS with every test green and no TypeScript diagnostics.

- [ ] **Step 5: Commit the CLI MVP**

```bash
git add package.json package-lock.json src/cli.ts tests/cli.test.ts
git commit -m "feat: expose Team SDD workflow through CLI"
```

## Plan Self-Review

- [x] Spec coverage: Tasks 1-8 cover package setup, domain, schemas, storage, artifact hashes, Requirement/Design/Spec/Plan/Check Gates, service actions, next context, events, and CLI.
- [x] No-placeholder scan: Plan steps define exact files, commands, expected red/green results, required interfaces, and concrete test behavior.
- [x] Type consistency: `SddService`, `DeliveryMetadata`, Gate result types, state names, and artifact contracts use the design document's names consistently.
