import {
  createCompany,
  listCompanies,
  updateCompany,
  deleteCompany,
  NewCompanyInput,
  UpdateCompanyInput,
  getUserById
} from "../data/repositories";
import { PublicCompany, Role } from "../models/_types";

export function listCompanyRecords(): Promise<PublicCompany[]> {
  return listCompanies();
}

export async function createCompanyRecord(actorRole: Role, input: NewCompanyInput): Promise<PublicCompany> {
  enforceVendorLinkPrivileges(actorRole, input);
  await validateLinkedUsers(input);
  return createCompany(input);
}

export async function updateCompanyRecord(
  actorRole: Role,
  id: string,
  input: UpdateCompanyInput
): Promise<PublicCompany> {
  enforceVendorLinkPrivileges(actorRole, input);
  await validateLinkedUsers(input);
  return updateCompany(id, input);
}

export function deleteCompanyRecord(id: string): Promise<void> {
  return deleteCompany(id);
}

async function validateLinkedUsers(input: {
  ceoUserId?: string;
  vendorOwnerUserId?: string;
  vendorCeoUserId?: string;
}) {
  await Promise.all([
    assertUserExists(input.ceoUserId, "CEO"),
    assertUserExists(input.vendorOwnerUserId, "Vendor owner", ["PROJECT_MANAGER"]),
    assertUserExists(input.vendorCeoUserId, "Vendor CEO", ["PROJECT_MANAGER"])
  ]);
}

async function assertUserExists(userId: string | undefined, label: string, allowedRoles?: string[]) {
  if (!userId) {
    return;
  }
  const user = await getUserById(userId);
  if (!user) {
    throw new Error(`${label} reference is invalid.`);
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw new Error(`${label} must be ${allowedRoles.join(" or ")}`);
  }
}

function enforceVendorLinkPrivileges(
  actorRole: Role,
  input: { vendorOwnerUserId?: string; vendorCeoUserId?: string }
) {
  const needsPrivilege = Boolean(input.vendorOwnerUserId || input.vendorCeoUserId);
  if (!needsPrivilege) {
    return;
  }
  if (actorRole !== "SUPER_ADMIN") {
    throw new Error("Only system administrators can assign vendor contacts.");
  }
}
