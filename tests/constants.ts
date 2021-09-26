let has_env_access = true;
try {
  Deno.env.toObject();
} catch (e) {
  if (e instanceof Deno.errors.PermissionDenied) {
    has_env_access = false;
  } else {
    throw e;
  }
}

export { has_env_access };
