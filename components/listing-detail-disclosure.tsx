"use client";

import { type ReactNode, useId, useState } from "react";
import { ChevronDown } from "lucide-react";

/** Desktop always shows the full content; only the mobile layout collapses it. */
export function ListingDetailDisclosure({ children, kind, label, collapsible = true }: {
  children: ReactNode;
  kind: "characteristics" | "description";
  label: string;
  collapsible?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <div className={`listing-disclosure listing-disclosure-${kind}`} data-expanded={expanded}>
    <div id={id} className="listing-disclosure-content">{children}</div>
    {collapsible ? <button type="button" className="listing-disclosure-toggle" aria-expanded={expanded} aria-controls={id}
      onClick={() => setExpanded(value => !value)}><span>{label}</span><ChevronDown size={19} aria-hidden="true" /></button> : null}
  </div>;
}
