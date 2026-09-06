/**
 * A search param can legitimately arrive repeated (`?q=a&q=b`), and Next hands
 * those over as an array. Every read takes the first value.
 */
export function firstSearchParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}
