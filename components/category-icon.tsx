import {
  Baby, BriefcaseBusiness, Building2, CarFront, Gift, Hammer, Home, Laptop,
  Package, PawPrint, Repeat2, Settings, Shirt, ShoppingBag, Sofa, Trophy, Wrench,
} from "lucide-react";

const icons = {
  baby: Baby,
  ball: Trophy,
  briefcase: BriefcaseBusiness,
  building: Building2,
  car: CarFront,
  factory: Hammer,
  gift: Gift,
  home: Home,
  laptop: Laptop,
  package: Package,
  paw: PawPrint,
  repeat: Repeat2,
  settings: Settings,
  shirt: Shirt,
  shopping: ShoppingBag,
  sofa: Sofa,
  wrench: Wrench,
};

export function CategoryIcon({ name, size = 24 }: { name?: string; size?: number }) {
  const Icon = icons[name as keyof typeof icons] ?? Package;
  return <Icon size={size} aria-hidden="true" />;
}
