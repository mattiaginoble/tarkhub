import React, { useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import useModManager from "../hooks/useModManager";
import ModListControls from "./ModListControls";
import SPTUpdateBanner from "./SPTUpdateBanner";
import FikaUpdateBanner from "./FikaUpdateBanner";
import ModList from "./ModList";
import ServerStatus from "./ServerStatus";
import "../styles/main.css";

const ModManager: React.FC = () => {
  const { listName } = useParams();
  const navigate = useNavigate();
  const modManager = useModManager({ listName, navigate });
  const modListRef = useRef<any>();

  // Global refresh function called when clicking the refresh button in ServerStatus
  const handleGlobalRefresh = async () => {
    console.log("Global refresh triggered");

    // Execute all refresh operations in parallel
    await Promise.all([
      modManager.checkSptUpdate?.(),
      modManager.checkFikaUpdate?.(),
      modListRef.current?.forceCheckUpdates?.(),
    ]);
  };

  return (
    <div className="main-wrapper">
      <div className="app-header">
        <h1>TarkHub</h1>
        <p>Manage your Single Player Tarkov experience</p>
      </div>

      <SPTUpdateBanner {...modManager} />
      <FikaUpdateBanner {...modManager} />

      <ServerStatus
        onRefresh={handleGlobalRefresh}
        isChecking={modManager.isCheckingSptUpdate}
      />

      <div className="content-area">
        <ModListControls {...modManager} />

        <ModList
          ref={modListRef}
          currentList={modManager.currentList}
          currentMods={modManager.currentMods}
          installedMods={modManager.installedMods}
          selectedSptVersion={modManager.selectedSptVersion}
          sptVersions={modManager.sptVersions}
          handleSptVersionChange={modManager.handleSptVersionChange}
          modUrl={modManager.modUrl}
          setModUrl={modManager.setModUrl}
          addMod={modManager.addMod}
          downloadMod={modManager.downloadMod}
          handleUpdateAndDownload={modManager.handleUpdateAndDownload}
          removeMod={modManager.removeMod}
          getVersionMajor={modManager.getVersionMajor}
        />
      </div>
    </div>
  );
};

export default ModManager;
