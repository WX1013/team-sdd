import { buildAgentContext, type AgentContext } from '../runtime/agent-context.js';
import type { AgentCapabilities } from '../runtime/capabilities.js';
import type { DeliveryId } from '../domain/types.js';
import type { SddService } from './service.js';

export type AgentContextService = {
  getContext(input: { deliveryId: DeliveryId; capabilities: AgentCapabilities }): Promise<AgentContext>;
};

export function createAgentContextService(service: SddService): AgentContextService {
  return {
    async getContext(input): Promise<AgentContext> {
      const [{ delivery }, next] = await Promise.all([
        service.getStatus({ deliveryId: input.deliveryId }),
        service.getNext({ deliveryId: input.deliveryId }),
      ]);
      return buildAgentContext({
        delivery,
        activity: next.activity,
        artifacts: next.requiredArtifacts,
        blockers: next.blockers,
        capabilities: input.capabilities,
      });
    },
  };
}
