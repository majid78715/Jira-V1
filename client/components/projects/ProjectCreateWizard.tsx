"use client";

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { MultiSelect } from "../ui/MultiSelect";
import { Company, Project, UserDirectoryEntry, WorkflowDefinition, WorkflowScheme } from "../../lib/types";
import { apiRequest, ApiError } from "../../lib/apiClient";
import { useCurrentUser } from "../../hooks/useCurrentUser";

interface ProjectCreateWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (project: Project) => void;
}

type WizardStep = 1 | 2 | 3;

type WizardFormState = {
  name: string;
  description: string;
  productManagerIds: string[];
  vendorCompanyId: string;
  projectManagerIds: string[];
  plannedStartDate: string;
  plannedEndDate: string;
  taskWorkflowDefinitionId: string;
  workflowSchemeId: string;
  budgetBucket: string;
};

const initialFormState: WizardFormState = {
  name: "",
  description: "",
  productManagerIds: [],
  vendorCompanyId: "",
  projectManagerIds: [],
  plannedStartDate: "",
  plannedEndDate: "",
  taskWorkflowDefinitionId: "",
  workflowSchemeId: "",
  budgetBucket: ""
};

export function ProjectCreateWizard({ open, onClose, onCreated }: ProjectCreateWizardProps) {
  const { user: currentUser, loading: userLoading } = useCurrentUser();
  const [form, setForm] = useState<WizardFormState>(initialFormState);
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [vendors, setVendors] = useState<Company[]>([]);
  const [directory, setDirectory] = useState<UserDirectoryEntry[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [schemes, setSchemes] = useState<WorkflowScheme[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open || userLoading) {
      return;
    }
    setForm(initialFormState);
    setCurrentStep(1);
    setDraftId(null);
    setStatusMessage(null);
    void loadWizardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userLoading]);

  async function loadWizardData() {
    setLoadingData(true);
    try {
      const [companyResponse, userResponse, workflowResponse, schemeResponse] = await Promise.all([
        apiRequest<{ companies: Company[] }>("/companies"),
        apiRequest<{ users: UserDirectoryEntry[] }>("/users"),
        apiRequest<{ definitions: WorkflowDefinition[] }>("/workflows/definitions?entityType=TASK"),
        apiRequest<WorkflowScheme[]>("/workflow-schemes")
      ]);
      const vendorCompanies = (companyResponse.companies ?? []).filter((company) => company.type === "VENDOR");
      setVendors(vendorCompanies);
      setDirectory(userResponse.users ?? []);
      setWorkflows(workflowResponse.definitions ?? []);
      
      let schemesData: WorkflowScheme[] = [];
      if (Array.isArray(schemeResponse)) {
        schemesData = schemeResponse;
      } else if (schemeResponse && "workflowSchemes" in (schemeResponse as any)) {
        schemesData = (schemeResponse as any).workflowSchemes;
      }
      setSchemes(schemesData);

      setForm((prev) => {
        let defaultPmIds: string[] = [];
        if (currentUser && currentUser.role === "PM") {
          defaultPmIds = [currentUser.id];
        } else {
          const defaultPm = selectFirstProductManager(userResponse.users ?? []);
          if (defaultPm) {
            defaultPmIds = [defaultPm.id];
          }
        }
        const defaultWorkflow = (workflowResponse.definitions ?? []).find((definition) => definition.isActive);
        
        // Try to find a default scheme by name, otherwise pick the first one
        const defaultScheme = schemesData.find(s => 
          s.name.toLowerCase().includes("default") || 
          s.name.toLowerCase().includes("standard") ||
          s.name.toLowerCase().includes("original")
        ) || schemesData[0];

        return {
          ...prev,
          productManagerIds: prev.productManagerIds.length > 0 ? prev.productManagerIds : defaultPmIds,
          taskWorkflowDefinitionId: prev.taskWorkflowDefinitionId || defaultWorkflow?.id || "",
          workflowSchemeId: prev.workflowSchemeId || defaultScheme?.id || ""
        };
      });
    } catch (error) {
      const apiError = error as ApiError;
      setStatusMessage(apiError?.message ?? "Unable to load wizard data.");
    } finally {
      setLoadingData(false);
    }
  }

  const productManagers = useMemo(
    () =>
      directory
        .filter((entry) => entry.role === "PM")
        .map((entry) => ({ id: entry.id, label: entry.name || entry.email })),
    [directory]
  );

  const projectManagers = useMemo(() => {
    if (!form.vendorCompanyId) {
      return [];
    }
    return directory
      .filter((entry) => entry.role === "PROJECT_MANAGER" && entry.companyId === form.vendorCompanyId)
      .map((entry) => ({ id: entry.id, label: entry.name || entry.email }));
  }, [directory, form.vendorCompanyId]);

  const selectedVendor = vendors.find((vendor) => vendor.id === form.vendorCompanyId);
  const selectedProductManagers = directory.filter((user) => form.productManagerIds.includes(user.id));
  const selectedProjectManagers = directory.filter((user) => form.projectManagerIds.includes(user.id));
  const selectedScheme = schemes.find((s) => s.id === form.workflowSchemeId);

  const canProceedStepOne =
    form.name.trim().length >= 2 &&
    form.description.trim().length >= 8 &&
    form.productManagerIds.length > 0 &&
    Boolean(form.vendorCompanyId) &&
    form.projectManagerIds.length > 0;

  const canAutosave = canProceedStepOne;

  const persistDraft = useCallback(async () => {
    if (!canAutosave || savingDraft || submitting) {
      return;
    }
    setSavingDraft(true);
    try {
      const payload = buildRequestPayload(form);
      const url = draftId ? `/projects/draft/${draftId}` : "/projects/draft";
      const method = draftId ? "PATCH" : "POST";
      const response = await apiRequest<{ project: Project }>(url, {
        method,
        body: JSON.stringify(payload)
      });
      setDraftId(response.project.id);
      setStatusMessage("Draft saved.");
    } catch (error) {
      const apiError = error as ApiError;
      setStatusMessage(apiError?.message ?? "Unable to save draft.");
    } finally {
      setSavingDraft(false);
    }
  }, [canAutosave, savingDraft, submitting, form, draftId]);

  useEffect(() => {
    if (!open || !canAutosave || submitting) {
      return;
    }
    const timer = window.setTimeout(() => {
      void persistDraft();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [open, canAutosave, submitting, persistDraft]);

  const handleNext = () => {
    if (currentStep === 1 && !canProceedStepOne) {
      return;
    }
    if (currentStep < 3) {
      setCurrentStep((prev) => (prev + 1) as WizardStep);
      void persistDraft();
    }
  };

  const handleBack = () => {
    if (currentStep === 1) {
      return;
    }
    setCurrentStep((prev) => (prev - 1) as WizardStep);
  };

  async function handleCreateProject() {
    if (!canProceedStepOne) {
      return;
    }
    setSubmitting(true);
    setStatusMessage(null);
    try {
      const payload = {
        ...buildRequestPayload(form),
        draftId: draftId || undefined
      };
      const response = await apiRequest<{ project: Project }>("/projects", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setStatusMessage("Project created.");
      onCreated?.(response.project);
      resetWizard();
    } catch (error) {
      const apiError = error as ApiError;
      setStatusMessage(apiError?.message ?? "Unable to create project.");
    } finally {
      setSubmitting(false);
    }
  }

  const summaryItems = [
    { label: "Configuration", value: selectedScheme?.name || "Default" },
    { label: "Project name", value: form.name || "Not set" },
    { label: "Project description", value: form.description || "Not set" },
    {
      label: "Product managers",
      value: selectedProductManagers.length > 0 ? selectedProductManagers.map((pm) => pm.name).join(", ") : "Not set"
    },
    {
      label: "Vendor company",
      value: selectedVendor?.name ?? "Not set"
    },
    {
      label: "Project managers",
      value: selectedProjectManagers.length > 0 ? selectedProjectManagers.map((pm) => pm.name).join(", ") : "Not set"
    },
    {
      label: "Planned dates",
      value: form.plannedStartDate ? `${form.plannedStartDate || "TBD"} to ${form.plannedEndDate || "TBD"}` : "Not scheduled"
    },
    {
      label: "Estimated hours for completion",
      value: form.budgetBucket ? `${form.budgetBucket} hours` : "Not set"
    }
  ];

  return (
    <Modal open={open} onClose={() => (!submitting ? closeWizard() : undefined)} title="New Project">
      {loadingData || userLoading ? (
        <p className="text-sm text-ink-500">Loading wizard...</p>
      ) : (
        <>
          <StepIndicator currentStep={currentStep} />
          {currentStep === 1 && (
            <BasicsStep
              form={form}
              vendors={vendors}
              productManagers={productManagers}
              projectManagers={projectManagers}
              onChange={setForm}
            />
          )}
          {currentStep === 2 && <TeamStep form={form} workflows={workflows} onChange={setForm} />}
          {currentStep === 3 && <ReviewStep items={summaryItems} />}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={handleBack} disabled={currentStep === 1 || submitting}>
              Back
            </Button>
            <div className="flex items-center gap-3">
              {statusMessage && <p className="text-xs text-ink-500">{statusMessage}</p>}
              {currentStep < 3 && (
                <Button type="button" onClick={handleNext} disabled={(currentStep === 1 && !canProceedStepOne)}>
                  Next
                </Button>
              )}
              {currentStep === 3 && (
                <Button type="button" onClick={handleCreateProject} disabled={submitting || !canProceedStepOne}>
                  {submitting ? "Creating..." : "Create Project"}
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-400">
            {draftId
              ? savingDraft
                ? "Saving draft..."
                : "Draft saved automatically."
              : canAutosave
              ? "Draft will auto-save."
              : "Complete the basics to enable autosave."}
          </p>
        </>
      )}
    </Modal>
  );

  function closeWizard() {
    if (submitting) {
      return;
    }
    resetWizard();
    onClose();
  }

  function resetWizard() {
    setForm(initialFormState);
    setDraftId(null);
    setStatusMessage(null);
    setCurrentStep(1);
  }
}

function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const steps = [
    { id: 1, label: "Basics" },
    { id: 2, label: "Hours" },
    { id: 3, label: "Review" }
  ];
  return (
    <div className="mb-4 flex items-center justify-between text-sm font-medium text-ink-500">
      {steps.map((step) => (
        <div key={step.id} className="flex flex-1 items-center">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              currentStep === step.id ? "bg-brand-gradient text-white" : "bg-ink-100 text-ink-500"
            }`}
          >
            {step.id}
          </div>
          <span className="ml-3">{step.label}</span>
          {step.id < steps.length && <div className="ml-3 w-full border-t border-ink-100" />}
        </div>
      ))}
    </div>
  );
}

function ConfigurationStep({
  form,
  schemes,
  onChange
}: {
  form: WizardFormState;
  schemes: WorkflowScheme[];
  onChange: (next: WizardFormState) => void;
}) {
  return (
    <div className="space-y-4">
      <FieldGroup label="Workflow Scheme" required>
        <Select
          value={form.workflowSchemeId}
          onChange={(e) => onChange({ ...form, workflowSchemeId: e.target.value })}
        >
          <option value="">Select a scheme</option>
          {schemes.map((scheme) => (
            <option key={scheme.id} value={scheme.id}>
              {scheme.name}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-xs text-ink-500">
          Defines the available work item types (e.g. Bug, Story) and their status workflows.
        </p>
      </FieldGroup>
    </div>
  );
}

function BasicsStep({
  form,
  vendors,
  productManagers,
  projectManagers,
  onChange
}: {
  form: WizardFormState;
  vendors: Company[];
  productManagers: Array<{ id: string; label: string }>;
  projectManagers: Array<{ id: string; label: string }>;
  onChange: (next: WizardFormState) => void;
}) {
  return (
    <div className="space-y-4">
      <FieldGroup label="Project name" required>
        <Input value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} />
        {form.name.length > 0 && form.name.trim().length < 2 && (
          <p className="mt-1 text-xs text-red-500">Name must be at least 2 characters.</p>
        )}
      </FieldGroup>
      <FieldGroup label="Project description" required>
        <textarea
          className="w-full rounded-md border border-ink-100 bg-white px-2.5 py-2 text-xs text-ink-900 shadow-sm placeholder:text-ink-300 focus:border-accent-turquoise focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
          rows={2}
          maxLength={512}
          placeholder="Add a quick one- or two-sentence summary."
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
        />
        {form.description.length > 0 && form.description.trim().length < 8 && (
          <p className="mt-1 text-xs text-red-500">Description must be at least 8 characters.</p>
        )}
      </FieldGroup>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FieldGroup label="Product managers" required>
          <MultiSelect
            options={productManagers.map((pm) => ({ value: pm.id, label: pm.label }))}
            value={form.productManagerIds}
            onChange={(value) => onChange({ ...form, productManagerIds: value })}
            placeholder="Select product managers"
          />
        </FieldGroup>
        <FieldGroup label="Vendor company" required>
          <Select
            value={form.vendorCompanyId}
            onChange={(e) =>
              onChange({
                ...form,
                vendorCompanyId: e.target.value,
                projectManagerIds: []
              })
            }
          >
            <option value="">Select vendor</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </Select>
        </FieldGroup>
      </div>
      <FieldGroup label="Project managers (vendor)" required>
        <MultiSelect
          options={projectManagers.map((pm) => ({ value: pm.id, label: pm.label }))}
          value={form.projectManagerIds}
          onChange={(value) => onChange({ ...form, projectManagerIds: value })}
          placeholder="Select project managers"
        />
      </FieldGroup>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FieldGroup label="Planned start (optional)">
          <Input
            type="date"
            value={form.plannedStartDate}
            onChange={(e) => onChange({ ...form, plannedStartDate: e.target.value })}
          />
        </FieldGroup>
        <FieldGroup label="Planned end (optional)">
          <Input
            type="date"
            value={form.plannedEndDate}
            onChange={(e) => onChange({ ...form, plannedEndDate: e.target.value })}
          />
        </FieldGroup>
      </div>
    </div>
  );
}

function TeamStep({
  form,
  workflows,
  onChange
}: {
  form: WizardFormState;
  workflows: WorkflowDefinition[];
  onChange: (next: WizardFormState) => void;
}) {
  return (
    <div className="space-y-4">
      <FieldGroup label="Estimated hours for completion">
        <Input
          type="number"
          min={0}
          value={form.budgetBucket}
          onChange={(e) => onChange({ ...form, budgetBucket: e.target.value })}
          placeholder="80"
        />
      </FieldGroup>
    </div>
  );
}

function ReviewStep({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="space-y-3 rounded-2xl border border-ink-100 p-4">
      {items.map((item) => (
        <div key={item.label}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{item.label}</p>
          <p className="text-sm text-ink-900">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function selectFirstProductManager(users: UserDirectoryEntry[]): UserDirectoryEntry | undefined {
  return users.find((user) => user.role === "PM");
}

function FieldGroup({
  label,
  required,
  children
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wide text-ink-400">
      {label}
      {required && <span className="text-red-500"> *</span>}
      <div className="mt-1 text-sm text-ink-900">{children}</div>
    </label>
  );
}

function buildRequestPayload(form: WizardFormState) {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    productManagerIds: form.productManagerIds,
    vendorCompanyId: form.vendorCompanyId,
    projectManagerIds: form.projectManagerIds,
    plannedStartDate: form.plannedStartDate || undefined,
    plannedEndDate: form.plannedEndDate || undefined,
    taskWorkflowDefinitionId: form.taskWorkflowDefinitionId || undefined,
    workflowSchemeId: form.workflowSchemeId || undefined,
    budgetBucket: form.budgetBucket ? Number(form.budgetBucket) : undefined
  };
}
