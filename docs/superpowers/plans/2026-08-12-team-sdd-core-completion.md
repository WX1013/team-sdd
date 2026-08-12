# Team SDD Complete Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the repository-local Team SDD Core with governed Spec Pack creation, Artifact submission, all Delivery and Spec Pack state transitions, evidence Gates, and CLI access.

**Architecture:** `SddService` is the only state-mutation boundary. CLI callers write artifacts to canonical paths then call service methods; the service validates content and evidence, writes append-only events, and uses domain transition guards before saving YAML metadata. `next` becomes read-only context resolution.

**Tech Stack:** Node.js 20+, ESM TypeScript, Vitest, Zod, YAML, Commander.

## Global Constraints

- All behavior is developed test-first with Vitest and real temporary repositories.
- Only the workflow service may mutate Delivery or Spec Pack state.
- Persisted YAML is strictly validated with Zod; events are append-only JSONL.
- `spec`, `plan`, and `check` submissions require a Spec Pack ID.
- No MCP, CI, Hook, doctor, remote store, or agent-specific integration belongs to this phase.
- Gate failures preserve state except failed Spec Checks, which return `CHECK` to `CODE`.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/domain/types.ts` | Extended Spec summary, submission input/result, verification evidence |
| `src/storage/local-repositories.ts` | Zod-compatible persistence for extended Spec fields |
| `src/artifacts/artifact-store.ts` | Structured Spec template and Artifact parsing helpers |
| `src/gates/specs.ts` | Spec Check and Delivery Check evidence validation |
| `src/runtime/next-context.ts` | Read-only activity context resolution |
| `src/workflow/service.ts` | Spec creation, submission, events, and all guarded transitions |
| `src/cli.ts` | `sdd spec create` and `sdd submit` thin adapters |
| `tests/workflow/core-completion.test.ts` | Service-level lifecycle and event integration tests |
| `tests/cli.test.ts` | CLI creation/submission behavior |

### Task 1: Extend metadata and create Spec Pack artifacts

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/storage/local-repositories.ts`
- Modify: `src/artifacts/artifact-store.ts`
- Create: `tests/workflow/spec-pack-creation.test.ts`

**Interfaces:**
- Produces `CreateSpecPackInput`, extended `SpecSummary`, and `createSpecPack(input): Promise<CommandResult>`.

- [ ] **Step 1: Write the failing service test**

```ts
it('creates a READY Spec Pack and its structured spec artifact only during SPEC', async () => {
  await service.createDelivery({ id: 'DLV-001', title: 'Records', type: 'FEATURE_CHANGE', design: { required: false, reason: 'Small change' } });
  await advanceRequirementToSpec(service, root);

  await service.createSpecPack({ deliveryId: 'DLV-001', id: 'SP-001', title: 'Records', acceptanceCriteria: ['AC-001'] });

  await expect(service.getStatus({ deliveryId: 'DLV-001' })).resolves.toMatchObject({
    delivery: { specs: [{ id: 'SP-001', state: 'READY', acceptanceCriteria: ['AC-001'] }] },
  });
  await expect(readFile(join(root, 'sdd/deliveries/DLV-001/specs/SP-001/spec.md'), 'utf8')).resolves.toContain('## Acceptance Criteria');
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/workflow/spec-pack-creation.test.ts`

Expected: FAIL because `createSpecPack` is absent.

- [ ] **Step 3: Add the smallest metadata and creation implementation**

```ts
type SpecSummary = {
  id: SpecId;
  title: string;
  state: SpecState;
  dependencies: SpecId[];
  acceptanceCriteria: string[];
};

async function createSpecPack(input: CreateSpecPackInput): Promise<CommandResult> {
  // Require SPEC, reject duplicate/self/unknown dependency, save metadata,
  // write the fixed Spec template, then append spec.created.
}
```

Update the Zod schema with default-free required `dependencies` and `acceptanceCriteria` arrays so malformed legacy metadata fails visibly.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/workflow/spec-pack-creation.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/types.ts src/storage/local-repositories.ts src/artifacts/artifact-store.ts src/workflow/service.ts tests/workflow/spec-pack-creation.test.ts
git commit -m "feat: create governed spec packs"
```

### Task 2: Submit Delivery Artifacts and make `next` read-only

**Files:**
- Modify: `src/workflow/service.ts`
- Modify: `src/runtime/next-context.ts`
- Create: `tests/workflow/delivery-submission.test.ts`

**Interfaces:**
- Produces `submitArtifact(input): Promise<SubmissionResult>` for Delivery Artifact kinds and a non-mutating `getNext(input)`.

- [ ] **Step 1: Write the failing transition and non-mutation tests**

```ts
it('moves REQUIREMENT to DESIGN only when a submitted approved Requirement passes its Gate', async () => {
  await writeValidRequirement(root, 'DLV-001');
  await service.approve({ deliveryId: 'DLV-001', artifact: 'requirement', approvedBy: 'wangxin' });

  await expect(service.submitArtifact({ deliveryId: 'DLV-001', kind: 'requirement' })).resolves.toMatchObject({ advanced: true, deliveryState: 'DESIGN' });
});

it('returns Requirement context from next without changing state', async () => {
  await service.getNext({ deliveryId: 'DLV-001' });
  await expect(service.getStatus({ deliveryId: 'DLV-001' })).resolves.toMatchObject({ delivery: { state: 'REQUIREMENT' } });
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/workflow/delivery-submission.test.ts`

Expected: FAIL because `submitArtifact` is absent and `next` still mutates state.

- [ ] **Step 3: Implement submission routing**

```ts
type SubmitArtifactInput = { deliveryId: DeliveryId; kind: ArtifactKind; specId?: SpecId; evidence?: VerificationEvidence };
type SubmissionResult = { accepted: boolean; advanced: boolean; deliveryState: DeliveryState; specState?: SpecState; findings: GateFinding[] };
```

Append `artifact.submitted` after the Artifact is readable and hashed. Route Requirement, Design, and aggregate Spec submissions to their Gates; on success use `transitionDelivery`, persist, and append `delivery.transitioned`. Remove state-changing logic from `getNext`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/workflow/delivery-submission.test.ts && npm test && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workflow/service.ts src/runtime/next-context.ts tests/workflow/delivery-submission.test.ts
git commit -m "feat: submit delivery artifacts through workflow engine"
```

### Task 3: Govern Spec execution, Check evidence, and Delivery Check

**Files:**
- Modify: `src/gates/specs.ts`
- Modify: `src/workflow/service.ts`
- Create: `tests/workflow/spec-execution.test.ts`

**Interfaces:**
- Produces Spec `submitArtifact` progression and Delivery Check evidence validation.

- [ ] **Step 1: Write failing Spec completion tests**

```ts
it('moves a planned Spec Pack through CODE and DONE, then enters Delivery CHECK', async () => {
  await setupApprovedSpecDelivery(service, root);
  await writePlanCoveringAllCriteria(root, 'DLV-001', 'SP-001');

  await expect(service.submitArtifact({ deliveryId: 'DLV-001', kind: 'plan', specId: 'SP-001' })).resolves.toMatchObject({ advanced: true, specState: 'CODE' });
  await writeCheckWithPassingCriteria(root, 'DLV-001', 'SP-001');
  await expect(service.submitArtifact({ deliveryId: 'DLV-001', kind: 'check', specId: 'SP-001', evidence: { tests: ['unit'], build: 'npm run build', staticChecks: ['npm run typecheck'] } })).resolves.toMatchObject({ advanced: true, specState: 'DONE', deliveryState: 'CHECK' });
});

it('returns a failed Spec Check from CHECK to CODE and appends check.failed', async () => {
  // Set up active Spec in CHECK and submit incomplete evidence.
  await expect(service.submitArtifact({ deliveryId: 'DLV-001', kind: 'check', specId: 'SP-001', evidence: { tests: [], build: '', staticChecks: [] } })).resolves.toMatchObject({ advanced: false, specState: 'CODE' });
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/workflow/spec-execution.test.ts`

Expected: FAIL because Spec submission transitions and evidence validation are absent.

- [ ] **Step 3: Implement the smallest guarded Spec workflow**

Require Plan Gate success to record `READY → PLAN → CODE`. A Check submission receives `CODE`, records `CODE → CHECK`, validates its Check Artifact and non-empty `tests`, `build`, and `staticChecks`, then records `CHECK → DONE` or `CHECK → CODE` plus `check.failed`. When all Specs are done, transition Delivery to `CHECK`.

Add `evaluateDeliveryCheck({ delivery, check, evidence })` requiring all Specs done, `Requirement Coverage: 100%` in the Check Artifact, and non-empty integration/regression/delivery-acceptance evidence.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/workflow/spec-execution.test.ts && npm test && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gates/specs.ts src/workflow/service.ts tests/workflow/spec-execution.test.ts
git commit -m "feat: govern spec execution and delivery check"
```

### Task 4: Expose completion actions through CLI

**Files:**
- Modify: `src/cli.ts`
- Modify: `tests/cli.test.ts`

**Interfaces:**
- Produces `sdd spec create` and `sdd submit` using only `SddService` methods.

- [ ] **Step 1: Write failing CLI tests**

```ts
it('creates a Spec Pack and reports Gate findings from submit', async () => {
  await setupSpecPhaseThroughCli(root);
  const created = await runCli(['spec', 'create', 'DLV-001', 'SP-001', '--title', 'Records'], root);
  const submitted = await runCli(['submit', 'DLV-001', 'plan', '--spec', 'SP-001'], root);

  expect(created.exitCode).toBe(0);
  expect(submitted.exitCode).toBe(2);
  expect(submitted.stderr).toContain('Plan artifact is missing');
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/cli.test.ts`

Expected: FAIL because `spec create` and `submit` are unregistered.

- [ ] **Step 3: Implement thin Commander actions**

Register `spec create` with repeatable `--depends-on`; register `submit` with `--spec`, repeatable `--tests` and `--static-check`, and single `--build`. Pass parsed values to the service, render Findings with the existing formatter, and map a rejected submission to exit code 2.

- [ ] **Step 4: Run full verification and CLI smoke test**

Run: `npm test && npm run typecheck && npm run build`

Expected: PASS.

Run: `node dist/cli.js --help`

Expected: command list includes `spec` and `submit`.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts tests/cli.test.ts
git commit -m "feat: expose spec workflow through CLI"
```

## Plan Self-Review

- [x] Spec coverage: Tasks 1-4 cover metadata, templates, Artifact submission, Delivery and Spec transitions, event recording, evidence Gates, Delivery Check, and CLI.
- [x] Placeholder scan: Every task names files, interfaces, tests, commands, expected failures, implementation rules, and verification output.
- [x] Type consistency: `CreateSpecPackInput`, `SubmitArtifactInput`, `SubmissionResult`, `SpecSummary`, `GateFinding`, and `VerificationEvidence` use the names specified by the design.
