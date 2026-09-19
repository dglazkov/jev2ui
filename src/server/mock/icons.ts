// The symbols Jev can choose from, wherever a screen, a row, an item or a destination wants one.

import { choice } from "@typesafe-ai/sdk";
import { ranked } from "../models.js";

/** Material Symbols. No catalogue limits the set now, so it covers what apps are actually about. */
export const ICONS = [
  "home", "search", "person", "group", "settings", "notifications", "favorite", "star", "bookmark", "share", "lock", "key", "shield", "visibility",
  "language", "palette", "dark_mode", "light_mode", "volume_up", "music_note", "headphones", "mic", "podcasts", "play_circle", "movie", "photo_camera", "image",
  "download", "upload", "cloud", "wifi", "bluetooth", "storage", "memory", "battery_full", "bolt", "speed", "timer", "schedule", "calendar_today", "event",
  "mail", "chat", "call", "forum", "campaign", "help", "info", "warning", "error", "check_circle", "delete", "logout", "edit", "tune", "filter_list", "sort",
  "shopping_cart", "shopping_bag", "payments", "credit_card", "receipt_long", "sell", "local_shipping", "inventory_2", "storefront", "redeem",
  "restaurant", "local_cafe", "bakery_dining", "local_bar", "kitchen", "directions_car", "directions_bike", "directions_walk", "flight", "train", "hotel", "map", "location_on", "explore",
  "fitness_center", "self_improvement", "monitor_heart", "medication", "bedtime", "spa", "pets", "park", "eco", "water_drop", "thermostat", "wb_sunny", "ac_unit",
  "school", "menu_book", "auto_stories", "science", "work", "business", "account_balance", "savings", "trending_up", "bar_chart", "pie_chart", "insights",
  "code", "terminal", "dns", "database", "bug_report", "build", "construction", "devices", "smartphone", "laptop", "tv", "print", "router", "sensors",
  "lightbulb", "power", "local_laundry_service", "checkroom", "brush", "sports_esports", "sports_soccer", "toys", "child_care", "family_restroom", "volunteer_activism",
  "dashboard", "grid_view", "list_alt", "inbox", "analytics", "electric_bolt", "solar_power", "ev_station", "heat_pump", "replay", "fast_forward", "fast_rewind", "skip_next", "repeat", "queue_music", "library_music",
  "library_books", "newspaper", "article", "confirmation_number", "local_offer", "percent", "support_agent", "rate_review", "thumb_up", "emoji_events", "flag", "task_alt", "checklist", "pending_actions",
  "description", "folder", "attach_file", "link", "history", "sync", "backup", "security", "fingerprint", "verified_user", "privacy_tip", "policy", "accessibility", "translate",
] as const;
export const ICON_OPTIONS = Object.fromEntries([...ICONS.map((name) => [name, null]), ["none", "No symbol in the set relates to it."]]);

export const iconQuestion = (what: string) => choice(`Which symbol best stands for ${what}?`, ICON_OPTIONS);
export const readIcon = (answer: any) => {
  const [name] = ranked(answer)[0];
  return name === "none" ? undefined : name;
};

