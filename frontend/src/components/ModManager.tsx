import React, { memo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ModManagerContent from "./ModManagerContent";
import "../styles/main.css";

const ModManager: React.FC = memo(() => {
  const { listName } = useParams();
  const navigate = useNavigate();

  return <ModManagerContent listName={listName} navigate={navigate} />;
});

export default ModManager;
