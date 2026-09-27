import { categoryModelIconGroups } from "./reference-data/attribute-icon-contexts.ts";

// Stable semantic keys from the Master Catalog; RU/KK labels and values are not inputs.
export const semanticIconGroups = {
  AirVent: "ionization treatment_type",
  ArrowLeftRight: "bolt_pattern position foldable folding",
  Baby: "baby_heating_device_type breast_pump_item_type child_item_type isofix kids_gear_type pump_type stroller_type toy_type",
  BadgeCheck: "license_categories sterilized vaccinated",
  Bath: "bathroom sewerage",
  BatteryCharging: "battery_capacity battery_health cordless battery_voltage",
  BedDouble: "sleeping_places",
  Bike: "bicycle_type scooter_drive_type",
  BookOpen: "author book_format publisher student_level subject",
  Box: "accessory_type attachments available_parts capacity compatible_model compatible_model_other compatible_model_text equipment_count equipment_included equipment_scope event_equipment_type event_furnishing_type item_type model model_other package part_type parts_available product_type rental_equipment_type rental_item_type supply_type media_type",
  BriefcaseBusiness: "employment industry online_hiring remote remote_available",
  Building2: "commercial_type exchange_property_type floor floors floors_total premises property_type",
  Cable: "charging_connector charging_port",
  CalendarClock: "billing_period duration_hours engine_hours experience experience_years financial_period flight_hours lamp_hours minimum_term pay_period payback_months rental_period schedule",
  CalendarDays: "age age_group age_limit age_months animal_age_group business_age document_valid_until event_date expiry_date manufacture_date publication_year release_year year min_child_age",
  Camera: "action_camera_type camera_type photo_video_type",
  Car: "body",
  CircleDot: "steering wheel_type",
  CircuitBoard: "component_type cpu gpu socket cpu_cores cpu_threads cpu_frequency gpu_chip_vendor motherboard_form_factor chipset",
  ClipboardCheck: "accident_history authenticity condition health_status package_condition registration_status",
  Clock: "battery_life instant_booking same_day timer",
  Cog: "engine engine_power engine_volume engine_type motor_cycle",
  Coins: "billing deal debt_status deposit monthly_profit monthly_revenue mortgage payment_method price_type salary_from salary_negotiable salary_to tax_regime vat",
  CookingPot: "cooking_device_type kitchen_device_type",
  DoorOpen: "rooms rooms_total separate_entrance",
  Drill: "power_equipment_type tool_type",
  Droplets: "double_pumping dust_capacity humidification_rate oven_volume receiver_volume recommended_volume steam_output tank_volume total_volume viscosity volume water water_resistance waterproof wet_use flow_rate net_volume pot_volume",
  Dumbbell: "rental_activity_type sport",
  Eye: "night_vision",
  Factory: "machinery_type",
  Fan: "fan_type oscillation",
  Fence: "balcony",
  FileCheck: "contract_available customs_cleared document_support encumbrance_status financial_documents property_encumbrance",
  FileText: "compliance_document contract_type documents documents_available documents_required documents_status edition legal_form legal_format ownership_type pedigree reason_for_sale",
  Fingerprint: "microchipped",
  Fish: "fishing_type",
  Flame: "burners gas grill heater_kind heater_type heating heating_mode",
  Fuel: "fuel",
  Gamepad2: "game_title gaming_item_type gaming_rental_type",
  Gauge: "compressor_pressure max_speed max_spin_rpm mileage speed_levels working_pressure",
  Gem: "collectible_type",
  GitFork: "axles drive",
  Glasses: "vr_type",
  GraduationCap: "education lesson_format skills skill_level",
  HardDrive: "data_recovery memory storage storage_capacity storage_media storage_type storage_interface storage_form_factor",
  Hash: "animal_quantity attachments_count bottle_capacity compressors controllers_included heads_count phase_count place_settings quantity module_count wheel_count",
  Headphones: "audio_type",
  HeartPulse: "health_device_type",
  House: "building_type market object_type property_documents protected_object venue_type",
  Keyboard: "keyboard_included keyboard_layout",
  Languages: "language languages",
  Layers: "composition frame_material generation hull_material material material_scope materials materials_included sole_material textile_material wall_material compatible_generation",
  Leaf: "land_purpose plant_species plant_variety plant_form",
  Lightbulb: "brightness_lumens light_source lighting_type",
  ListChecks: "care_item_type features listing_purpose notice_type purpose",
  MapPin: "address_visibility country destination district gps registration_country service_area workplace",
  MemoryStick: "ram vram vram_type memory_type memory_frequency memory_form_factor",
  Monitor: "backlight color_screen console_form contrast_ratio display_type panel refresh_rate resolution screen_resolution screen_size hdr",
  Motorbike: "motorcycle_class",
  Music: "instrument_type",
  Network: "cellular compatible_os network_generation nfc operating_system platform service_platform sim sim_support tv_os",
  Package: "minimum_order net_quantity package_type quantity_unit sale_unit wholesale",
  Paintbrush: "craft_type",
  Palette: "color decor_style",
  PawPrint: "animal_scope animal_species animal_type breed pets_allowed species",
  PenTool: "pressure_levels stylus_included",
  Plug: "compatibility mount mounting_type attachment_mount compatible_tractor compatible_aircraft",
  Power: "auto_shutoff",
  Projector: "projector_technology throw_type",
  Radio: "baby_device_type remote_control",
  Refrigerator: "appliances",
  Repeat2: "wanted",
  Route: "access_road business_travel compatible_vehicle_type delivery emergency_call home_visit intercity mobile_service range range_km range_meters rental_vehicle_type vehicle_scope vehicle_type visit kart_use",
  Ruler: "case_size diameter dimensions frame_size length measurement offset size size_spec tire_profile tire_width wheel_size width working_height working_width boot_size height depth bar_spacing circumference shaft_length plant_height foot_length wheel_diameter seat_height",
  Scale: "load_capacity load_index max_load operating_weight payload weight_group max_user_weight equipment_weight net_weight max_pet_weight",
  ScanLine: "focal_length measurement_scope optical_zoom pressure_sensor",
  Scissors: "automatic_threader grooming_device_type hair_device_type sewing_device_type",
  Settings2: "appliance_type control_type engagement format modes_count operating_status operations_count production_format service_format transmission trim work_format adjustable_handlebar sled_type psu_form_factor",
  ShieldAlert: "rapid_response",
  ShieldCheck: "airworthiness approval certification certified licensed licenses_certificates overheat_protection professional_use service_guarantee sterile warranty",
  Shirt: "textile_type",
  ShoppingBag: "bag_type",
  Smartphone: "device_type free_device_type mobile_device_type smart_control smart_sync",
  Snowflake: "cold_air cooling_capacity freezer_location freezer_type freezing_capacity no_frost refrigerant_available cooling_type",
  Sofa: "furnished furniture_type",
  Sparkles: "skincare_device_type toothbrush_type",
  SquareDashed: "area area_hectares house_area kitchen_area land_area living_area object_area room_area total_area coverage_area",
  SquareParking: "garage garage_type parking pit",
  SunSnow: "season",
  Tablet: "device_form graphics_tablet_type",
  Tag: "brand brand_other compatible_brand compatible_make_text imei_available isbn issue_number manufacturer model_code part_number part_origin vin_available",
  Tent: "gear_type",
  Thermometer: "minimum_temperature storage_conditions temperature_levels thermostat",
  Ticket: "event seat seats",
  Truck: "trailer_type",
  UserRound: "audience client_type customer_scope customer_type gender operator_included owners_count provider_type seller_role",
  Users: "accommodation children_allowed guest_count guests loaders staff_count",
  Video: "frame_rate stabilization video_camera_type video_resolution",
  Volume2: "noise_level",
  WashingMachine: "cleaning_type dryer dust_collector filter_type half_load iron_device_type loading_type",
  Watch: "watch_model wearable_type",
  Wifi: "connection connectivity internet smart_projector smart_tv",
  Wind: "air_delivery convection drying_type extraction_rate recirculation self_emptying",
  Wrench: "at_customer design_project installation_type machinery_included renovation repair_history work_type",
  Zap: "electricity energy_class energy_source inverter motor_power network_voltage power power_source urgent utilities utilities_connected required_power psu_power",
} as const;

export type AttributeIconName = keyof typeof semanticIconGroups | keyof typeof categoryModelIconGroups | "SlidersHorizontal";

const semanticIcons: Readonly<Record<string, AttributeIconName>> = Object.fromEntries(
  Object.entries(semanticIconGroups).flatMap(([icon, keys]) => keys.split(" ").map(key => [key, icon as AttributeIconName])),
);
const modelIcons: Readonly<Record<string, AttributeIconName>> = Object.fromEntries(
  Object.entries(categoryModelIconGroups).flatMap(([icon, slugs]) => slugs.split(" ").map(slug => [slug, icon as AttributeIconName])),
);
const own = (map: Readonly<Record<string, AttributeIconName>>, key: string) => Object.hasOwn(map, key) ? map[key] : undefined;

/** Semantic key -> narrow category override for ambiguous keys -> universal meaning -> neutral fallback. */
export function resolveAttributeIcon(key: string, categorySlug?: string | null): AttributeIconName {
  // Older attribute sets have stable camelCase IDs; normalize IDs, not translated text.
  const semanticKey = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  // Explicit manual-entry siblings inherit the same semantic icon as their field.
  const semantic = own(semanticIcons, semanticKey)
    ?? (semanticKey.endsWith("_other") ? own(semanticIcons, semanticKey.slice(0, -6)) : undefined);
  const isBrand = semanticKey === "brand" || semanticKey === "brand_other";
  const isModel = semanticKey === "model" || semanticKey === "model_other";
  if (!isBrand && !isModel) return semantic ?? "SlidersHorizontal";
  const context = categorySlug ? own(modelIcons, categorySlug) : undefined;
  if (isModel && context) return context;
  if (isBrand && context === "Car") return "Car";
  return semantic ?? "SlidersHorizontal";
}
