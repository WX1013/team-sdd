import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { createAgentContextService } from '../workflow/agent-context-service.js';
import { createSddService } from '../workflow/service.js';
import { defaultCapabilities } from '../runtime/capabilities.js';
import { designImpacts, parseDeliveryId, parseSpecId } from '../domain/types.js';
import { toolError, type ToolResult } from './types.js';

const rootSchema = z.string().refine(isAbsolute, 'root must be an absolute path');
const deliveryIdSchema = z.string().regex(/^DLV-[A-Za-z0-9][A-Za-z0-9_-]*$/).transform(parseDeliveryId);
const specIdSchema = z.string().regex(/^SP-[A-Za-z0-9][A-Za-z0-9_-]*$/).transform(parseSpecId);

export const statusInputSchema = z.object({ root: rootSchema, deliveryId: deliveryIdSchema }).strict();
export const nextInputSchema = statusInputSchema;
export const verifyInputSchema = statusInputSchema;
export const approveInputSchema = statusInputSchema.extend({ artifact: z.enum(['requirement', 'design', 'spec']), approvedBy: z.string().min(1) }).strict();
export const newInputSchema = z.object({
  root: rootSchema,
  id: deliveryIdSchema,
  title: z.string().min(1),
  type: z.enum(['APPLICATION_INIT', 'FEATURE_CHANGE']),
  design: z.object({ required: z.boolean(), reason: z.string().min(1) }).optional(),
}).strict();
export const submitInputSchema = z.object({
  root: rootSchema,
  deliveryId: deliveryIdSchema,
  kind: z.enum(['requirement', 'design', 'spec', 'plan', 'check']),
  specId: specIdSchema.optional(),
  evidence: z.object({
    tests: z.array(z.string()).optional(), build: z.string().optional(), staticChecks: z.array(z.string()).optional(),
    integration: z.array(z.string()).optional(), regression: z.array(z.string()).optional(), deliveryAcceptance: z.array(z.string()).optional(),
  }).optional(),
}).strict();
export const contextInputSchema = statusInputSchema.extend({
  capabilities: z.object({
    skills: z.boolean().optional(), slashCommands: z.boolean().optional(), subagents: z.boolean().optional(), worktrees: z.boolean().optional(),
    shell: z.boolean().optional(), fileRead: z.boolean().optional(), fileWrite: z.boolean().optional(), mcp: z.boolean().optional(),
  }).optional(),
}).strict();
export const assessDesignInputSchema = statusInputSchema.extend({
  impacts: z.array(z.enum(designImpacts)), reason: z.string().min(1),
}).strict();
export const decideDesignInputSchema = statusInputSchema.extend({
  required: z.boolean(), reason: z.string().min(1), approvedBy: z.string().min(1),
}).strict();

function parse<T>(schema: z.ZodType<T>, input: unknown): T | ToolResult<never> {
  const result = schema.safeParse(input);
  return result.success ? result.data : { ok: false, error: { code: 'INVALID_TOOL_INPUT', message: result.error.issues.map((issue) => issue.message).join('; ') } };
}

export function createToolHandlers() {
  return {
    async sdd_new(input: unknown): Promise<ToolResult<unknown>> {
      const parsed = parse(newInputSchema, input); if ('ok' in parsed) return parsed;
      try { const { root, ...request } = parsed; return { ok: true, data: await createSddService({ root }).createDelivery(request) }; } catch (error) { return toolError(error); }
    },
    async sdd_status(input: unknown): Promise<ToolResult<unknown>> {
      const parsed = parse(statusInputSchema, input); if ('ok' in parsed) return parsed;
      try { return { ok: true, data: await createSddService({ root: parsed.root }).getStatus({ deliveryId: parsed.deliveryId }) }; } catch (error) { return toolError(error); }
    },
    async sdd_next(input: unknown): Promise<ToolResult<unknown>> {
      const parsed = parse(nextInputSchema, input); if ('ok' in parsed) return parsed;
      try { return { ok: true, data: await createSddService({ root: parsed.root }).getNext({ deliveryId: parsed.deliveryId }) }; } catch (error) { return toolError(error); }
    },
    async sdd_verify(input: unknown): Promise<ToolResult<unknown>> {
      const parsed = parse(verifyInputSchema, input); if ('ok' in parsed) return parsed;
      try {
        const data = await createSddService({ root: parsed.root }).verify({ deliveryId: parsed.deliveryId });
        return data.ok ? { ok: true, data } : { ok: false, findings: data.findings };
      } catch (error) { return toolError(error); }
    },
    async sdd_approve(input: unknown): Promise<ToolResult<unknown>> {
      const parsed = parse(approveInputSchema, input); if ('ok' in parsed) return parsed;
      try { const { root, ...request } = parsed; return { ok: true, data: await createSddService({ root }).approve(request) }; } catch (error) { return toolError(error); }
    },
    async sdd_submit_artifact(input: unknown): Promise<ToolResult<unknown>> {
      const parsed = parse(submitInputSchema, input); if ('ok' in parsed) return parsed;
      try {
        const { root, ...request } = parsed;
        const data = await createSddService({ root }).submitArtifact(request);
        return data.accepted ? { ok: true, data } : { ok: false, findings: data.findings };
      } catch (error) { return toolError(error); }
    },
    async sdd_get_context(input: unknown): Promise<ToolResult<unknown>> {
      const parsed = parse(contextInputSchema, input); if ('ok' in parsed) return parsed;
      try {
        const service = createSddService({ root: parsed.root });
        return { ok: true, data: await createAgentContextService(service).getContext({ deliveryId: parsed.deliveryId, capabilities: { ...defaultCapabilities, ...parsed.capabilities } }) };
      } catch (error) { return toolError(error); }
    },
    async sdd_assess_design(input: unknown): Promise<ToolResult<unknown>> {
      const parsed = parse(assessDesignInputSchema, input); if ('ok' in parsed) return parsed;
      try { const { root, ...request } = parsed; return { ok: true, data: await createSddService({ root }).assessDesign(request) }; } catch (error) { return toolError(error); }
    },
    async sdd_decide_design(input: unknown): Promise<ToolResult<unknown>> {
      const parsed = parse(decideDesignInputSchema, input); if ('ok' in parsed) return parsed;
      try { const { root, ...request } = parsed; return { ok: true, data: await createSddService({ root }).decideDesign(request) }; } catch (error) { return toolError(error); }
    },
  };
}
