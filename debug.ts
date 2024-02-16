/**
 * Controls debugging behavior {@default false}
 *
 * - `true` : all debug options are enabled
 * - `false` : all debug options are disabled
 * - DebugOptions:
 *   - `query` : Log queries
 *   - `notices` : Log notices
 */
export type DebugControls = DebugOptions | boolean;

type DebugOptions = {
  /** Log queries */
  queries?: boolean;
  /** Log notices */
  notices?: boolean;
  /** Log results */
  results?: boolean;
};

export const isDebugOptionEnabled = (
  option: keyof DebugOptions,
  options?: DebugControls,
): boolean => {
  if (typeof options === "boolean") {
    return options;
  }

  return !!options?.[option];
};
