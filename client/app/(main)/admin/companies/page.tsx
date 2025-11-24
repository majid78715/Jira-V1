"use client";

import clsx from "clsx";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "../../../../components/layout/PageShell";
import { Card } from "../../../../components/ui/Card";
import { Input } from "../../../../components/ui/Input";
import { Select } from "../../../../components/ui/Select";
import { Button } from "../../../../components/ui/Button";
import { Table } from "../../../../components/ui/Table";
import { Badge } from "../../../../components/ui/Badge";
import { Modal } from "../../../../components/ui/Modal";
import { apiRequest, ApiError } from "../../../../lib/apiClient";
import { Company, CompanyType, User } from "../../../../lib/types";
import { useCurrentUser } from "../../../../hooks/useCurrentUser";

const companyTypes: CompanyType[] = ["HUMAIN", "VENDOR"];

const createInitialFormState = () => ({
  name: "",
  type: "HUMAIN" as CompanyType,
  description: "",
  isActive: true,
  region: "",
  timeZone: "",
  slaResponseTimeHours: "",
  slaResolutionTimeHours: "",
  slaNotes: "",
  vendorOwnerUserId: "",
  vendorCeoUserId: ""
});

const createContactFormState = () => ({
  firstName: "",
  lastName: "",
  email: "",
  country: "",
  city: "",
  timeZone: "",
  title: "Vendor Contact",
  companyId: ""
});

type StatusMessage = { tone: "success" | "error"; message: string };
type ContactModalTarget = "owner" | "ceo" | null;

type CompanyFormState = ReturnType<typeof createInitialFormState>;
type ContactFormState = ReturnType<typeof createContactFormState>;
type CompanyFormErrors = Partial<Record<"timeZone" | "slaResponseTimeHours" | "slaResolutionTimeHours", string>>;

export default function AdminCompaniesPage() {
  const { user: currentUser, loading: sessionLoading } = useCurrentUser({
    redirectTo: "/login",
    requiredRoles: ["SUPER_ADMIN", "PM"]
  });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState<CompanyFormState>(() => createInitialFormState());
  const [formErrors, setFormErrors] = useState<CompanyFormErrors>({});
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [deletingCompanyId, setDeletingCompanyId] = useState<string | null>(null);
  const [vendorContacts, setVendorContacts] = useState<User[]>([]);
  const [contactModalTarget, setContactModalTarget] = useState<ContactModalTarget>(null);
  const [contactForm, setContactForm] = useState<ContactFormState>(() => createContactFormState());
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const editingCompany = useMemo(
    () => (editingCompanyId ? companies.find((company) => company.id === editingCompanyId) ?? null : null),
    [companies, editingCompanyId]
  );

  const vendorOwner = useMemo(
    () => vendorContacts.find((contact) => contact.id === form.vendorOwnerUserId) ?? null,
    [vendorContacts, form.vendorOwnerUserId]
  );

  const vendorCeo = useMemo(
    () => vendorContacts.find((contact) => contact.id === form.vendorCeoUserId) ?? null,
    [vendorContacts, form.vendorCeoUserId]
  );

  const clearFieldError = useCallback((field: keyof CompanyFormErrors) => {
    setFormErrors((prev) => {
      if (!prev[field]) {
        return prev;
      }
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const resetForm = useCallback(() => {
    setEditingCompanyId(null);
    setForm(createInitialFormState());
    setFormErrors({});
  }, []);

  const syncFormWithCompany = useCallback(
    (company?: Company | null) => {
      if (!company) {
        setForm(createInitialFormState());
        return;
      }
      setForm({
        name: company.name,
        type: company.type,
        description: company.description ?? "",
        isActive: company.isActive,
        region: company.region ?? "",
        timeZone: company.timeZone ?? "",
        slaResponseTimeHours: company.slaConfig?.responseTimeHours?.toString() ?? "",
        slaResolutionTimeHours: company.slaConfig?.resolutionTimeHours?.toString() ?? "",
        slaNotes: company.slaConfig?.notes ?? "",
        vendorOwnerUserId: company.vendorOwnerUserId ?? "",
        vendorCeoUserId: company.vendorCeoUserId ?? ""
      });
    },
    []
  );

  const loadCompanies = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiRequest<{ companies: Company[] }>("/companies");
      setCompanies(response.companies);
      if (editingCompanyId) {
        const target = response.companies.find((company) => company.id === editingCompanyId);
        syncFormWithCompany(target ?? null);
      }
    } catch (error) {
      const apiError = error as ApiError;
      setStatus({ tone: "error", message: apiError?.message ?? "Unable to load companies." });
    } finally {
      setLoading(false);
    }
  }, [editingCompanyId, syncFormWithCompany]);

  const loadVendorContacts = useCallback(async () => {
    try {
      const response = await apiRequest<{ users: User[] }>("/team/project-managers");
      setVendorContacts(response.users);
    } catch (error) {
      console.error("Unable to load vendor contacts", error);
    }
  }, []);

  useEffect(() => {
    if (!currentUser) {
      return;
    }
    void loadCompanies();
    void loadVendorContacts();
  }, [currentUser, loadCompanies, loadVendorContacts]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    const validationErrors = validateCompanyForm(form);
    if (Object.keys(validationErrors).length > 0) {
      setFormErrors(validationErrors);
      return;
    }
    setFormErrors({});
    setSubmitting(true);
    try {
      const payload = buildPayloadFromForm(form);
      if (editingCompanyId) {
        await apiRequest(`/companies/${editingCompanyId}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        setStatus({ tone: "success", message: "Company updated." });
      } else {
        await apiRequest("/companies", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setStatus({ tone: "success", message: "Company created." });
      }
      resetForm();
      await loadCompanies();
    } catch (error) {
      const apiError = error as ApiError;
      setStatus({ tone: "error", message: apiError?.message ?? "Unable to save company." });
    } finally {
      setSubmitting(false);
    }
  };

  const startEditingCompany = (company: Company) => {
    setEditingCompanyId(company.id);
    syncFormWithCompany(company);
  };

  const handleDeleteCompany = async (company: Company) => {
    if (!window.confirm(`Delete ${company.name}?`)) {
      return;
    }
    setDeletingCompanyId(company.id);
    try {
      await apiRequest(`/companies/${company.id}`, { method: "DELETE" });
      setStatus({ tone: "success", message: "Company deleted." });
      if (editingCompanyId === company.id) {
        resetForm();
      }
      await loadCompanies();
    } catch (error) {
      const apiError = error as ApiError;
      setStatus({ tone: "error", message: apiError?.message ?? "Unable to delete company." });
    } finally {
      setDeletingCompanyId(null);
    }
  };

  const openContactModal = (target: ContactModalTarget) => {
    if (!target) {
      return;
    }
    setContactForm({
      ...createContactFormState(),
      title: target === "owner" ? "Vendor Owner" : "Vendor CEO",
      companyId: editingCompany?.id ?? ""
    });
    setContactError(null);
    setContactModalTarget(target);
  };

  const handleInviteContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contactModalTarget) {
      return;
    }
     if (!contactForm.companyId) {
      setContactError("Select a company for this contact.");
      return;
    }
    setContactSubmitting(true);
    setContactError(null);
    try {
      const response = await apiRequest<{ user: User }>("/team/project-managers", {
        method: "POST",
        body: JSON.stringify({
          email: contactForm.email,
          companyId: contactForm.companyId,
          profile: {
            firstName: contactForm.firstName,
            lastName: contactForm.lastName,
            country: contactForm.country,
            city: contactForm.city,
            timeZone: contactForm.timeZone,
            title: contactForm.title || (contactModalTarget === "owner" ? "Vendor Owner" : "Vendor CEO")
          }
        })
      });
      await loadVendorContacts();
      if (contactModalTarget === "owner") {
        setForm((prev) => ({ ...prev, vendorOwnerUserId: response.user.id }));
      } else {
        setForm((prev) => ({ ...prev, vendorCeoUserId: response.user.id }));
      }
      setContactModalTarget(null);
    } catch (error) {
      const apiError = error as ApiError;
      setContactError(apiError?.message ?? "Unable to invite contact.");
    } finally {
      setContactSubmitting(false);
    }
  };

  if (sessionLoading || !currentUser) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Checking access...</div>;
  }

  return (
    <PageShell
      title="Admin · Companies"
      subtitle="Master vendor records"
      currentUser={currentUser}
      userName={`${currentUser.profile.firstName} ${currentUser.profile.lastName}`}
    >
      {status && (
        <div
          className={clsx(
            "mb-4 rounded-lg border px-4 py-3 text-sm",
            status.tone === "success"
              ? "border-brand-200 bg-brand-50 text-brand-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          )}
        >
          {status.message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Organizations" helperText={loading ? "Loading..." : `${companies.length} records`}>
          {loading ? (
            <p className="text-sm text-ink-500">Loading companies...</p>
          ) : (
            <Table>
              <thead className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 text-sm text-ink-700">
                {companies.map((company) => (
                  <tr key={company.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-900">{company.name}</p>
                      <p className="text-xs text-ink-400">{company.description}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={company.type} tone={company.type === "HUMAIN" ? "neutral" : "success"} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={company.isActive ? "Active" : "Inactive"} tone={company.isActive ? "success" : "warning"} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() => startEditingCompany(company)}
                          className={editingCompanyId === company.id ? "text-brand-700" : undefined}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          type="button"
                          className="text-red-600 hover:bg-red-50"
                          disabled={deletingCompanyId === company.id}
                          onClick={() => handleDeleteCompany(company)}
                        >
                          {deletingCompanyId === company.id ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card
          title={editingCompany ? "Edit Company" : "Create Company"}
          helperText={editingCompany ? "Update vendor details" : "HUMAIN or VENDOR"}
        >
          <form className="space-y-4" onSubmit={handleSubmit}>
            {editingCompany && <p className="text-xs text-ink-500">Editing {editingCompany.name}. Save changes or cancel.</p>}
            <div>
              <label className="text-sm font-medium text-ink-700">Name</label>
              <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Type</label>
              <Select value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as CompanyType }))}>
                {companyTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Status</label>
              <Select value={form.isActive ? "active" : "inactive"} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.value === "active" }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Description</label>
              <Input value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Region</label>
              <Input value={form.region} onChange={(e) => setForm((prev) => ({ ...prev, region: e.target.value }))} placeholder="North America" />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Default time zone</label>
              <Input
                value={form.timeZone}
                onChange={(event) => {
                  clearFieldError("timeZone");
                  setForm((prev) => ({ ...prev, timeZone: event.target.value }));
                }}
                placeholder="America/Los_Angeles"
              />
              {formErrors.timeZone ? <p className="text-xs text-red-600">{formErrors.timeZone}</p> : null}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-ink-700">SLA response time (hours)</label>
                <Input
                  type="number"
                  min="0"
                  value={form.slaResponseTimeHours}
                  onChange={(event) => {
                    clearFieldError("slaResponseTimeHours");
                    setForm((prev) => ({ ...prev, slaResponseTimeHours: event.target.value }));
                  }}
                />
                {formErrors.slaResponseTimeHours ? (
                  <p className="text-xs text-red-600">{formErrors.slaResponseTimeHours}</p>
                ) : null}
              </div>
              <div>
                <label className="text-sm font-medium text-ink-700">SLA resolution time (hours)</label>
                <Input
                  type="number"
                  min="0"
                  value={form.slaResolutionTimeHours}
                  onChange={(event) => {
                    clearFieldError("slaResolutionTimeHours");
                    setForm((prev) => ({ ...prev, slaResolutionTimeHours: event.target.value }));
                  }}
                />
                {formErrors.slaResolutionTimeHours ? (
                  <p className="text-xs text-red-600">{formErrors.slaResolutionTimeHours}</p>
                ) : null}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">SLA notes</label>
              <textarea
                className="mt-1 w-full rounded-lg border border-ink-100 px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-brand-300 focus:outline-none"
                rows={3}
                value={form.slaNotes}
                onChange={(e) => setForm((prev) => ({ ...prev, slaNotes: e.target.value }))}
              />
            </div>
            <ContactSelector
              label="Vendor owner"
              selected={vendorOwner}
              value={form.vendorOwnerUserId}
              options={vendorContacts}
              onChange={(value) => setForm((prev) => ({ ...prev, vendorOwnerUserId: value }))}
              onInvite={() => openContactModal("owner")}
              allowInvite={companies.length > 0}
            />
            <ContactSelector
              label="Vendor CEO"
              selected={vendorCeo}
              value={form.vendorCeoUserId}
              options={vendorContacts}
              onChange={(value) => setForm((prev) => ({ ...prev, vendorCeoUserId: value }))}
              onInvite={() => openContactModal("ceo")}
              allowInvite={companies.length > 0}
            />
            <div className="space-y-2 pt-2">
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Saving..." : editingCompany ? "Save changes" : "Create company"}
              </Button>
              {editingCompany && (
                <Button type="button" variant="ghost" className="w-full" onClick={resetForm} disabled={submitting}>
                  Cancel edit
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>

      <Modal
        open={Boolean(contactModalTarget)}
        onClose={() => setContactModalTarget(null)}
        title={contactModalTarget === "owner" ? "Invite vendor owner" : "Invite vendor CEO"}
      >
        <form className="space-y-3" onSubmit={handleInviteContact}>
          <div className="grid gap-3 md:grid-cols-2">
            <InputField label="First name" value={contactForm.firstName} onChange={(value) => setContactForm((prev) => ({ ...prev, firstName: value }))} required />
            <InputField label="Last name" value={contactForm.lastName} onChange={(value) => setContactForm((prev) => ({ ...prev, lastName: value }))} required />
          </div>
          <InputField label="Email" type="email" value={contactForm.email} onChange={(value) => setContactForm((prev) => ({ ...prev, email: value }))} required />
          <div>
            <label className="text-sm font-medium text-ink-700">Assign to company</label>
            <Select
              value={contactForm.companyId}
              onChange={(event) => setContactForm((prev) => ({ ...prev, companyId: event.target.value }))}
              required
            >
              <option value="">Select company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <InputField label="Country" value={contactForm.country} onChange={(value) => setContactForm((prev) => ({ ...prev, country: value }))} required />
            <InputField label="City" value={contactForm.city} onChange={(value) => setContactForm((prev) => ({ ...prev, city: value }))} required />
          </div>
          <InputField label="Time zone" value={contactForm.timeZone} onChange={(value) => setContactForm((prev) => ({ ...prev, timeZone: value }))} required placeholder="America/Chicago" />
          <InputField label="Title" value={contactForm.title} onChange={(value) => setContactForm((prev) => ({ ...prev, title: value }))} required />
          {contactError ? <p className="text-sm text-red-600">{contactError}</p> : null}
          <Button type="submit" className="w-full" disabled={contactSubmitting}>
            {contactSubmitting ? "Inviting..." : "Invite contact"}
          </Button>
        </form>
      </Modal>
    </PageShell>
  );
}

function ContactSelector({
  label,
  selected,
  value,
  options,
  onChange,
  onInvite,
  allowInvite
}: {
  label: string;
  selected: User | null;
  value: string;
  options: User[];
  onChange: (value: string) => void;
  onInvite: () => void;
  allowInvite: boolean;
}) {
  const displayName = selected ? `${selected.profile.firstName} ${selected.profile.lastName}` : "";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-ink-700">{label}</label>
        <Button type="button" variant="ghost" className="text-xs" onClick={onInvite} disabled={!allowInvite}>
          Invite contact
        </Button>
      </div>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Not set</option>
        {options.map((user) => (
          <option key={user.id} value={user.id}>
            {user.profile.firstName} {user.profile.lastName} ({user.email})
          </option>
        ))}
      </Select>
      {displayName ? <p className="text-xs text-ink-500">Selected: {displayName}</p> : null}
    </div>
  );
}

function InputField({ label, value, onChange, required, type = "text", placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-ink-700">{label}</label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} required={required} type={type} placeholder={placeholder} />
    </div>
  );
}

function buildPayloadFromForm(form: CompanyFormState) {
  const payload: Record<string, unknown> = {
    name: form.name,
    type: form.type,
    description: form.description || undefined,
    isActive: form.isActive,
    region: form.region || undefined,
    timeZone: form.timeZone || undefined,
    vendorOwnerUserId: form.vendorOwnerUserId || undefined,
    vendorCeoUserId: form.vendorCeoUserId || undefined
  };

  const responseTimeHoursValue = form.slaResponseTimeHours ? Number.parseFloat(form.slaResponseTimeHours) : undefined;
  const resolutionTimeHoursValue = form.slaResolutionTimeHours ? Number.parseFloat(form.slaResolutionTimeHours) : undefined;
  const hasResponse = typeof responseTimeHoursValue === "number" && !Number.isNaN(responseTimeHoursValue);
  const hasResolution = typeof resolutionTimeHoursValue === "number" && !Number.isNaN(resolutionTimeHoursValue);
  const slaNotes = form.slaNotes.trim();

  if (hasResponse || hasResolution || slaNotes) {
    payload.slaConfig = {
      responseTimeHours: hasResponse ? responseTimeHoursValue : undefined,
      resolutionTimeHours: hasResolution ? resolutionTimeHoursValue : undefined,
      notes: slaNotes || undefined
    };
  }

  return payload;
}

function validateCompanyForm(form: CompanyFormState): CompanyFormErrors {
  const nextErrors: CompanyFormErrors = {};
  if (form.timeZone && !isValidTimeZoneValue(form.timeZone)) {
    nextErrors.timeZone = "Enter a valid IANA time zone (for example, America/Chicago).";
  }
  if (form.slaResponseTimeHours && !isNonNegativeNumber(form.slaResponseTimeHours)) {
    nextErrors.slaResponseTimeHours = "Enter a valid non-negative number.";
  }
  if (form.slaResolutionTimeHours && !isNonNegativeNumber(form.slaResolutionTimeHours)) {
    nextErrors.slaResolutionTimeHours = "Enter a valid non-negative number.";
  }
  return nextErrors;
}

function isValidTimeZoneValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

function isNonNegativeNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0;
}
