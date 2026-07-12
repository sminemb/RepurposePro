export interface AuthFormError {
  readonly message: string;
  readonly title: string;
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
  if (isSignUp && responseError.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
    return {
      title: "An account already exists",
      message: "This email is already registered. Sign in instead or use a different email.",
    };
  }

  return isSignUp
    ? {
        title: "We could not create your account",
        message: "Check your details or sign in instead.",
      }
    : {
        title: "Those details do not match",
        message: "Check your email and password, then try again.",
      };
}
