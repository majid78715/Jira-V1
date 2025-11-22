import countries, { LocaleData } from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import { z } from "zod";
import { CompanyType, Profile } from "../models/_types";

countries.registerLocale(enLocale as LocaleData);

const E164_REGEX = /^\+[1-9]\d{1,14}$/;
const COUNTRY_CODES = new Set(Object.keys(countries.getAlpha2Codes()).map((code) => code.toUpperCase()));
const CITY_MAX = 64;
const TITLE_MAX = 64;
const COMPANY_TYPES: CompanyType[] = ["HUMAIN", "VENDOR"];

export const timeZoneSchema = z
  .string({ message: "timeZone is required." })
  .trim()
  .min(1, "timeZone is required.")
  .refine((value) => {
    try {
      Intl.DateTimeFormat("en-US", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "timeZone must be a valid IANA time zone.");

const countrySchema = z
  .string({ message: "country is required." })
  .trim()
  .min(2, "country is required.")
  .transform((value) => normalizeCountry(value));

export const profileSchema = z
  .object({
    firstName: z.string({ message: "firstName is required." }).trim().min(1).max(64),
    lastName: z.string({ message: "lastName is required." }).trim().min(1).max(64),
    mobileNumber: z
      .string({ message: "mobileNumber is required." })
      .trim()
      .regex(E164_REGEX, "mobileNumber must follow E.164 format."),
    country: countrySchema,
    city: z.string({ message: "city is required." }).trim().min(1).max(CITY_MAX),
    timeZone: timeZoneSchema,
    title: z.string({ message: "title is required." }).trim().min(1).max(TITLE_MAX)
  })
  .strict();

const companySchema = z.object({
  name: z.string({ message: "name is required." }).trim().min(2, "Company name must be at least 2 characters."),
  type: z.enum(COMPANY_TYPES, { message: "type is required." }),
  description: z
    .string()
    .trim()
    .max(512, "description must be 512 characters or less.")
    .optional(),
  isActive: z.boolean().optional(),
  ceoUserId: z.string().trim().min(1).optional(),
  vendorOwnerUserId: z.string().trim().min(1).optional(),
  vendorCeoUserId: z.string().trim().min(1).optional(),
  region: z.string().trim().max(128).optional(),
  timeZone: timeZoneSchema.optional(),
  slaConfig: z
    .object({
      responseTimeHours: z.number().nonnegative().optional(),
      resolutionTimeHours: z.number().nonnegative().optional(),
      notes: z.string().trim().max(512).optional()
    })
    .optional()
});

export function normalizeCountry(country: string): string {
  const trimmed = country.trim();
  const upper = trimmed.toUpperCase();
  if (COUNTRY_CODES.has(upper)) {
    return upper;
  }
  const alpha2 = countries.getAlpha2Code(trimmed, "en");
  if (alpha2) {
    return alpha2.toUpperCase();
  }
  throw new Error("country must be ISO-2 code or canonical country name.");
}

export function validateProfile(profile: Profile) {
  const parsed = profileSchema.parse(profile) as Profile;
  Object.assign(profile, parsed);
}

export function validateCompany(
  input: Partial<{
    name: string;
    type: CompanyType;
    description?: string;
    isActive?: boolean;
    ceoUserId?: string;
    vendorOwnerUserId?: string;
    vendorCeoUserId?: string;
    region?: string;
    timeZone?: string;
    slaConfig?: {
      responseTimeHours?: number;
      resolutionTimeHours?: number;
      notes?: string;
    };
  }>,
  partial = false
) {
  const schema = partial ? companySchema.partial() : companySchema;
  const parsed = schema.parse(input);
  Object.assign(input, parsed);
}
