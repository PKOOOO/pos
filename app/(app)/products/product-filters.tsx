"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";
import { SearchIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useUrlSearch } from "@/hooks/use-url-search";
import { PRODUCT_CATEGORIES } from "@/lib/products";

// The Select needs a real value for "no filter"; the URL just omits the param.
const ALL_CATEGORIES = "all";

/**
 * Search and category filter. Both live in the URL rather than component state,
 * so a refresh, a back button, or a shared link all land on the same list —
 * which matters on a phone that reloads the tab whenever it's backgrounded.
 *
 * The current values arrive as props from the server page, so this component
 * never reads `useSearchParams` and needs no Suspense boundary.
 */
export function ProductFilters({
  query,
  category,
}: {
  query: string;
  category: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [navigating, startTransition] = useTransition();

  const hrefFor = useCallback(
    (nextQuery: string, nextCategory: string | null = category) => {
      const params = new URLSearchParams();
      const trimmed = nextQuery.trim();

      if (trimmed) params.set("q", trimmed);
      if (nextCategory) params.set("category", nextCategory);

      const search = params.toString();
      return search ? `${pathname}?${search}` : pathname;
    },
    [pathname, category],
  );

  const {
    term,
    setTerm,
    setImmediately,
    pending: searching,
  } = useUrlSearch({ query, hrefFor });

  const pending = searching || navigating;

  function onCategoryChange(value: string | null) {
    const next = !value || value === ALL_CATEGORIES ? null : value;
    startTransition(() => {
      router.replace(hrefFor(term, next), { scroll: false });
    });
  }

  const hasFilters = Boolean(term || category);

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search products"
          aria-label="Search products by name"
          autoComplete="off"
          className="h-11 pr-10 pl-9 text-base"
        />
        {pending && (
          <Spinner className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground" />
        )}
      </div>

      <div className="flex gap-2">
        <Select
          value={category ?? ALL_CATEGORIES}
          onValueChange={onCategoryChange}
        >
          <SelectTrigger
            aria-label="Filter by category"
            className="h-11 flex-1 text-base sm:w-52 sm:flex-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES} className="h-10">
              All categories
            </SelectItem>
            {PRODUCT_CATEGORIES.map((option) => (
              <SelectItem key={option} value={option} className="h-10">
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="outline"
            size="icon"
            aria-label="Clear filters"
            className="size-11"
            onClick={() => {
              // Clears the category too, so it can't go through the debounce.
              setImmediately("");
              startTransition(() => {
                router.replace(pathname, { scroll: false });
              });
            }}
          >
            <XIcon />
          </Button>
        )}
      </div>
    </div>
  );
}
