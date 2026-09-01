"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PublishForm } from "@/components/publish-form";
import { useI18n } from "@/components/i18n-provider";
import { listActiveCategories, mapCategoryReferenceRows } from "@/lib/data/supabase/categories";
import type { OwnerDraftBundle } from "@/lib/data/types";
import {
  createSingleFlightTtlLoader,
  isPublishLoadRetryable,
  PublishLoadError,
  publishLoginHref,
  readPublishDraftResponse,
  type PublishLoadFailure,
} from "@/lib/publish/loader";
import type { CategoryReferenceData, ReferenceDataEnvelope } from "@/lib/reference-data/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const CATEGORY_CATALOG_TTL_MS = 5 * 60 * 1000;

type PublishProfileDefaults = {
  displayName: string;
  contactPhone: string;
  cityId: string | null;
};

type LoaderState =
  | { requestKey: string; status: "loading" }
  | {
    requestKey: string;
    status: "ready";
    catalog: ReferenceDataEnvelope<CategoryReferenceData>;
    draft: OwnerDraftBundle | null;
  }
  | { requestKey: string; status: "failed"; reason: PublishLoadFailure };

async function requestCategoryCatalog(): Promise<ReferenceDataEnvelope<CategoryReferenceData>> {
  const rows = await listActiveCategories(getSupabaseBrowserClient());
  return { status: "ready", data: mapCategoryReferenceRows(rows) };
}

const loadCategoryCatalog = createSingleFlightTtlLoader(requestCategoryCatalog, CATEGORY_CATALOG_TTL_MS);

async function loadDraft(listingId: string): Promise<OwnerDraftBundle> {
  try {
    const response = await fetch(`/api/listings/${encodeURIComponent(listingId)}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    return await readPublishDraftResponse(response);
  } catch (error) {
    if (error instanceof PublishLoadError) throw error;
    throw new PublishLoadError("temporary");
  }
}

async function loadEditorData(requestedListingId: string | null) {
  const draft = requestedListingId ? await loadDraft(requestedListingId) : null;
  try {
    const catalog = await loadCategoryCatalog();
    return { catalog, draft };
  } catch {
    throw new PublishLoadError("temporary");
  }
}

function failureReason(error: unknown): PublishLoadFailure {
  return error instanceof PublishLoadError ? error.reason : "unexpected";
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
  const router = useRouter();
  const { t } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${userId}:${requestedListingId ?? "create"}:${attempt}`;
  const [storedState, setStoredState] = useState<LoaderState>(() => ({ requestKey, status: "loading" }));
  const state: LoaderState = storedState.requestKey === requestKey
    ? storedState
    : { requestKey, status: "loading" };

  useEffect(() => {
    let active = true;
    void loadEditorData(requestedListingId).then(({ catalog, draft }) => {
      if (!active) return;
      setStoredState({
        requestKey,
        status: "ready",
        catalog,
        draft,
      });
    }).catch((error: unknown) => {
      if (!active) return;
      const reason = failureReason(error);
      if (reason === "authentication") router.replace(publishLoginHref(requestedListingId));
      setStoredState({ requestKey, status: "failed", reason });
    });
    return () => { active = false; };
  }, [requestKey, requestedListingId, router]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  if (state.status === "loading") {
    return <section className="dashboard-card publish-loader-state" role="status" aria-live="polite">
      <LoaderCircle size={28} aria-hidden="true" />
      <strong>{t("publish.loaderLoading")}</strong>
    </section>;
  }

  if (state.status === "failed") {
    const copy = state.reason === "authentication"
      ? { title: t("publish.loaderSessionTitle"), note: t("publish.loaderSessionNote") }
      : state.reason === "not_found"
        ? { title: t("publish.loaderNotFoundTitle"), note: t("publish.loaderNotFoundNote") }
        : state.reason === "not_editable"
          ? { title: t("publish.loaderNotEditableTitle"), note: t("publish.loaderNotEditableNote") }
          : state.reason === "temporary"
            ? { title: t("publish.loaderUnavailableTitle"), note: t("publish.loaderUnavailableNote") }
            : { title: t("publish.loaderUnexpectedTitle"), note: t("publish.loaderUnexpectedNote") };
    const loginHref = publishLoginHref(requestedListingId);

    return <section className="dashboard-card publish-loader-state" role="alert">
      <AlertTriangle size={28} aria-hidden="true" />
      <strong>{copy.title}</strong>
      <p>{copy.note}</p>
      {isPublishLoadRetryable(state.reason)
        ? <button type="button" className="secondary-button" onClick={retry}>{t("common.retry")}</button>
        : state.reason === "authentication"
          ? <Link className="secondary-button" href={loginHref}>{t("profile.login")}</Link>
          : <Link className="secondary-button" href="/profile">{t("publish.loaderBackToListings")}</Link>}
    </section>;
  }

  return <PublishForm
    key={state.draft?.id ?? "create"}
    catalog={state.catalog}
    userId={userId}
    profileDefaults={profileDefaults}
    initialDraft={state.draft}
  />;
}
