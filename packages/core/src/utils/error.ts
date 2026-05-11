export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  if (error != null && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message = record.message;
    if (typeof message === 'string') {
      return new Error(message);
    }
    const errorField = record.error;
    if (typeof errorField === 'string') {
      return new Error(errorField);
    }
    const statusText = record.statusText;
    if (typeof statusText === 'string') {
      return new Error(statusText);
    }
  }

  try {
    const serialized = JSON.stringify(error);
    if (serialized !== undefined) {
      return new Error(serialized);
    }
  } catch {
    // Fall through to String() fallback
  }

  return new Error(String(error));
}
