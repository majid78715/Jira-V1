"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "../../../components/layout/PageShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { apiRequest, ApiError } from "../../../lib/apiClient";
import { Notification } from "../../../lib/types";
import { emitNotificationsUpdated } from "../../../lib/notifications";

type DigestMetadata = {
  digestType?: "WEEKLY" | "MONTHLY";
  periodStart?: string;
  periodEnd?: string;
  headline?: string;
  sections?: Array<{
    title: string;
    rows?: Array<{
      label: string;
      value?: string;
      meta?: string;
      href?: string;
    }>;
  }>;
};

export default function NotificationsPage() {
  const { user, loading: userLoading } = useCurrentUser({ redirectTo: "/login" });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<{ notifications: Notification[] }>("/notifications?limit=100");
      setNotifications(response.notifications ?? []);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void fetchNotifications();
    }
  }, [user, fetchNotifications]);

  const digestNotifications = useMemo(
    () => notifications.filter((notification) => isDigest(notification)),
    [notifications]
  );

  const simpleNotifications = useMemo(
    () => notifications.filter((notification) => !isDigest(notification)),
    [notifications]
  );

  const markAsRead = async (notificationId: string) => {
    try {
      await apiRequest(`/notifications/${notificationId}/read`, { method: "POST" });
      await fetchNotifications();
      emitNotificationsUpdated();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to update notification.");
    }
  };

  if (userLoading) {
    return (
      <PageShell title="Notifications" subtitle="Digest roll-ups and alerts">
        <Card>Loading account…</Card>
      </PageShell>
    );
  }

  return (
    <PageShell title="Notifications" subtitle="Digest roll-ups and alerts">
      {error ? <Card className="mb-4 text-sm text-red-600">{error}</Card> : null}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-ink-500">
            Weekly and monthly digests arrive every Monday 08:00 and on the first of the month.
          </p>
        </div>
        <Button variant="ghost" onClick={() => fetchNotifications()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <Card>Loading digests…</Card>
      ) : (
        <>
          <section className="space-y-4">
            {digestNotifications.length ? (
              digestNotifications.map((notification) => {
                const metadata = (notification.metadata ?? {}) as DigestMetadata;
                const helper = buildPeriodLabel(metadata);
                return (
                  <Card
                    key={notification.id}
                    title={notification.message}
                    helperText={helper}
                    className={notification.read ? undefined : "border-brand-200 bg-brand-25"}
                  >
                    <div className="flex items-center justify-between pb-3 text-xs uppercase tracking-wide text-ink-400">
                      <span>{metadata.headline ?? "Digest"}</span>
                      {!notification.read && (
                        <Button variant="ghost" className="text-xs" onClick={() => markAsRead(notification.id)}>
                          Mark as read
                        </Button>
                      )}
                    </div>
                    {metadata.sections?.length ? (
                      <div className="space-y-2">
                        {metadata.sections.map((section, index) => {
                          const sectionKey = `${notification.id}-${index}`;
                          const isOpen = expanded[sectionKey] ?? index === 0;
                          return (
                            <div key={sectionKey} className="rounded-xl border border-ink-100">
                              <button
                                type="button"
                                className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm font-semibold text-ink-900"
                                onClick={() =>
                                  setExpanded((prev) => ({
                                    ...prev,
                                    [sectionKey]: !isOpen
                                  }))
                                }
                              >
                                <span>{section.title}</span>
                                <span className="text-xs text-ink-500">{isOpen ? "Hide" : "Show"}</span>
                              </button>
                              {isOpen && section.rows?.length ? (
                                <ul className="border-t border-ink-50 px-4 py-3 text-sm text-ink-700">
                                  {section.rows.map((row, rowIndex) => (
                                    <li
                                      key={`${sectionKey}-${rowIndex}`}
                                      className="flex flex-col gap-0.5 border-b border-ink-50 py-2 last:border-b-0"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="font-medium text-ink-900">{row.label}</span>
                                        {row.value && (
                                          <span className="text-right font-semibold text-ink-800">{row.value}</span>
                                        )}
                                      </div>
                                      {row.meta ? <p className="text-xs text-ink-500">{row.meta}</p> : null}
                                      {row.href ? (
                                        <Link
                                          href={row.href}
                                          className="text-xs font-semibold text-brand-700 hover:underline"
                                        >
                                          View details
                                        </Link>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-ink-500">No sections available.</p>
                    )}
                  </Card>
                );
              })
            ) : (
              <Card>No digests available yet.</Card>
            )}
          </section>

          {simpleNotifications.length ? (
            <section className="mt-8 space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Other notifications</h2>
              {simpleNotifications.map((notification) => (
                <Card
                  key={notification.id}
                  className="space-y-2"
                  title={notification.message}
                  helperText={formatTimestamp(notification.createdAt)}
                >
                  {!notification.read && (
                    <Button variant="ghost" className="text-xs" onClick={() => markAsRead(notification.id)}>
                      Mark as read
                    </Button>
                  )}
                </Card>
              ))}
            </section>
          ) : null}
        </>
      )}
    </PageShell>
  );
}

function isDigest(notification: Notification): boolean {
  const meta = notification.metadata as DigestMetadata | undefined;
  return meta?.digestType === "WEEKLY" || meta?.digestType === "MONTHLY";
}

function buildPeriodLabel(metadata: DigestMetadata): string {
  if (metadata.periodStart && metadata.periodEnd) {
    const start = safeFormat(metadata.periodStart);
    const end = safeFormat(metadata.periodEnd);
    return `${metadata.digestType ?? "DIGEST"} · ${start} – ${end}`;
  }
  return metadata.digestType ? `${metadata.digestType} digest` : "Digest";
}

function safeFormat(value: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatTimestamp(value: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}
