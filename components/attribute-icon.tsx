import {
  AirVent, ArrowLeftRight, Baby, BadgeCheck, Bath, BatteryCharging, BedDouble,
  Bike, BookOpen, Box, BriefcaseBusiness, Building2, Bus, Cable,
  CalendarClock, CalendarDays, Camera, Car, CircleDot, CircuitBoard, ClipboardCheck,
  Clock, Cog, Coins, CookingPot, DoorOpen, Drill, Droplets,
  Dumbbell, Eye, Factory, Fan, Fence, FileCheck, FileText,
  Fingerprint, Fish, Flame, Footprints, Fuel, Gamepad2, Gauge,
  Gem, GitFork, Glasses, GraduationCap, HardDrive, Hash, Headphones,
  HeartPulse, House, Keyboard, Languages, Laptop, Layers, Leaf,
  Lightbulb, ListChecks, MapPin, MemoryStick, Microwave, Monitor, Motorbike,
  Music, Network, Package, Paintbrush, Palette, PawPrint, PenTool,
  Plane, Plug, Power, Projector, Radio, Refrigerator, Repeat2,
  Route, Ruler, Scale, ScanLine, Scissors, Settings2, ShieldAlert,
  ShieldCheck, Ship, Shirt, ShoppingBag, SlidersHorizontal, Smartphone, Snowflake,
  Sofa, Sparkles, SquareDashed, SquareParking, SunSnow, Tablet, Tag,
  Tent, Thermometer, Ticket, Tractor, Truck, Tv, UserRound,
  Users, Video, Volume2, WashingMachine, Watch, Wifi, Wind,
  Wrench, Zap,
  type LucideIcon, type LucideProps,
} from "lucide-react";
import { resolveAttributeIcon, type AttributeIconName } from "@/lib/attribute-icons";

const icons = {
  AirVent, ArrowLeftRight, Baby, BadgeCheck, Bath, BatteryCharging, BedDouble,
  Bike, BookOpen, Box, BriefcaseBusiness, Building2, Bus, Cable,
  CalendarClock, CalendarDays, Camera, Car, CircleDot, CircuitBoard, ClipboardCheck,
  Clock, Cog, Coins, CookingPot, DoorOpen, Drill, Droplets,
  Dumbbell, Eye, Factory, Fan, Fence, FileCheck, FileText,
  Fingerprint, Fish, Flame, Footprints, Fuel, Gamepad2, Gauge,
  Gem, GitFork, Glasses, GraduationCap, HardDrive, Hash, Headphones,
  HeartPulse, House, Keyboard, Languages, Laptop, Layers, Leaf,
  Lightbulb, ListChecks, MapPin, MemoryStick, Microwave, Monitor, Motorbike,
  Music, Network, Package, Paintbrush, Palette, PawPrint, PenTool,
  Plane, Plug, Power, Projector, Radio, Refrigerator, Repeat2,
  Route, Ruler, Scale, ScanLine, Scissors, Settings2, ShieldAlert,
  ShieldCheck, Ship, Shirt, ShoppingBag, SlidersHorizontal, Smartphone, Snowflake,
  Sofa, Sparkles, SquareDashed, SquareParking, SunSnow, Tablet, Tag,
  Tent, Thermometer, Ticket, Tractor, Truck, Tv, UserRound,
  Users, Video, Volume2, WashingMachine, Watch, Wifi, Wind,
  Wrench, Zap,
} satisfies Record<AttributeIconName, LucideIcon>;

export function AttributeIcon({ attributeKey, categorySlug, ...props }: LucideProps & { attributeKey: string; categorySlug?: string | null }) {
  const Icon = icons[resolveAttributeIcon(attributeKey, categorySlug)];
  return <Icon {...props} aria-hidden="true" />;
}
