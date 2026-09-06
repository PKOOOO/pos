// One shop, one timezone. Formatting on the server would otherwise render in
// the host's zone (UTC on Vercel), so a movement logged at 4pm in Nairobi would
// read as 1pm to the staff member who just logged it. Formatting client-side
// instead would fix the zone but mismatch during hydration.
const SHOP_TIME_ZONE = "Africa/Nairobi";

const dateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: SHOP_TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** e.g. "12 Mar, 16:04" — shop-local, stable between server and client. */
export function formatShopDateTime(value: Date): string {
  return dateTime.format(value);
}
