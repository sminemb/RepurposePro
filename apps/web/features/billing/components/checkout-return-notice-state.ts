export type CheckoutReturnNoticeState = "cancelled" | "pending" | null;

export function checkoutReturnNoticeState(
  checkoutStatus: string | null,
): CheckoutReturnNoticeState {
  if (checkoutStatus === "success") {
    return "pending";
  }

  if (checkoutStatus === "cancelled") {
    return "cancelled";
  }

  return null;
}

export function checkoutReturnUrlWithoutStatus(pathname: string, search: string): string {
  const searchParams = new URLSearchParams(search);
  searchParams.delete("checkout");

  const remainingSearch = searchParams.toString();
  return remainingSearch ? `${pathname}?${remainingSearch}` : pathname;
}
