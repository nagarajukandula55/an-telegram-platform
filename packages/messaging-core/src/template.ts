/**
 * Minimal `{{path.to.value}}` interpolation for campaign/template bodies —
 * spec §6's personalization engine. Dot-path lookup into a plain object;
 * an unresolved placeholder is left as-is (visible in the sent message)
 * rather than silently dropped, so a typo'd field name is easy to spot.
 */
export function renderTemplate(body: string, context: Record<string, unknown>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path: string) => {
    const value = path.split(".").reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
      return undefined;
    }, context);
    return value === undefined || value === null ? match : String(value);
  });
}
