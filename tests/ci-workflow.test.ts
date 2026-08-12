import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

describe('Team SDD CI workflow', () => {
  it('runs the Team SDD CI verifier after building on push and pull requests', async () => {
    const workflow = parse(await readFile('.github/workflows/team-sdd.yml', 'utf8')) as Record<string, unknown>;
    const steps = (workflow.jobs as { verify: { steps: Array<Record<string, unknown>> } }).verify.steps;
    const setupNode = steps.find((step) => step.uses === 'actions/setup-node@v4');

    expect(workflow.on).toEqual(['push', 'pull_request']);
    expect(setupNode).toMatchObject({ with: { 'node-version': 20, cache: 'npm' } });
    expect(steps.map((step) => step.run)).toEqual([undefined, undefined, 'npm ci', 'npm run build', 'npm run verify:ci']);
  });
});
