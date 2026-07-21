const REQUIRED_VARIABLES = [
  'DB_HOST',
  'DB_USER',
  'DB_PASS',
  'DB_NAME',
  'API_KEY',
] as const;

export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED_VARIABLES.filter((name) => {
    const value = environment[name];
    return typeof value !== 'string' || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  const apiKey = String(environment.API_KEY);
  if (apiKey.length < 24) {
    throw new Error('API_KEY must contain at least 24 characters');
  }

  return environment;
}
