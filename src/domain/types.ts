export type DeliveryId = `DLV-${string}`;
export type SpecId = `SP-${string}`;

export type DeliveryType = 'APPLICATION_INIT' | 'FEATURE_CHANGE';
export const designImpacts = [
  'architecture_change', 'database_schema_change', 'public_api_change', 'external_integration_change',
  'security_change', 'permission_change', 'deployment_change', 'cross_module_change', 'data_migration',
] as const;
export type DesignImpact = (typeof designImpacts)[number];
export type DesignRecommendation = 'RECOMMENDED' | 'NOT_RECOMMENDED';
export type DesignDecision = {
  required: boolean;
  reason: string;
  recommendation: DesignRecommendation;
  impacts: readonly DesignImpact[];
};
export type DeliveryState =
  | 'REQUIREMENT'
  | 'DESIGN'
  | 'SPEC'
  | 'EXECUTION'
  | 'CHECK'
  | 'DONE';
export type SpecState = 'READY' | 'PLAN' | 'CODE' | 'CHECK' | 'DONE';

export type ApprovalArtifact = 'requirement' | 'design' | 'spec';

export type Approval = {
  artifact: ApprovalArtifact;
  hash: `sha256:${string}`;
  actorType: 'human';
  approvedBy: string;
  approvedAt: string;
};

export type SpecSummary = {
  id: SpecId;
  title: string;
  state: SpecState;
  dependencies: SpecId[];
  acceptanceCriteria: string[];
};

export type DeliveryMetadata = {
  id: DeliveryId;
  title: string;
  type: DeliveryType;
  state: DeliveryState;
  design?: { required: boolean; reason: string };
  approvals: Partial<Record<ApprovalArtifact, Approval>>;
  specs: SpecSummary[];
};

export type WorkflowEvent = {
  type: string;
  deliveryId: DeliveryId;
  occurredAt: string;
  previousState?: DeliveryState | SpecState;
  nextState?: DeliveryState | SpecState;
  metadata?: Record<string, unknown>;
};

export function parseDeliveryId(input: string): DeliveryId {
  if (!/^DLV-[A-Za-z0-9][A-Za-z0-9_-]*$/.test(input)) {
    throw new Error(`Invalid Delivery ID: ${input}`);
  }

  return input as DeliveryId;
}

export function parseSpecId(input: string): SpecId {
  if (!/^SP-[A-Za-z0-9][A-Za-z0-9_-]*$/.test(input)) {
    throw new Error(`Invalid Spec Pack ID: ${input}`);
  }

  return input as SpecId;
}
