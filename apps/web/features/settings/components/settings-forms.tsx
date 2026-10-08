import { EmailSettings } from "./email-settings";
import { PasswordSettings } from "./password-settings";
import { ProfileSettings } from "./profile-settings";

export function SettingsForms({
  name,
  ...emailProps
}: {
  readonly name: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly emailAvailable: boolean;
  readonly stage?: string;
  readonly callbackError?: string;
}) {
  return (
    <div className="mt-8 grid gap-6">
      <ProfileSettings name={name} />
      <EmailSettings key={emailProps.email} {...emailProps} />
      <PasswordSettings />
    </div>
  );
}
