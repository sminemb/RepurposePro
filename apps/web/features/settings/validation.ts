export function validateName(name: string): string | null {
  return name.trim() ? null : "Enter your account name.";
}

export function validateEmail(email: string, currentEmail: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalized)) return "Enter a valid email address.";
  return normalized === currentEmail.toLowerCase()
    ? "Choose an email address different from your current address."
    : null;
}

export function validatePassword(
  currentPassword: string,
  newPassword: string,
  confirmation: string,
): string | null {
  if (!currentPassword || !newPassword || !confirmation) return "Complete all password fields.";
  if (newPassword.length < 8 || newPassword.length > 128)
    return "Use between 8 and 128 characters for your new password.";
  if (newPassword !== confirmation) return "The new passwords do not match.";
  return null;
}
