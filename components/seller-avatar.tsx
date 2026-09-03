"use client";

/* eslint-disable @next/next/no-img-element -- direct public-media URLs need a native load-error fallback. */

import { UserRound } from "lucide-react";
import { useState } from "react";

export function SellerAvatar({ src }: { src: string | null }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;

  return <div className="seller-profile-avatar" aria-hidden="true">
    <UserRound size={30} />
    {showImage ? <img
      src={src ?? undefined}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
    /> : null}
  </div>;
}
