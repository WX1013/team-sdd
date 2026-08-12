# Team SDD Agent integrations

This directory contains repository-owned prompt adapters for the Team SDD MCP server. They do not reimplement Delivery state, Gate rules, metadata writes, or event logging: every governed decision remains with the standard MCP server.

## Build prerequisite

Build this package before loading either adapter so that the canonical repository-local MCP command is available:

```bash
npm run build
node dist/mcp-server.js
```

The adapters configure that stdio server as `node` with the repository-relative `dist/mcp-server.js` entry point.

## Claude Code

[`claude-code`](./claude-code) is a Claude Code plugin source package. It uses the plugin convention of a `.claude-plugin/plugin.json` manifest, a package-local `.mcp.json`, `commands/` for slash-command Markdown files, and `skills/<name>/SKILL.md` for the Team SDD Skill.

After building, load it for the current repository session only:

```bash
claude --plugin-dir ./integrations/claude-code
```

This does not write any user-global Claude Code configuration.

## CodeBuddy

[`codebuddy`](./codebuddy) is a project-level CodeBuddy adapter. Its source follows CodeBuddy's `.codebuddy/commands/` and `.codebuddy/skills/<name>/SKILL.md` directory conventions. Its source `.mcp.json` is the CodeBuddy project-level MCP configuration that becomes the target repository's root `.mcp.json`.

After building, install the source `.codebuddy` directory in the repository that should use it. Configure its root `.mcp.json` with this no-overwrite protocol:

Never replace or use a bare overwrite copy for an existing target `.mcp.json`.

1. If `.mcp.json` does not exist, copy the source configuration from `integrations/codebuddy/.mcp.json` to the target repository root.
2. If `.mcp.json` already exists, preserve every existing `mcpServers` entry. Manually merge only the `team-sdd` definition from [`codebuddy/.mcp.json`](./codebuddy/.mcp.json) into that existing `mcpServers` object.
3. Do not replace the existing `mcpServers` object or any of its entries. Verify that all prior servers and the new `team-sdd` server are present before saving.

The resulting target configuration has existing servers alongside the copied `team-sdd` entry:

```json
{
  "mcpServers": {
    "existing-server": { "command": "existing-command" },
    "team-sdd": {
      "type": "stdio",
      "command": "node",
      "args": ["dist/mcp-server.js"]
    }
  }
}
```

This creates only repository-local configuration; it does not install a global CodeBuddy extension.
