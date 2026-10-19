/** Delete-Space confirmation copy, kept separate so tests can assert it directly. */

export type SpaceQuestion = {
  title: string;
  description: string;
  act: string;
  busy: string;
  destructive: boolean;
};

export function deletionConsequence(activePageCount: number): string {
  const pages = activePageCount === 0
    ? "It has no Pages."
    : `Its ${activePageCount} Page${activePageCount === 1 ? "" : "s"} ${activePageCount === 1 ? "goes" : "go"} with it.`;
  return `${pages} It’s gone for everyone, links stop opening, and this can’t be undone.`;
}

export function deleteSpaceQuestion(name: string, activePageCount: number): SpaceQuestion {
  return {
    title: `Delete ${name}?`,
    description: deletionConsequence(activePageCount),
    act: "Delete",
    busy: "Deleting…",
    destructive: true,
  };
}
