import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ModalProvider } from "./ModalContext";
import ModManagerContent from "./ModManagerContent";
import "../styles/main.css";

const ModManager: React.FC = () => {
  const { listName } = useParams();
  const navigate = useNavigate();

  return (
    <ModalProvider>
      <ModManagerContent listName={listName} navigate={navigate} />
    </ModalProvider>
  );
};

export default ModManager;
