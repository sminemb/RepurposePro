import type { ClipEditor } from "@repurposepro/shared";

/** Resolve the actual saved revision; edits arriving during a save prevent an export. */
export async function prepareClipRender(input: {
  blocked: boolean;
  dirty: boolean;
  save: () => Promise<boolean>;
  isCurrent: () => boolean;
  getSaved: () => ClipEditor;
}): Promise<ClipEditor | null> {
  if (input.blocked) return null;
  if (input.dirty && !(await input.save())) return null;
  return input.isCurrent() ? input.getSaved() : null;
}
