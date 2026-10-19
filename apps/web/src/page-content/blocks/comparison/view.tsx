import { CollectionEmpty } from "@/page-content/collection-empty";
import { surfaceList, surfaceListRow } from "@/page-content/surface";

type ComparisonRow = {
  id: string;
  label: string;
  before: string;
  after: string;
};

/**
 * One attribute with its before and after stacked. The states differ in weight and colour
 * (muted before, emphasised after), not colour alone.
 */
function ComparisonItem({
  item,
  beforeLabel,
  afterLabel,
  last,
}: {
  item: ComparisonRow;
  beforeLabel: string;
  afterLabel: string;
  last: boolean;
}) {
  return (
    <div className={`min-w-0 py-3 ${last ? "" : surfaceListRow}`}>
      <dt className="min-w-0 break-words text-meta leading-5 text-muted-foreground">{item.label}</dt>
      <dd className="mt-1 flex min-w-0 flex-col gap-1">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 break-words text-ui leading-5 text-muted-foreground">
          <span className="shrink-0 text-meta">{beforeLabel}</span>
          <span className="min-w-0 break-words">{item.before}</span>
        </p>
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 break-words text-ui leading-5 font-medium text-foreground">
          <span className="shrink-0 text-meta text-muted-foreground">{afterLabel}</span>
          <span className="min-w-0 break-words">{item.after}</span>
        </p>
      </dd>
    </div>
  );
}

export function Comparison({
  items,
  before_label,
  after_label,
  empty,
}: {
  items: ComparisonRow[];
  before_label?: string;
  after_label?: string;
  empty?: string;
}) {
  if (items.length === 0) return <CollectionEmpty text={empty ?? ""} />;

  // The schema defaults these, but a caller may not have parsed through it.
  const beforeLabel = before_label ?? "Was";
  const afterLabel = after_label ?? "Now";

  return (
    <dl className={"min-w-0 " + surfaceList + " font-inherit text-foreground"}>
      {items.map((item, index) => (
        <ComparisonItem
          key={item.id}
          item={item}
          beforeLabel={beforeLabel}
          afterLabel={afterLabel}
          last={index === items.length - 1}
        />
      ))}
    </dl>
  );
}
