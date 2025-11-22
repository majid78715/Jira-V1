"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import {
  Company,
  Project,
  ProjectHealth,
  ProjectPriority,
  ProjectRateModel,
  ProjectRiskLevel,
  ProjectStage,
  ProjectStatus,
  ProjectType,
  User,
  UserDirectoryEntry,
  WorkflowScheme
} from "../../lib/types";
import { apiRequest } from "../../lib/apiClient";

const PROJECT_TYPES: ProjectType[] = ["PRODUCT_FEATURE", "PLATFORM_UPGRADE", "VENDOR_ENGAGEMENT", "EXPERIMENT"];
const PRIORITIES: ProjectPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const STAGES: ProjectStage[] = ["IDEA", "DISCOVERY", "PLANNING", "EXECUTION", "CLOSURE"];
const STATUSES: ProjectStatus[] = ["PROPOSED", "IN_PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"];
const HEALTHS: ProjectHealth[] = ["GREEN", "AMBER", "RED"];
const RISKS: ProjectRiskLevel[] = ["LOW", "MEDIUM", "HIGH"];
const RATE_MODELS: ProjectRateModel[] = ["TIME_AND_MATERIAL", "FIXED_FEE", "MILESTONE_BASED"];
const COMPLIANCE_FLAGS = ["PII", "Financial", "Production Data"];

interface ProjectFormDrawerProps {
  open: boolean;
  mode: "create" | "edit";
  project?: Project;
  onClose: () => void;
  onSaved?: (project: Project) => void;
  vendors: Company[];
  currentUser: User;
}

type FormState = {
  name: string;
  code: string;
  description: string;
  budgetHours: string;
  estimatedEffortHours: string;
  ownerId: string;
  projectType: ProjectType;
  objectiveOrOkrId: string;
  priority: ProjectPriority;
  stage: ProjectStage;
  sponsorUserId: string;
  deliveryManagerUserId: string;
  stakeholderUserIds: string[];
  primaryVendorId: string;
  additionalVendorIds: string[];
  startDate: string;
  endDate: string;
  actualStartDate: string;
  actualEndDate: string;
  status: ProjectStatus;
  health: ProjectHealth;
  riskLevel: ProjectRiskLevel;
  riskSummary: string;
  complianceFlags: string[];
  businessUnit: string;
  productModule: string;
  tagsText: string;
  approvedBudgetAmount: string;
  approvedBudgetCurrency: string;
  timeTrackingRequired: boolean;
  contractId: string;
  rateModel: ProjectRateModel;
  rateCardReference: string;
  workflowSchemeId: string;
};

type MultiSelectOption = { value: string; label: string };

export function ProjectFormDrawer({
  open,
  mode,
  project,
  onClose,
  onSaved,
  vendors,
  currentUser
}: ProjectFormDrawerProps) {
  const [directory, setDirectory] = useState<UserDirectoryEntry[]>([]);
  const [schemes, setSchemes] = useState<WorkflowScheme[]>([]);
  const [form, setForm] = useState<FormState>(() => buildInitialState(project, currentUser));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setForm(buildInitialState(project, currentUser));
    setError(null);
    void fetchDirectory();
    void fetchSchemes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id]);

  async function fetchDirectory() {
    try {
      const response = await apiRequest<{ users: UserDirectoryEntry[] }>("/users");
      setDirectory(response.users ?? []);
    } catch {
      setDirectory([]);
    }
  }

  async function fetchSchemes() {
    try {
      const response = await apiRequest<WorkflowScheme[]>("/workflow-schemes");
      let schemesData: WorkflowScheme[] = [];
      if (Array.isArray(response)) {
        schemesData = response;
      } else if (response && "workflowSchemes" in (response as any)) {
        schemesData = (response as any).workflowSchemes;
      }
      setSchemes(schemesData);
      
      // If creating a new project and no scheme is selected, select the default or first one
      if (mode === "create" && !project && schemesData.length > 0) {
        const defaultScheme = schemesData.find(s => 
          s.name.toLowerCase().includes("default") || 
          s.name.toLowerCase().includes("standard") ||
          s.name.toLowerCase().includes("original")
        ) || schemesData[0];

        setForm(prev => {
          if (!prev.workflowSchemeId) {
            return { ...prev, workflowSchemeId: defaultScheme.id };
          }
          return prev;
        });
      }
    } catch {
      setSchemes([]);
    }
  }

  const peopleOptions = useMemo<MultiSelectOption[]>(() => directory.map(toOptionFromDirectory), [directory]);

  const ownerOptions = useMemo<MultiSelectOption[]>(() => {
    const pmEntries = directory.filter((entry) => entry.role === "PM").map(toOptionFromDirectory);
    const current = toOptionFromUser(currentUser);
    const combined = current ? [current, ...pmEntries] : pmEntries;
    const unique = new Map<string, MultiSelectOption>();
    combined.forEach((option) => {
      if (!unique.has(option.value)) {
        unique.set(option.value, option);
      }
    });
    return Array.from(unique.values());
  }, [currentUser, directory]);

  const sponsorOptions = peopleOptions;
  const deliveryOptions = peopleOptions;
  const vendorOptions: MultiSelectOption[] = useMemo(
    () => vendors.map((vendor) => ({ value: vendor.id, label: vendor.name })),
    [vendors]
  );
  const complianceOptions: MultiSelectOption[] = useMemo(
    () => COMPLIANCE_FLAGS.map((flag) => ({ value: flag, label: flag })),
    []
  );

  if (!open) {
    return null;
  }

  const handleChange = (field: keyof FormState, value: string | boolean | string[]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = transformFormToPayload(form);
      const response = project
        ? await apiRequest<{ project: Project }>(`/projects/${project.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          })
        : await apiRequest<{ project: Project }>("/projects", {
            method: "POST",
            body: JSON.stringify(payload)
          });
      onSaved?.(response.project);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save project.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-ink-900/30 px-4 py-8" role="dialog" aria-modal>
      <div
        className="absolute inset-0"
        onClick={() => {
          if (!saving) {
            onClose();
          }
        }}
      />
      <div
        className="relative z-10 flex h-full w-full max-w-3xl flex-col rounded-3xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-ink-100 px-8 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              {mode === "create" ? "Create Project" : "Update Project"}
            </p>
            <h2 className="text-2xl font-semibold text-ink-900">
              {mode === "create" ? "New portfolio initiative" : project?.name}
            </h2>
          </div>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Close
          </Button>
        </header>

        <form className="flex-1 overflow-y-auto px-8 py-6" onSubmit={handleSubmit}>
          {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

          <Section title="Basic Information" helper="Capture scope, priority, and baseline hours.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="Project Name" required>
                <Input value={form.name} onChange={(e) => handleChange("name", e.target.value)} required />
              </FormField>
              <FormField label="Project Code" required>
                <Input value={form.code} onChange={(e) => handleChange("code", e.target.value)} required />
              </FormField>
              <FormField label="Project Type" required>
                <Select value={form.projectType} onChange={(e) => handleChange("projectType", e.target.value)} required>
                  {PROJECT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {humanize(type)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Priority" required>
                <Select value={form.priority} onChange={(e) => handleChange("priority", e.target.value)} required>
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {humanize(priority)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Stage" required>
                <Select value={form.stage} onChange={(e) => handleChange("stage", e.target.value)} required>
                  {STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {humanize(stage)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Status" required>
                <Select value={form.status} onChange={(e) => handleChange("status", e.target.value)} required>
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {humanize(status)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Budget (hours)" required>
                <Input
                  type="number"
                  min="1"
                  value={form.budgetHours}
                  onChange={(e) => handleChange("budgetHours", e.target.value)}
                  required
                />
              </FormField>
              <FormField label="Estimated Effort (hours)">
                <Input
                  type="number"
                  min="1"
                  value={form.estimatedEffortHours}
                  onChange={(e) => handleChange("estimatedEffortHours", e.target.value)}
                />
              </FormField>
            </div>
            <FormField label="Description / Scope Summary" required>
              <textarea
                className="w-full rounded-lg border border-ink-100 px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-accent-turquoise focus:outline-none focus:ring-2 focus:ring-brand-200"
                rows={3}
                value={form.description}
                onChange={(e) => handleChange("description", e.target.value)}
                required
              />
            </FormField>
            <FormField label="Business Objective / OKR Link">
              <Input value={form.objectiveOrOkrId} onChange={(e) => handleChange("objectiveOrOkrId", e.target.value)} />
            </FormField>
          </Section>

          <Section title="Ownership & Team" helper="Assign accountable leaders and key collaborators.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="Product Manager (Owner)" required>
                <Select value={form.ownerId} onChange={(e) => handleChange("ownerId", e.target.value)} required>
                  {!form.ownerId && (
                    <option value="" disabled>
                      Select a Product Manager
                    </option>
                  )}
                  {ownerOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Sponsor / Business Owner" required>
                <Select
                  value={form.sponsorUserId}
                  onChange={(e) => handleChange("sponsorUserId", e.target.value)}
                  required
                >
                  {!form.sponsorUserId && (
                    <option value="" disabled>
                      Select sponsor
                    </option>
                  )}
                  {sponsorOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Project Manager (Vendor)">
                <Select value={form.deliveryManagerUserId} onChange={(e) => handleChange("deliveryManagerUserId", e.target.value)}>
                  <option value="">Select project manager</option>
                  {deliveryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Stakeholders / Watchers">
                <MultiSelect
                  options={peopleOptions}
                  value={form.stakeholderUserIds}
                  placeholder="Select stakeholders"
                  onChange={(ids) => handleChange("stakeholderUserIds", ids)}
                />
              </FormField>
            </div>
          </Section>

          <Section title="Schedule & Budget" helper="Planned vs. actual timeline and cost controls.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="Planned Start Date">
                <Input type="date" value={form.startDate} onChange={(e) => handleChange("startDate", e.target.value)} />
              </FormField>
              <FormField label="Planned End Date">
                <Input type="date" value={form.endDate} onChange={(e) => handleChange("endDate", e.target.value)} />
              </FormField>
              <FormField label="Actual Start Date">
                <Input
                  type="date"
                  value={form.actualStartDate}
                  onChange={(e) => handleChange("actualStartDate", e.target.value)}
                />
              </FormField>
              <FormField label="Actual End Date">
                <Input
                  type="date"
                  value={form.actualEndDate}
                  onChange={(e) => handleChange("actualEndDate", e.target.value)}
                />
              </FormField>
              <FormField label="Approved Budget (Cost)">
                <Input
                  type="number"
                  min="0"
                  value={form.approvedBudgetAmount}
                  onChange={(e) => handleChange("approvedBudgetAmount", e.target.value)}
                />
              </FormField>
              <FormField label="Budget Currency">
                <Input
                  value={form.approvedBudgetCurrency}
                  onChange={(e) => handleChange("approvedBudgetCurrency", e.target.value)}
                />
              </FormField>
              <FormField label="Time Tracking Required" required>
                <Select
                  value={form.timeTrackingRequired ? "YES" : "NO"}
                  onChange={(e) => handleChange("timeTrackingRequired", e.target.value === "YES")}
                >
                  <option value="YES">Yes</option>
                  <option value="NO">No</option>
                </Select>
              </FormField>
            </div>
          </Section>

          <Section title="Vendors & Contracts" helper="Link primary partners and commercial terms.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="Primary Vendor">
                <Select value={form.primaryVendorId} onChange={(e) => handleChange("primaryVendorId", e.target.value)}>
                  <option value="">Unassigned</option>
                  {vendorOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Additional Vendors">
                <MultiSelect
                  options={vendorOptions}
                  value={form.additionalVendorIds}
                  placeholder="Select vendors"
                  onChange={(ids) => handleChange("additionalVendorIds", ids)}
                />
              </FormField>
              <FormField label="Contract / SOW ID">
                <Input value={form.contractId} onChange={(e) => handleChange("contractId", e.target.value)} />
              </FormField>
              <FormField label="Rate Model" required>
                <Select value={form.rateModel} onChange={(e) => handleChange("rateModel", e.target.value)} required>
                  {RATE_MODELS.map((model) => (
                    <option key={model} value={model}>
                      {humanize(model)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Rate Card Reference / Link">
                <Input value={form.rateCardReference} onChange={(e) => handleChange("rateCardReference", e.target.value)} />
              </FormField>
            </div>
          </Section>

          <Section title="Governance, Risk & Metadata" helper="Status, compliance flags, and classification.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="Health" required>
                <Select value={form.health} onChange={(e) => handleChange("health", e.target.value)} required>
                  {HEALTHS.map((health) => (
                    <option key={health} value={health}>
                      {humanize(health)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Risk Level" required>
                <Select value={form.riskLevel} onChange={(e) => handleChange("riskLevel", e.target.value)} required>
                  {RISKS.map((risk) => (
                    <option key={risk} value={risk}>
                      {humanize(risk)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Risk Summary">
                <textarea
                  className="w-full rounded-lg border border-ink-100 px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-accent-turquoise focus:outline-none focus:ring-2 focus:ring-brand-200"
                  rows={3}
                  value={form.riskSummary}
                  onChange={(e) => handleChange("riskSummary", e.target.value)}
                />
              </FormField>
              <FormField label="Compliance / Regulatory Flags">
                <MultiSelect
                  options={complianceOptions}
                  value={form.complianceFlags}
                  placeholder="Select flags"
                  onChange={(ids) => handleChange("complianceFlags", ids)}
                />
              </FormField>
              <FormField label="Business Unit" required>
                <Input
                  value={form.businessUnit}
                  onChange={(e) => handleChange("businessUnit", e.target.value)}
                  required
                />
              </FormField>
              <FormField label="Product / Module" required>
                <Input
                  value={form.productModule}
                  onChange={(e) => handleChange("productModule", e.target.value)}
                  required
                />
              </FormField>
              <FormField label="Tags / Labels">
                <Input
                  placeholder="Comma separated e.g. AI, Backend"
                  value={form.tagsText}
                  onChange={(e) => handleChange("tagsText", e.target.value)}
                />
              </FormField>
            </div>
          </Section>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-ink-100 pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : mode === "create" ? "Create Project" : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function buildInitialState(project: Project | undefined, currentUser: User): FormState {
  return {
    name: project?.name ?? "",
    code: project?.code ?? "",
    description: project?.description ?? "",
    budgetHours: project ? String(project.budgetHours) : "",
    estimatedEffortHours: project?.estimatedEffortHours ? String(project.estimatedEffortHours) : "",
    ownerId: project?.ownerId ?? currentUser.id,
    projectType: project?.projectType ?? "PRODUCT_FEATURE",
    objectiveOrOkrId: project?.objectiveOrOkrId ?? "",
    priority: project?.priority ?? "HIGH",
    stage: project?.stage ?? "PLANNING",
    sponsorUserId: project?.sponsorUserId ?? "",
    deliveryManagerUserId: project?.deliveryManagerUserId ?? "",
    stakeholderUserIds: project?.stakeholderUserIds ?? [],
    primaryVendorId: project?.primaryVendorId ?? "",
    additionalVendorIds: project?.additionalVendorIds ?? [],
    startDate: project?.startDate ?? "",
    endDate: project?.endDate ?? "",
    actualStartDate: project?.actualStartDate ?? "",
    actualEndDate: project?.actualEndDate ?? "",
    status: project?.status ?? "PROPOSED",
    health: project?.health ?? "GREEN",
    riskLevel: project?.riskLevel ?? "LOW",
    riskSummary: project?.riskSummary ?? "",
    complianceFlags: project?.complianceFlags ?? [],
    businessUnit: project?.businessUnit ?? "",
    productModule: project?.productModule ?? "",
    tagsText: project?.tags?.join(", ") ?? "",
    approvedBudgetAmount: project?.approvedBudgetAmount ? String(project.approvedBudgetAmount) : "",
    approvedBudgetCurrency: project?.approvedBudgetCurrency ?? "USD",
    timeTrackingRequired: project?.timeTrackingRequired ?? true,
    contractId: project?.contractId ?? "",
    rateModel: project?.rateModel ?? "TIME_AND_MATERIAL",
    rateCardReference: project?.rateCardReference ?? "",
    workflowSchemeId: project?.workflowSchemeId ?? ""
  };
}

function transformFormToPayload(form: FormState) {
  const tags = form.tagsText
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const additionalVendorIds = Array.from(new Set(form.additionalVendorIds.filter(Boolean)));
  const vendorCompanyIds = Array.from(
    new Set([...(form.primaryVendorId ? [form.primaryVendorId] : []), ...additionalVendorIds])
  );
  return {
    name: form.name.trim(),
    code: form.code.trim(),
    description: form.description.trim(),
    budgetHours: Number(form.budgetHours),
    estimatedEffortHours: form.estimatedEffortHours ? Number(form.estimatedEffortHours) : undefined,
    ownerId: form.ownerId,
    projectType: form.projectType,
    objectiveOrOkrId: form.objectiveOrOkrId.trim() || undefined,
    priority: form.priority,
    stage: form.stage,
    sponsorUserId: form.sponsorUserId,
    deliveryManagerUserId: form.deliveryManagerUserId || undefined,
    stakeholderUserIds: form.stakeholderUserIds,
    vendorCompanyIds,
    primaryVendorId: form.primaryVendorId || undefined,
    additionalVendorIds,
    startDate: form.startDate || undefined,
    endDate: form.endDate || undefined,
    actualStartDate: form.actualStartDate || undefined,
    actualEndDate: form.actualEndDate || undefined,
    status: form.status,
    health: form.health,
    riskLevel: form.riskLevel,
    riskSummary: form.riskSummary.trim() || undefined,
    complianceFlags: form.complianceFlags,
    businessUnit: form.businessUnit.trim(),
    productModule: form.productModule.trim(),
    tags,
    approvedBudgetAmount: form.approvedBudgetAmount ? Number(form.approvedBudgetAmount) : undefined,
    approvedBudgetCurrency: form.approvedBudgetCurrency.trim() || undefined,
    timeTrackingRequired: form.timeTrackingRequired,
    contractId: form.contractId.trim() || undefined,
    rateModel: form.rateModel,
    rateCardReference: form.rateCardReference.trim() || undefined,
    workflowSchemeId: form.workflowSchemeId || undefined
  };
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toOptionFromDirectory(entry: UserDirectoryEntry): MultiSelectOption {
  return {
    value: entry.id,
    label: entry.name
  };
}

function toOptionFromUser(user?: User): MultiSelectOption | null {
  if (!user) {
    return null;
  }
  return {
    value: user.id,
    label: `${user.profile.firstName} ${user.profile.lastName}`.trim()
  };
}

function Section({
  title,
  helper,
  children
}: {
  title: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 rounded-3xl border border-ink-100 bg-white/80 p-6 shadow-card">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{title}</p>
        {helper && <p className="text-sm text-ink-500">{helper}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function FormField({
  label,
  helper,
  required,
  children
}: {
  label: string;
  helper?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {helper && <span className="text-xs text-ink-400">{helper}</span>}
      {children}
    </label>
  );
}

function MultiSelect({
  options,
  value,
  onChange,
  placeholder
}: {
  options: MultiSelectOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const toggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((id) => id !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const remove = (optionValue: string) => {
    onChange(value.filter((id) => id !== optionValue));
  };

  const selectedOptions = options.filter((option) => value.includes(option.value));

  return (
    <div className="rounded-2xl border border-ink-100 px-3 py-2 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {selectedOptions.map((option) => (
          <span key={option.value} className="inline-flex items-center gap-1 rounded-full bg-brand-gradient/10 px-3 py-1 text-xs font-medium text-brand-700">
            {option.label}
            <button
              type="button"
              className="text-ink-400 hover:text-ink-600"
              onClick={() => remove(option.value)}
              aria-label={`Remove ${option.label}`}
            >
              ×
            </button>
          </span>
        ))}
        {!selectedOptions.length && (
          <span className="text-xs text-ink-400">{placeholder ?? "No selections"}</span>
        )}
      </div>
      <div className="mt-3 max-h-32 overflow-y-auto space-y-2">
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm text-ink-600">
            <input
              type="checkbox"
              checked={value.includes(option.value)}
              onChange={() => toggle(option.value)}
              className="h-4 w-4 rounded border-ink-200 text-brand-600 focus:ring-brand-200"
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}
