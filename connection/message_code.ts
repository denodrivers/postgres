// https://www.postgresql.org/docs/14/protocol-message-formats.html

export const ERROR_MESSAGE = "E";

export const AUTHENTICATION_TYPE = {
  CLEAR_TEXT: 3,
  GSS_CONTINUE: 8,
  GSS_STARTUP: 7,
  MD5: 5,
  NO_AUTHENTICATION: 0,
  SASL_CONTINUE: 11,
  SASL_FINAL: 12,
  SASL_STARTUP: 10,
  SCM: 6,
  SSPI: 9,
} as const;

export const INCOMING_QUERY_BIND_MESSAGES = {} as const;

export const INCOMING_QUERY_PARSE_MESSAGES = {} as const;

export const INCOMING_AUTHENTICATION_MESSAGES = {
  AUTHENTICATION: "R",
  BACKEND_KEY: "K",
  PARAMETER_STATUS: "S",
  READY: "Z",
} as const;

export const INCOMING_TLS_MESSAGES = {
  ACCEPTS_TLS: "S",
  NO_ACCEPTS_TLS: "N",
} as const;

export const INCOMING_QUERY_MESSAGES = {
  BIND_COMPLETE: "2",
  PARSE_COMPLETE: "1",
  COMMAND_COMPLETE: "C",
  DATA_ROW: "D",
  EMPTY_QUERY: "I",
  NO_DATA: "n",
  NOTICE_WARNING: "N",
  PARAMETER_STATUS: "S",
  READY: "Z",
  ROW_DESCRIPTION: "T",
} as const;
