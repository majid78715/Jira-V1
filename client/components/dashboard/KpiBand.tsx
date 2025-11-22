"use client";

import clsx from "clsx";
import { DashboardKpiCard } from "../../lib/types";

interface KpiBandProps {
  cards: DashboardKpiCard[];
}

export function KpiBand({ cards }: KpiBandProps) {
  if (!cards?.length) {
    return null;
  }

  return (
    <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <article
          key={card.id}
          className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm transition hover:shadow-md"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{card.label}</p>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-3xl font-semibold text-ink-900">{card.primaryValue}</span>
            {card.trendValue ? (
              <span
                className={clsx(
                  "text-sm font-semibold",
                  card.trendDirection === "up" && "text-emerald-600",
                  card.trendDirection === "down" && "text-rose-600",
                  card.trendDirection === "flat" && "text-ink-500"
                )}
              >
                {card.trendValue}
              </span>
            ) : null}
          </div>
          {card.secondaryText ? <p className="text-sm text-ink-500">{card.secondaryText}</p> : null}
        </article>
      ))}
    </div>
  );
}
