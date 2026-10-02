import type { CreditBalance, SourceVideoMetadata } from "@repurposepro/shared";

import { createSourceVideoMetadataEndpoint } from "../../upload/client/upload-video";

export class RetainedUploadUnavailableError extends Error {}

export async function loadAnalysisRetryDetails(apiUrl: string, projectId: string) {
  const [source, credits] = await Promise.all([
    fetch(createSourceVideoMetadataEndpoint(apiUrl, projectId), {
      credentials: "include",
      cache: "no-store",
    }),
    fetch(`${apiUrl.replace(/\/$/, "")}/billing/credits`, {
      credentials: "include",
      cache: "no-store",
    }),
  ]);
  if (source.status === 404 || source.status === 410) throw new RetainedUploadUnavailableError();
  if (!source.ok || !credits.ok) throw new Error("Retry details are unavailable.");
  const metadata = ((await source.json()) as { data: SourceVideoMetadata }).data;
  const balance = ((await credits.json()) as { data: CreditBalance }).data;
  if (
    !metadata ||
    !metadata.hasAudio ||
    !Number.isFinite(Date.parse(metadata.expiresAt)) ||
    Date.parse(metadata.expiresAt) <= Date.now()
  )
    throw new RetainedUploadUnavailableError();
  if (
    !Number.isSafeInteger(metadata.requiredCredits) ||
    metadata.requiredCredits <= 0 ||
    !balance ||
    !Number.isSafeInteger(balance.balance) ||
    balance.unit !== "credits"
  )
    throw new Error("Retry details are invalid.");
  // Check the existing contained source endpoint without downloading the video.
  const availability = await fetch(
    `${apiUrl.replace(/\/$/, "")}/projects/${encodeURIComponent(projectId)}/source-video/content`,
    { method: "HEAD", credentials: "include", cache: "no-store" },
  );
  if (availability.status === 404 || availability.status === 410)
    throw new RetainedUploadUnavailableError();
  if (!availability.ok) throw new Error("Source availability is unavailable.");
  return { balance, metadata };
}
