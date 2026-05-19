const TRANSIENT_FETCH_PATTERNS = ["failed to fetch", "load failed", "networkerror"];

function rawErrorText(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return null;
}

function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

export function isTransientFetchError(error: unknown): boolean {
  const message = rawErrorText(error)?.toLowerCase() ?? "";

  return TRANSIENT_FETCH_PATTERNS.some((pattern) => message.includes(pattern));
}

export function shouldSurfaceBackgroundError(error: unknown): boolean {
  return !isTransientFetchError(error);
}

export function toUserErrorMessage(error: unknown, fallback: string): string {
  if (isTransientFetchError(error)) {
    return "네트워크 요청에 실패했습니다. 연결을 확인한 뒤 다시 시도하세요.";
  }

  return errorMessage(error) ?? fallback;
}
