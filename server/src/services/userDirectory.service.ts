import { listCompanies, listUsers } from "../data/repositories";
import { Role } from "../models/_types";

const formatNamePart = (value: string) =>
  value
    ?.split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ") ?? "";

const buildDisplayName = (firstName: string, lastName: string) =>
  `${formatNamePart(firstName)} ${formatNamePart(lastName)}`.trim();

export type UserDirectoryFilters = {
  role?: Role;
  country?: string;
  city?: string;
  timeZone?: string;
  query?: string;
};

export type UserDirectoryEntry = {
  id: string;
  name: string;
  email: string;
  role: Role;
  title?: string;
  companyId?: string;
  companyName?: string;
  mobileNumber: string;
  country: string;
  city: string;
  timeZone: string;
};

export async function searchUsersDirectory(filters: UserDirectoryFilters): Promise<UserDirectoryEntry[]> {
  const [users, companies] = await Promise.all([listUsers(), listCompanies()]);
  const companyLookup = new Map(companies.map((company) => [company.id, company.name]));
  const normalizedRole = filters.role;
  const normalizedQuery = filters.query?.replace(/\D/g, "") ?? "";
  const normalizedCountry = filters.country?.toLowerCase();
  const normalizedCity = filters.city?.toLowerCase();
  const normalizedTimeZone = filters.timeZone?.toLowerCase();

  return users
    .filter((user) => {
      if (normalizedRole && user.role !== normalizedRole) {
        return false;
      }
      if (normalizedCountry && user.profile.country.toLowerCase() !== normalizedCountry) {
        return false;
      }
      if (normalizedCity && user.profile.city.toLowerCase() !== normalizedCity) {
        return false;
      }
      if (normalizedTimeZone && user.profile.timeZone.toLowerCase() !== normalizedTimeZone) {
        return false;
      }
      if (normalizedQuery) {
        const digits = user.profile.mobileNumber.replace(/\D/g, "");
        if (!digits.includes(normalizedQuery)) {
          return false;
        }
      }
      return true;
    })
    .map((user) => {
      const name = buildDisplayName(user.profile.firstName, user.profile.lastName);
      return {
        id: user.id,
        name,
        email: user.email,
        role: user.role,
        title: user.profile.title || undefined,
        companyId: user.companyId,
        companyName: user.companyId ? companyLookup.get(user.companyId) : undefined,
        mobileNumber: user.profile.mobileNumber,
        country: user.profile.country,
        city: user.profile.city,
        timeZone: user.profile.timeZone
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
