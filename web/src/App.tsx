import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Account } from "@/pages/Account";
import { Landing } from "@/pages/Landing";
import { Prize } from "@/pages/Prize";
import { Vault } from "@/pages/Vault";
import { Vaults } from "@/pages/Vaults";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="vaults" element={<Vaults />} />
        <Route path="vault/:address" element={<Vault />} />
        <Route path="deposit" element={<Navigate to="/vaults" replace />} />
        <Route path="prize" element={<Prize />} />
        <Route path="account" element={<Account />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
