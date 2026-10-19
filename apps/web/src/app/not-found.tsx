import { PageMissing } from "@/features/page-viewer/page-missing";

// Share-key routes have no loading.tsx: its Suspense skeleton would flush a 200 before the key
// lookup, so dead links would answer 200 instead of 404.
export default PageMissing;
