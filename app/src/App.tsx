import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AiUsage } from "./pages/AiUsage";
import { useAuth } from "./hooks/useAuth";
import { brand } from "./config/brand";

function App() {
  const principal = useAuth();

  if (principal === undefined) {
    return <p className="state-message">Carregando…</p>;
  }

  if (principal === null) {
    return (
      <div className="login-screen">
        <h1 className="page-title">{brand.productName}</h1>
        <p className="page-subtitle">Faça login com sua conta Microsoft Entra ID para continuar</p>
        <a className="login-button" href="/.auth/login/aad?post_login_redirect_uri=/ai-usage">
          Entrar com Entra ID
        </a>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout userEmail={principal.userDetails} />}>
          <Route path="/ai-usage" element={<AiUsage />} />
          <Route path="*" element={<Navigate to="/ai-usage" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
