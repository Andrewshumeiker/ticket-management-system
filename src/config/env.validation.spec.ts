import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  const validEnvironment = {
    DB_HOST: 'localhost',
    DB_USER: 'postgres',
    DB_PASS: 'postgres',
    DB_NAME: 'tickets_db',
    API_KEY: 'a-secure-local-key-with-32-characters',
  };

  it('accepts a complete environment', () => {
    expect(validateEnvironment(validEnvironment)).toEqual(validEnvironment);
  });

  it('rejects missing variables', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, DB_PASS: '' }),
    ).toThrow('DB_PASS');
  });

  it('rejects a short API key', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, API_KEY: 'short' }),
    ).toThrow('at least 24 characters');
  });
});
