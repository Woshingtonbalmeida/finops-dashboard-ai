import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useTheme } from "../hooks/useTheme";
import { VersionFooter } from "./VersionFooter";
import { brand } from "../config/brand";
import { CloseIcon, MenuIcon, MoonIcon, ProductMarkIcon, SparkIcon, SunIcon } from "./Icons";

const observabilityLinks = [{ to: "/ai-usage", label: "IA / Azure OpenAI", icon: <SparkIcon /> }];

function NavItem({ to, label, end, icon }: { to: string; label: string; end?: boolean; icon: React.ReactNode }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
      {icon}
      {label}
    </NavLink>
  );
}

export function Layout({ userEmail }: { userEmail?: string }) {
  const { theme, toggleTheme } = useTheme();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="app-shell">
      <button
        type="button"
        className="mobile-topbar-toggle"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Abrir menu"
      >
        <MenuIcon size={18} />
        <span className="sidebar-brand-mark"><ProductMarkIcon /></span>
        {brand.productName}
      </button>

      {mobileNavOpen && <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} />}

      <aside className={`sidebar${mobileNavOpen ? " sidebar-open" : ""}`} onClick={() => setMobileNavOpen(false)}>
        <button
          type="button"
          className="sidebar-close"
          onClick={(e) => {
            e.stopPropagation();
            setMobileNavOpen(false);
          }}
          aria-label="Fechar menu"
        >
          <CloseIcon size={16} />
        </button>
        <div className="sidebar-logo">
          <img src={brand.logoPath} alt={brand.logoAlt} />
        </div>

        <div className="sidebar-brand">
          <span className="sidebar-brand-mark"><ProductMarkIcon /></span>
          {brand.productName}
        </div>

        <div className="sidebar-nav-group">IA</div>
        {observabilityLinks.map((link) => (
          <NavItem key={link.to} {...link} />
        ))}

        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
        >
          {theme === "dark" ? <SunIcon size={14} /> : <MoonIcon size={14} />}
          {theme === "dark" ? "Tema claro" : "Tema escuro"}
        </button>

        {userEmail && <div className="sidebar-footer">{userEmail}</div>}
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", lineHeight: 1.5 }}>Desenvolvido por Woshington Almeida</div>
        <VersionFooter />
      </aside>
      <div className="content-column">
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
