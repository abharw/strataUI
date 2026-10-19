/** HTTP projection of the catalog-derived authoring guide. */
import { GUIDE_TOPICS, guideText, type GuideTopic } from "@/page-content/authoring/guide";
import { withEtag } from "@/server/api/http/etag";
import { fail, ok, type HandlerResult } from "@/shared/api/types";

export function get(input: { topic?: string }): HandlerResult {
  // The documents point agents at `?topic=authoring`, so that is the default.
  const topic = input.topic ?? "authoring";
  if (!GUIDE_TOPICS.includes(topic as GuideTopic)) {
    return fail(422, {
      error: `"${topic}" is not a guide topic.`,
      code: "unknown_topic",
      path: "/topic",
      valid: GUIDE_TOPICS,
      next: ["get_guide"],
    });
  }
  return withEtag(ok({ topic, text: guideText(topic as GuideTopic) }));
}
