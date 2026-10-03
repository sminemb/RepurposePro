export interface AuthFormError {
  readonly message: string;
  readonly title: string;
  readonly variant: "error" | "warning";
}

interface AuthResponseError {
  readonly code?: string;
  readonly message?: string;
  readonly status?: number;
}

export function getAuthResponseError(
  responseError: AuthResponseError,
  isSignUp: boolean,
): AuthFormError {
  if (responseError.status === 429 || responseError.code === "RATE_LIMIT_EXCEEDED")
    return {
      title: "Please wait before trying again",
      message: "Too many attempts. Wait a moment, then try again.",
      variant: "warning",
    };
  if (responseError.code === "PROTECTION_UNAVAILABLE")
    return {
      title: "Sign-in is temporarily unavailable",
      message: "Please try again shortly.",
      variant: "warning",
    };
  if (responseError.code === "REQUEST_BLOCKED")
    return {
      title: "Request blocked",
      message: "Security protection blocked this request. Please try again using your browser.",
      variant: "error",
    };
  if (isSignUp && responseError.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
    return {
      title: "An account already exists",
      message: "This email is already registered. Sign in instead or use a different email.",
      variant: "error",
    };
  }

  return isSignUp
    ? {
        title: "We could not create your account",
        message: "Check your details or sign in instead.",
        variant: "error",
      }
    : {
        title: "Those details do not match",
        message: "Check your email and password, then try again.",
        variant: "error",
      };
}
