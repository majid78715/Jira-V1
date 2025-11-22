"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Comment, CommentEntityType } from "../../lib/types";
import { apiRequest, ApiError } from "../../lib/apiClient";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface CommentsPanelProps {
  entityId?: string;
  entityType: CommentEntityType;
  resolveUserName?: (userId: string) => string;
}

export function CommentsPanel({ entityId, entityType, resolveUserName }: CommentsPanelProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadComments = useCallback(async () => {
    if (!entityId) {
      setComments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ entityId, entityType }).toString();
      const response = await apiRequest<{ comments: Comment[] }>(`/comments?${query}`);
      setComments(response.comments ?? []);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to load comments.");
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entityId || !body.trim()) {
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      await apiRequest("/comments", {
        method: "POST",
        body: JSON.stringify({ entityId, entityType, body })
      });
      setBody("");
      await loadComments();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to add comment.");
    } finally {
      setSubmitting(false);
    }
  };

  const grouped = useMemo(() => comments, [comments]);

  if (!entityId) {
    return <p className="text-sm text-ink-500">Create the record to start collaborating.</p>;
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {loading ? (
        <p className="text-sm text-ink-500">Loading comments…</p>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-ink-500">No comments yet.</p>
      ) : (
        <ul className="space-y-3">
          {grouped.map((comment) => (
            <li key={comment.id} className="rounded-xl border border-ink-100 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink-900">
                  {resolveUserName?.(comment.authorId) ?? comment.authorId}
                </p>
                <p className="text-xs text-ink-400">{formatDate(comment.createdAt)}</p>
              </div>
              <p className="mt-2 text-sm text-ink-800">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="space-y-2 rounded-xl border border-ink-100 bg-ink-50/60 p-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-ink-500">Add comment</label>
        <Input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Share update…"
          required
        />
        <Button type="submit" disabled={submitting || !body.trim()}>
          {submitting ? "Posting…" : "Post comment"}
        </Button>
      </form>
    </div>
  );
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

