export function formValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function validatePasswordConfirmation(
  password: string,
  confirmation: string,
): string | null {
  if (!password || !confirmation) return "Complete both password fields.";
  if (password.length < 8 || password.length > 128)
    return "Use between 8 and 128 characters for your password.";
  if (password !== confirmation) return "The passwords do not match.";
  return null;
}
