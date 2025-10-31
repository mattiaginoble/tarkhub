import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import ModManager from "./components/ModManager";

const RedirectToMod: React.FC = () => {
  const navigate = window.location.pathname;
  React.useEffect(() => {
    window.location.replace("/mod");
  }, []);
  return <div>Redirecting...</div>;
};

const App: React.FC = () => (
  <Router>
    <Routes>
      <Route path="/mod" element={<ModManager />} />
      <Route path="/mod/:listName" element={<ModManager />} />
      <Route path="/" element={<RedirectToMod />} />
    </Routes>
  </Router>
);

export default App;
