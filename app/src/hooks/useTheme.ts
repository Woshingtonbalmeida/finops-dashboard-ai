import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "finops-theme";

function getStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" ? "light" : "dark";
}

// Defaults to dark regardless of OS preference — this is an ops dashboard, not a
// general-audience site, and existing users shouldn't see anything change unless
// they explicitly opt into light mode.
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

  return { theme, toggleTheme };
}
