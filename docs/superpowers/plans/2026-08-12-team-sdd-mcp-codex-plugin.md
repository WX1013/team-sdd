# Team SDD MCP and Codex Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose Team SDD Core actions through a standard stdio MCP server and a repository-local Codex Plugin without duplicating workflow rules.

**Architecture:** Tool adapters validate request schemas, create existing services with the provided absolute root, and normalize outputs into `ToolResult` envelopes. The stdio server registers adapters through the official MCP SDK. The Codex Plugin only configures that server and supplies a concise Skill that requires context retrieval and Engine-governed submission.

**Tech Stack:** Node.js 20+, ESM TypeScript, Vitest, Zod, Commander, `@modelcontextprotocol/sdk`.

## Global Constraints

- Implement tests first and run them red before production changes.
- Every MCP Tool requires an absolute `root`; no global configuration is read.
- MCP adapts existing services only; it never accesses metadata, decides Gates, or transitions state.
- Gate blockers use `{ ok: false, findings }`; Domain and filesystem failures use `{ ok: false, error }`.
- Use stdio only; no HTTP listener or external service.
- Plugin and Skill must be generated and validated with their applicable creation skills.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/mcp/types.ts` | Tool Result envelope and normalized error conversion |
| `src/mcp/tools.ts` | Zod tool schemas and service adapters |
| `src/mcp/server.ts` | MCP SDK tool registration and stdio startup |
| `src/mcp-server.ts` | Executable entrypoint |
| `tests/mcp/tools.test.ts` | Adapter behavior against temporary repositories |
| `tests/mcp/server.test.ts` | stdio MCP client/server protocol integration |
| `plugins/team-sdd/.codex-plugin/plugin.json` | Valid Codex Plugin manifest |
| `plugins/team-sdd/.mcp.json` | Local stdio server configuration |
| `plugins/team-sdd/skills/team-sdd/SKILL.md` | Codex operating workflow |
| `plugins/team-sdd/skills/team-sdd/agents/openai.yaml` | Codex Skill UI metadata |

### Task 1: Build normalized, schema-validated MCP Tool adapters

**Files:**
- Create: `src/mcp/types.ts`
- Create: `src/mcp/tools.ts`
- Create: `tests/mcp/tools.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `ToolResult<T>`, `createToolHandlers()`, and named input Zod schemas for all seven MCP tools.

- [ ] **Step 1: Write failing Tool adapter tests**

```ts
it('returns a successful status envelope from an explicit repository root', async () => {
  await service.createDelivery({ id: 'DLV-001', title: 'Records', type: 'APPLICATION_INIT' });

  await expect(tools.sdd_status({ root, deliveryId: 'DLV-001' })).resolves.toMatchObject({
    ok: true,
    data: { delivery: { id: 'DLV-001' } },
  });
});

it('returns Gate blockers as a normal submit result', async () => {
  await service.createDelivery({ id: 'DLV-001', title: 'Records', type: 'APPLICATION_INIT' });

  await expect(tools.sdd_submit_artifact({ root, deliveryId: 'DLV-001', kind: 'requirement' })).resolves.toMatchObject({
    ok: false,
    findings: [expect.objectContaining({ code: 'REQUIREMENT_ARTIFACT_MISSING' })],
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/mcp/tools.test.ts`

Expected: FAIL because MCP Tool modules are absent.

- [ ] **Step 3: Implement service-only Tool adapters**

Install `@modelcontextprotocol/sdk`. Use Zod strict object schemas with `root: z.string().refine(isAbsolute)`. Implement seven async handlers. Instantiate `createSddService({ root })` and `createAgentContextService(service)` per call. Catch `DomainError` as `{ ok: false, error: { code, message } }`; map non-domain errors to `MCP_TOOL_FAILURE`; map rejected submissions to `{ ok: false, findings }`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/mcp/tools.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/mcp tests/mcp/tools.test.ts
git commit -m "feat: add Team SDD MCP tool adapters"
```

### Task 2: Register a stdio MCP Server and verify the protocol

**Files:**
- Create: `src/mcp/server.ts`
- Create: `src/mcp-server.ts`
- Create: `tests/mcp/server.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `createMcpServer()` and executable `dist/mcp-server.js`.

- [ ] **Step 1: Write failing protocol integration test**

```ts
it('lists Team SDD tools and returns a JSON status result over stdio', async () => {
  const client = await connectToMcpServer('dist/mcp-server.js');
  const tools = await client.listTools();
  const result = await client.callTool({ name: 'sdd_status', arguments: { root, deliveryId: 'DLV-001' } });

  expect(tools.tools.map(({ name }) => name)).toContain('sdd_get_context');
  expect(extractJson(result)).toMatchObject({ ok: true });
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/mcp/server.test.ts`

Expected: FAIL because `dist/mcp-server.js` is absent.

- [ ] **Step 3: Implement stdio registration**

Use `McpServer` and `StdioServerTransport` from the MCP SDK. Register `sdd_new`, `sdd_next`, `sdd_approve`, `sdd_status`, `sdd_verify`, `sdd_submit_artifact`, and `sdd_get_context` with their Tool schemas. Return one text-content block containing serialized `ToolResult`; never set protocol-level errors for business blockers.

- [ ] **Step 4: Verify GREEN**

Run: `npm run build && npm test -- tests/mcp/server.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/server.ts src/mcp-server.ts tests/mcp/server.test.ts package.json
git commit -m "feat: expose Team SDD through stdio MCP"
```

### Task 3: Create and validate the repository-local Codex Plugin and Skill

**Files:**
- Create: `plugins/team-sdd/.codex-plugin/plugin.json`
- Create: `plugins/team-sdd/.mcp.json`
- Create: `plugins/team-sdd/skills/team-sdd/SKILL.md`
- Create: `plugins/team-sdd/skills/team-sdd/agents/openai.yaml`

**Interfaces:**
- Consumes: `dist/mcp-server.js` and the seven MCP Tool names.
- Produces: a valid plugin and a reusable Codex Team SDD operating Skill.

- [ ] **Step 1: Write a failing Plugin artifact test**

```ts
it('ships a Plugin MCP configuration pointing at the built stdio server', async () => {
  const config = JSON.parse(await readFile('plugins/team-sdd/.mcp.json', 'utf8'));

  expect(config.mcpServers['team-sdd'].args).toContain('dist/mcp-server.js');
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/plugin.test.ts`

Expected: FAIL because the Plugin does not exist.

- [ ] **Step 3: Generate and author the Plugin using its creation skills**

Run the Plugin Creator scaffold into the repository `plugins/` parent without a marketplace. Use the Skill Creator initializer for `plugins/team-sdd/skills/team-sdd`; author the concise, fixed five-step MCP operating procedure from the design. Configure `.mcp.json` to invoke Node with the repository-relative built server entry. Generate `agents/openai.yaml` from the final `SKILL.md` using the Skill Creator script.

- [ ] **Step 4: Validate Plugin and Skill**

Run: `python3 /Users/wangx/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/team-sdd`

Run: `python3 /Users/wangx/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/team-sdd/skills/team-sdd`

Expected: both validators exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugins tests/plugin.test.ts
git commit -m "feat: add Codex Team SDD plugin"
```

### Task 4: Complete integration verification

**Files:**
- Modify: `src/index.ts`
- Modify: `README.md` if one exists; otherwise create: `README.md`

**Interfaces:**
- Produces documented local build, MCP invocation, and Codex Plugin location.

- [ ] **Step 1: Write failing package-export test**

```ts
it('exports the MCP server factory', async () => {
  const packageApi = await import('../src/index.js');
  expect(packageApi.createMcpServer).toBeTypeOf('function');
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/package.test.ts`

Expected: FAIL because the factory is not exported.

- [ ] **Step 3: Export and document only actual integrations**

Export `createMcpServer`. Document `npm run build`, `node dist/mcp-server.js`, the seven Tool names, and the repository-local Plugin path. Do not document unavailable Claude/CodeBuddy native plugins.

- [ ] **Step 4: Execute final verification**

Run: `npm test && npm run typecheck && npm run build`

Expected: PASS.

Run: `python3 /Users/wangx/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/team-sdd && python3 /Users/wangx/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/team-sdd/skills/team-sdd`

Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts README.md tests/package.test.ts
git commit -m "docs: document Team SDD MCP integration"
```

## Plan Self-Review

- [x] Spec coverage: Tasks 1-4 cover schemas, envelopes, stdio transport, all seven tools, protocol test, validated Plugin and Skill, public export, and documentation.
- [x] Placeholder scan: Every task specifies exact files, tests, commands, red/green expectations, implementation steps, and validators.
- [x] Type consistency: `ToolResult`, service inputs, Agent Context, Tool names, `createMcpServer`, and Plugin MCP configuration match the approved design.
