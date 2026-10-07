import { useEffect, useState } from "react";
import { useLocation, useNavigation, useRevalidator } from "react-router";

export const PENDING_DELAY_MS = 200;

export function usePendingRefresh(): boolean {
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const { pathname } = useLocation();

  const loading =
    (navigation.state === "loading" &&
      navigation.location.pathname === pathname) ||
    revalidator.state === "loading";

  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!loading) {
      setLate(false);
      return;
    }
    const timer = setTimeout(() => setLate(true), PENDING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  return loading && late;
}
