import { apiRequest } from "../../lib/apiClient";
import {
  Role,
  WorkflowApproverDynamic,
  WorkflowDefinition,
  WorkflowEntityType,
  WorkflowStepDefinition
} from "../../lib/types";

export type CreateWorkflowDefinitionPayload = {
  name: string;
  entityType: WorkflowEntityType;
  steps: Array<{
    name: string;
    order: number;
    approverType: WorkflowStepDefinition["approverType"];
    approverRole?: Role;
    dynamicApproverType?: WorkflowApproverDynamic;
    requiresCommentOnReject: boolean;
    requiresCommentOnSendBack: boolean;
  }>;
};

export async function fetchWorkflowDefinitions(entityType: WorkflowEntityType = "TASK") {
  const response = await apiRequest<{ definitions: WorkflowDefinition[] }>(
    `/workflows/definitions?entityType=${entityType}`
  );
  return response.definitions;
}

export async function createWorkflowDefinition(payload: CreateWorkflowDefinitionPayload) {
  const response = await apiRequest<{ definition: WorkflowDefinition }>("/workflows/definitions", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.definition;
}
