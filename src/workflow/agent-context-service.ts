import { buildAgentContext, type AgentContext } from '../runtime/agent-context.js';
import { defaultProjectConfig } from '../config/project-config.js';
import { DomainError } from '../domain/errors.js';
import type { AgentCapabilities } from '../runtime/capabilities.js';
import type { DeliveryId } from '../domain/types.js';
import type { SddService } from './service.js';

export type AgentContextService = {
  getContext(input: { deliveryId: DeliveryId; capabilities: AgentCapabilities }): Promise<AgentContext>;
};

export function createAgentContextService(service: SddService): AgentContextService {
  return {
    async getContext(input): Promise<AgentContext> {
      const [{ delivery }, next, config] = await Promise.all([
        service.getStatus({ deliveryId: input.deliveryId }),
        service.getNext({ deliveryId: input.deliveryId }),
        service.getConfig().catch((error: unknown) => {
          if (error instanceof DomainError && error.code === 'INVALID_PROJECT_CONFIG' && error.message.includes('ENOENT')) {
            return defaultProjectConfig;
          }
          throw error;
        }),
      ]);
      return buildAgentContext({
        delivery,
        activity: next.activity,
        artifacts: next.requiredArtifacts,
        blockers: next.blockers,
        capabilities: input.capabilities,
        strategy: config.execution.strategy,
        logicalSkillOverrides: config.logicalSkills,
      });
    },
  };
}
