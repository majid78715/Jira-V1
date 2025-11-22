"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { Attachment, AttachmentEntityType } from "../../lib/types";
import { apiRequest, ApiError } from "../../lib/apiClient";

interface AttachmentsPanelProps {
  entityId?: string;
  entityType: AttachmentEntityType;
}

export function AttachmentsPanel({ entityId, entityType }: AttachmentsPanelProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAttachments = useCallback(async () => {
    if (!entityId) {
      setAttachments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ entityId, entityType }).toString();
      const response = await apiRequest<{ attachments: Attachment[] }>(`/attachments?${query}`);
      setAttachments(response.attachments ?? []);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to load attachments.");
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType]);

  useEffect(() => {
    void loadAttachments();
  }, [loadAttachments]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !entityId) {
      return;
    }
    try {
      setUploading(true);
      setError(null);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entityId", entityId);
      formData.append("entityType", entityType);
      await apiRequest("/files", { method: "POST", body: formData });
      event.target.value = "";
      await loadAttachments();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to upload file.");
    } finally {
      setUploading(false);
    }
  };

  if (!entityId) {
    return <p className="text-sm text-ink-500">Save the record to attach files.</p>;
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-ink-500">Upload file</label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center rounded-lg bg-brand-gradient-subtle border border-accent-turquoise/30 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-soft-gradient transition-all shadow-sm hover:shadow-md">
            <span>{uploading ? "Uploading…" : "Select file"}</span>
            <input type="file" className="hidden" onChange={handleFileChange} disabled={uploading} />
          </label>
          <p className="text-xs text-ink-500">Max 20MB</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-ink-500">Loading attachments…</p>
      ) : attachments.length === 0 ? (
        <p className="text-sm text-ink-500">No attachments yet.</p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="rounded-lg border border-ink-100 bg-white px-3 py-2 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <a href={attachment.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-600 hover:underline">
                    {attachment.originalName}
                  </a>
                  <p className="text-xs text-ink-500">{formatSize(attachment.size)}</p>
                </div>
                <p className="text-xs text-ink-400">{formatDate(attachment.createdAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatSize(size: number): string {
  if (!size) {
    return "0 B";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return value;
  }
}
