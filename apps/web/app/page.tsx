import { headers } from "next/headers";

import { LandingPage } from "@/features/marketing/components/landing-page";
import { auth } from "@/lib/auth";

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return <LandingPage isAuthenticated={Boolean(session)} />;
}
