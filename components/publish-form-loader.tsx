"use client";

import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PublishForm } from "@/components/publish-form";
import { useI18n } from "@/components/i18n-provider";
import type { OwnerDraftBundle } from "@/lib/data/types";
import type { CategoryPriceMode, CategoryReferenceData, ReferenceDataEnvelope } from "@/lib/reference-data/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const CATEGORY_COLUMNS = "id, parent_id, slug, name_ru, name_kk, icon_key, tone_key, search_placeholder_ru, search_placeholder_kk, title_placeholder_ru, title_placeholder_kk, description_hint_ru, description_hint_kk, price_mode, sort_order" as const;

type PublishProfileDefaults = {
  displayName: string;
  contactPhone: string;
  cityId: string | null;
};

async function loadCategoryCatalog(): Promise<ReferenceDataEnvelope<CategoryReferenceData>> {
  const client = getSupabaseBrowserClient();
  const rows: Array<{
    id: string;
    parent_id: string | null;
    slug: string;
    name_ru: string;
    name_kk: string;
    icon_key: string | null;
    tone_key: string | null;
    search_placeholder_ru: string | null;
    search_placeholder_kk: string | null;
    title_placeholder_ru: string | null;
    title_placeholder_kk: string | null;
    description_hint_ru: string | null;
    description_hint_kk: string | null;
    price_mode: string;
    sort_order: number;
  }> = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("categories")
      .select(CATEGORY_COLUMNS)
      .eq("is_active", true)
      .order("sort_order")
      .order("name_ru")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) break;
  }

  return {
    status: "ready",
    data: {
      categories: rows.map((category) => ({
        id: category.id,
        parentId: category.parent_id,
        slug: category.slug,
        name: { ru: category.name_ru, kk: category.name_kk },
        icon: category.icon_key,
        tone: category.tone_key,
        searchPlaceholder: category.search_placeholder_ru && category.search_placeholder_kk
          ? { ru: category.search_placeholder_ru, kk: category.search_placeholder_kk }
          : null,
        titlePlaceholder: category.title_placeholder_ru && category.title_placeholder_kk
          ? { ru: category.title_placeholder_ru, kk: category.title_placeholder_kk }
          : null,
        descriptionHint: category.description_hint_ru && category.description_hint_kk
          ? { ru: category.description_hint_ru, kk: category.description_hint_kk }
          : null,
        priceMode: category.price_mode as CategoryPriceMode,
        sortOrder: category.sort_order,
      })),
    },
  };
}

async function loadDraft(listingId: string): Promise<OwnerDraftBundle> {
  const response = await fetch(`/api/listings/${encodeURIComponent(listingId)}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`draft_load_${response.status}`);
  const body = await response.json() as { listing?: OwnerDraftBundle };
  if (!body.listing) throw new Error("draft_missing");
  return body.listing;
}

export function PublishFormLoader({
  requestedListingId,
  userId,
  profileDefaults,
}: {
  requestedListingId: string | null;
  userId: string;
  profileDefaults: PublishProfileDefaults;
}) {
  const { locale, t } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const [catalog, setCatalog] = useState<ReferenceDataEnvelope<CategoryReferenceData> | null>(null);
  const [draft, setDraft] = useState<OwnerDraftBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    Promise.all([
      loadCategoryCatalog(),
      requestedListingId ? loadDraft(requestedListingId) : Promise.resolve(null),
    ]).then(([nextCatalog, nextDraft]) => {
      if (!active) return;
      setCatalog(nextCatalog);
      setDraft(nextDraft);
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setFailed(true);
      setLoading(false);
    });
    return () => { active = false; };
  }, [attempt, requestedListingId]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  if (loading) {
    return <section className="dashboard-card publish-loader-state" role="status" aria-live="polite">
      <LoaderCircle size={28} aria-hidden="true" />
      <strong>{locale === "kk" ? "Хабарландыру жүктелуде…" : "Загрузка объявления…"}</strong>
    </section>;
  }

  if (failed || !catalog) {
    return <section className="dashboard-card publish-loader-state" role="alert">
      <AlertTriangle size={28} aria-hidden="true" />
      <strong>{locale === "kk" ? "Редакторды жүктеу мүмкін болмады" : "Не удалось загрузить редактор"}</strong>
      <button type="button" className="secondary-button" onClick={retry}>{t("common.retry")}</button>
    </section>;
  }

  return <PublishForm
    catalog={catalog}
    userId={userId}
    profileDefaults={profileDefaults}
    initialDraft={draft}
  />;
}
