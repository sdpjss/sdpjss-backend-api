const configuredLegacyYear = Number(process.env.LEGACY_DONATION_RATE_YEAR);

// The rates that pre-date year-wise maintenance were the rates for 2025.
// The environment override is available in case a different deployment needs
// to assign its legacy values to another year.
export const LEGACY_DONATION_RATE_YEAR =
  Number.isInteger(configuredLegacyYear) &&
  configuredLegacyYear >= 1900 &&
  configuredLegacyYear <= 9999
    ? configuredLegacyYear
    : 2025;

export const LEGACY_COURIER_CHARGE_YEAR = LEGACY_DONATION_RATE_YEAR;
