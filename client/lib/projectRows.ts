import { Project } from "./types";

export interface ProjectRow extends Record<string, unknown> {
  id: string;
  code?: string;
  name: string;
  status?: Project["status"];
  health?: Project["health"];
  ownerName?: string;
  primaryVendorName?: string;
  vendorCount?: number | null;
  plannedStartDate?: string | Date | null;
  plannedEndDate?: string | Date | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  budgetHours?: number | null;
  hoursLogged?: number | null;
  overdueTasksCount?: number | null;
  riskLevel?: Project["riskLevel"] | null;
}
