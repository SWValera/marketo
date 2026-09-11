/* eslint-disable @next/next/no-img-element */
export function BrandIcon({ className = "brand-logo", size = 44 }: { className?: string; size?: number }) {
  return <img className={className} src="/icons/jevu-192-v1.png" width={size} height={size} style={{objectFit:"contain"}} alt="" aria-hidden="true" />;
}

export function Brand() {
  return <><img className="brand-logo" src="/icons/jevu-192-v1.png" width={44} height={44} alt="" aria-hidden="true" /><span>JEVU</span></>;
}
