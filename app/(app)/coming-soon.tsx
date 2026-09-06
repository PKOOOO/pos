import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/**
 * Placeholder body for a nav destination whose feature hasn't been built yet —
 * the nav lists every section from the start, so the routes have to exist and
 * say something honest rather than 404.
 */
export function ComingSoon({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>

      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">{icon}</EmptyMedia>
          <EmptyTitle>Not built yet</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  );
}
