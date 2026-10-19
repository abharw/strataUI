// In its own route group so the skeleton does not also wrap `/home/sign-in`.
import { PageShell } from "@/features/navigation/page-shell";
import { TreeSkeleton } from "@/features/home/tree-skeleton";

export default function HomeLoading() {
  return (
    <PageShell density="list">
      <TreeSkeleton />
    </PageShell>
  );
}
