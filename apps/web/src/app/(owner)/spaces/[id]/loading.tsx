import { PageShell } from "@/features/navigation/page-shell";
import { TreeSkeleton } from "@/features/home/tree-skeleton";

export default function SpaceLoading() {
  return (
    <PageShell density="list">
      <TreeSkeleton />
    </PageShell>
  );
}
