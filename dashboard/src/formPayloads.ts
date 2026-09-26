import type { Stop } from "./types";

type Fields = Record<string, unknown>;
const roles = ["ADMIN", "TRAVEL_MANAGER", "VIEWER"] as const;
const travelStatuses = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
const images = [
  "bali",
  "japan",
  "dolomites",
  "morocco",
  "greece",
  "iceland",
] as const;

function text(
  fields: Fields,
  key: string,
  label: string,
  max: number,
  required = true,
) {
  const raw = fields[key];
  const value = typeof raw === "string" ? raw.trim() : "";
  if (required && !value) throw new Error(`${label} is required`);
  if (value.length > max)
    throw new Error(`${label} must be ${max} characters or fewer`);
  return value;
}

function choice<T extends string>(
  value: unknown,
  choices: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !choices.includes(value as T))
    throw new Error(`Select a valid ${label}`);
  return value as T;
}

function dateField(fields: Fields, key: string, label: string) {
  const value = text(fields, key, label, 10);
  const parsed = new Date(value + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new Error(`${label} must be a valid calendar date`);
  return value;
}

export function travelPayload(
  fields: Fields,
  stops: readonly Stop[],
  participantIds: readonly string[],
  version = 0,
) {
  const title = text(fields, "title", "Travel plan name", 150);
  const startDate = dateField(fields, "startDate", "Start date");
  const endDate = dateField(fields, "endDate", "End date");
  if (endDate < startDate)
    throw new Error("End date must be on or after start date");
  const priceText = text(fields, "price", "Price", 20);
  const price = Number(priceText);
  if (
    !Number.isFinite(price) ||
    price < 0 ||
    price > 999999.99 ||
    !/^\d+(?:\.\d{1,2})?$/.test(priceText)
  )
    throw new Error(
      "Price must be between 0 and 999999.99 with at most two decimal places",
    );
  const capacity = Number(text(fields, "capacity", "Traveller capacity", 10));
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000)
    throw new Error(
      "Traveller capacity must be a whole number between 1 and 10000",
    );
  if (stops.length < 1 || stops.length > 30)
    throw new Error("Add between 1 and 30 destination stops");
  const normalizedStops = stops.map((stop, index) => ({
    destination: text(
      stop,
      "destination",
      `Stop ${index + 1} destination`,
      100,
    ),
    country: text(stop, "country", `Stop ${index + 1} country`, 100),
    activities: text(stop, "activities", `Stop ${index + 1} activities`, 2000),
    accommodation: text(
      stop,
      "accommodation",
      `Stop ${index + 1} accommodation`,
      500,
    ),
    transportation: text(
      stop,
      "transportation",
      `Stop ${index + 1} transportation`,
      500,
    ),
  }));
  if (participantIds.length > capacity)
    throw new Error("Participants exceed capacity");
  if (
    participantIds.some((id) => !id.trim()) ||
    new Set(participantIds).size !== participantIds.length
  )
    throw new Error("Select each participant only once");
  if (!Number.isInteger(version) || version < 0)
    throw new Error("Refresh this travel plan before saving");
  return {
    title,
    startDate,
    endDate,
    status: choice(fields.status, travelStatuses, "travel status"),
    price,
    capacity,
    description: text(fields, "description", "Description", 1000, false),
    image: choice(fields.image, images, "cover image"),
    stops: normalizedStops,
    participantIds: [...participantIds],
    version,
  };
}

export function userPayload(fields: Fields, creating: boolean) {
  const name = text(fields, "name", "Full name", 100);
  const email = text(fields, "email", "Email address", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email))
    throw new Error("Enter a valid email address");
  const password = typeof fields.password === "string" ? fields.password : "";
  const changingPassword = password.trim().length > 0;
  if (
    (creating && !changingPassword) ||
    ((creating || changingPassword) && password.length < 12)
  )
    throw new Error("Password must contain at least 12 characters");
  if (new TextEncoder().encode(password).length > 72)
    throw new Error("Password must contain at most 72 UTF-8 bytes");
  return {
    name,
    email,
    role: choice(fields.role, roles, "role"),
    status: choice(
      fields.status,
      ["ACTIVE", "SUSPENDED"] as const,
      "account status",
    ),
    ...(changingPassword ? { password } : {}),
  };
}

export function gatewayPayload(fields: Fields) {
  return {
    name: text(fields, "name", "Display name", 100),
    provider: choice(
      fields.provider,
      ["STRIPE", "PAYPAL"] as const,
      "provider",
    ),
    currency: choice(
      fields.currency,
      ["USD", "EUR", "GBP"] as const,
      "currency",
    ),
    enabled: fields.enabled === "on",
  };
}
