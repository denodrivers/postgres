/**
 * Controls debugging behavior. If set to `true`, all debug options are enabled.
 * If set to `false`, all debug options are disabled. Can also be an object with
 * specific debug options to enable.
 *
 * {@default false}
 */
export type DebugControls = DebugOptions | boolean;

type DebugOptions = {
  /** Log all queries */
  queries?: boolean;
  /** Log all INFO, NOTICE, and WARNING raised database messages */
  notices?: boolean;
  /** Log all results */
  results?: boolean;
  /** Include the SQL query that caused an error in the PostgresError object */
  queryInError?: boolean;
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
