/**
 * Controls debugging behavior. If set to `true`, all debug options are enabled.
 * If set to `false`, all debug options are disabled. Can also be an object with
 * specific debug options to enable.
 *
 * {@default false}
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
