import {
  UpdateUserInput,
  getCompanyById,
  getUserById,
  listUserInvitations,
  listUsersByRole,
  recordActivity,
  updateUser
} from "../data/repositories";
import { Profile, PublicInvitation, PublicUser } from "../models/_types";

type UpdateProductManagerInput = {
  email?: string;
  companyId?: string;
  profile?: Partial<Profile>;
  isActive?: boolean;
  vpUserId?: string;
  preferredCompanyIds?: string[];
};

export async function listProductManagerRoster(): Promise<{ users: PublicUser[]; invitations: PublicInvitation[] }> {
  const [users, invitations] = await Promise.all([listUsersByRole("PM"), listUserInvitations({ role: "PM" })]);
  return { users, invitations };
}

export async function updateProductManagerRecord(
  actorId: string,
  userId: string,
  payload: UpdateProductManagerInput
): Promise<PublicUser> {
  const user = await getUserById(userId);
  if (!user || user.role !== "PM") {
    throw new Error("Product manager not found.");
  }

  let nextProfile: Profile | undefined;
  if (hasProfileChanges(payload.profile)) {
    const updates = Object.entries(payload.profile).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, string>);
    nextProfile = { ...user.profile, ...updates };
  }

  if (payload.companyId) {
    const company = await getCompanyById(payload.companyId);
    if (!company) {
      throw new Error("Company not found.");
    }
  }

  if (payload.vpUserId) {
    const vp = await getUserById(payload.vpUserId);
    if (!vp || vp.role !== "VP") {
      throw new Error("Assigned VP not found.");
    }
  }

  let preferredCompanyIds: string[] | undefined;
  if (payload.preferredCompanyIds !== undefined) {
    preferredCompanyIds = await resolvePreferredCompanyIds(payload.preferredCompanyIds);
  }

  const normalizedEmail = payload.email?.trim().toLowerCase();
  const updatePayload: UpdateUserInput = {};

  if (normalizedEmail) {
    updatePayload.email = normalizedEmail;
  }
  if (payload.companyId) {
    updatePayload.companyId = payload.companyId;
  }
  if (nextProfile) {
    updatePayload.profile = nextProfile;
  }
  if (payload.isActive !== undefined) {
    updatePayload.isActive = payload.isActive;
  }
  if (payload.vpUserId) {
    updatePayload.vpUserId = payload.vpUserId;
  }
  if (preferredCompanyIds !== undefined) {
    const basePrefs = user.preferences ?? { savedDashboardViews: [] };
    updatePayload.preferences = {
      savedDashboardViews: basePrefs.savedDashboardViews ?? [],
      managedVendorIds: basePrefs.managedVendorIds,
      preferredCompanyIds
    };
  }

  const updated = await updateUser(userId, updatePayload);

  await recordActivity(
    actorId,
    "PM_UPDATED",
    `Updated product manager ${updated.profile.firstName} ${updated.profile.lastName}`,
    { userId: updated.id }
  );

  return updated;
}

export async function deactivateProductManager(actorId: string, userId: string): Promise<void> {
  const user = await getUserById(userId);
  if (!user || user.role !== "PM") {
    throw new Error("Product manager not found.");
  }

  if (!user.isActive) {
    return;
  }

  await updateUser(userId, { isActive: false });
  await recordActivity(actorId, "PM_DEACTIVATED", `Deactivated product manager ${user.email}`, {
    userId: user.id
  });
}

function hasProfileChanges(profile?: Partial<Profile>): profile is Partial<Profile> {
  if (!profile) {
    return false;
  }
  return Object.keys(profile).length > 0;
}

async function resolvePreferredCompanyIds(ids: string[]): Promise<string[]> {
  const normalized = Array.from(new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)));
  await Promise.all(
    normalized.map(async (companyId) => {
      const company = await getCompanyById(companyId);
      if (!company) {
        throw new Error("Preferred company not found.");
      }
    })
  );
  return normalized;
}
