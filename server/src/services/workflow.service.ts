import {
  NewWorkflowDefinitionInput,
  UpdateWorkflowDefinitionInput,
  createWorkflowDefinition,
  deleteWorkflowDefinition,
  getWorkflowDefinitionById,
  listWorkflowDefinitions,
  updateWorkflowDefinition
} from "../data/repositories";
import {
  Role,
  WorkflowActionType,
  WorkflowApproverDynamic,
  WorkflowApproverType,
  WorkflowDefinition,
  WorkflowEntityType
} from "../models/_types";

export type WorkflowDefinitionRequest = {
  name: string;
  description?: string;
  isActive?: boolean;
  entityType: WorkflowEntityType;
  steps: Array<{
    id?: string;
    name: string;
    description?: string;
    order?: number;
    approverType: WorkflowApproverType;
    approverRole?: Role;
    dynamicApproverType?: WorkflowApproverDynamic;
    requiresCommentOnReject?: boolean;
    requiresCommentOnSendBack?: boolean;
    actions?: WorkflowActionType[];
  }>;
};

const supportedEntityTypes: WorkflowEntityType[] = ["TASK"];

function ensureEntityType(entityType: WorkflowEntityType) {
  if (!supportedEntityTypes.includes(entityType)) {
    throw new Error("Unsupported workflow entity type.");
  }
}

export async function listDefinitions(entityType: WorkflowEntityType): Promise<WorkflowDefinition[]> {
  ensureEntityType(entityType);
  return listWorkflowDefinitions(entityType);
}

export async function createDefinition(payload: WorkflowDefinitionRequest): Promise<WorkflowDefinition> {
  ensureEntityType(payload.entityType);
  if (!payload.steps?.length) {
    throw new Error("At least one step is required.");
  }
  const input: NewWorkflowDefinitionInput = {
    entityType: payload.entityType,
    name: payload.name,
    description: payload.description,
    isActive: payload.isActive,
    steps: payload.steps.map((step) => ({
      ...step,
      requiresCommentOnReject: step.requiresCommentOnReject ?? false,
      requiresCommentOnSendBack: step.requiresCommentOnSendBack ?? false
    }))
  };
  return createWorkflowDefinition(input);
}

export async function updateDefinition(
  id: string,
  payload: Partial<WorkflowDefinitionRequest>
): Promise<WorkflowDefinition> {
  const existing = await getWorkflowDefinitionById(id);
  if (!existing) {
    throw new Error("Workflow definition not found.");
  }
  const entityType = payload.entityType ?? existing.entityType;
  ensureEntityType(entityType);
  const updatePayload: UpdateWorkflowDefinitionInput = {
    name: payload.name,
    description: payload.description,
    isActive: payload.isActive,
    steps: payload.steps?.map((step) => ({
      ...step,
      requiresCommentOnReject: step.requiresCommentOnReject ?? false,
      requiresCommentOnSendBack: step.requiresCommentOnSendBack ?? false
    }))
  };
  return updateWorkflowDefinition(id, updatePayload);
}

export async function removeDefinition(id: string): Promise<void> {
  await deleteWorkflowDefinition(id);
}
