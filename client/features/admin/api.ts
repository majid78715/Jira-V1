import { apiRequest } from "../../lib/apiClient";
import { RoleDefinition } from "../../lib/types";

export async function fetchRoles() {
  const response = await apiRequest<{ roles: RoleDefinition[] }>("/admin/roles");
  return response.roles;
}
