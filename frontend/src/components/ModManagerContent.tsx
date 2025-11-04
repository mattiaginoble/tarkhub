import React, { useRef } from "react";
import { NavigateFunction } from "react-router-dom";
import useModManager from "../hooks/useModManager";
import ModListControls from "./ModListControls";
import SPTUpdateBanner from "./SPTUpdateBanner";
import FikaUpdateBanner from "./FikaUpdateBanner";
import ModList from "./ModList";
import ServerStatus from "./ServerStatus";

interface ModManagerContentProps {
  listName?: string;
  navigate: NavigateFunction;
}

const ModManagerContent: React.FC<ModManagerContentProps> = ({
  listName,
  navigate,
}) => {
  const modManager = useModManager({ listName, navigate });
  const modListRef = useRef<any>();

  const handleGlobalRefresh = async () => {
    console.log("Global refresh triggered");
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

      <SPTUpdateBanner
        sptUpdate={
          modManager.sptUpdate
            ? {
                updateAvailable: modManager.sptUpdate.updateAvailable,
                currentVersion: modManager.sptUpdate.currentVersion,
                latestVersion: modManager.sptUpdate.latestVersion,
              }
            : undefined
        }
        isUpdatingSpt={modManager.isUpdatingSpt}
        updateSpt={modManager.updateSpt}
      />

      <FikaUpdateBanner
        fikaUpdate={
          modManager.fikaUpdate
            ? {
                updateAvailable: modManager.fikaUpdate.updateAvailable,
                currentVersion: modManager.fikaUpdate.currentVersion,
                latestVersion: modManager.fikaUpdate.latestVersion,
              }
            : undefined
        }
        isUpdatingFika={modManager.isUpdatingFika}
        updateFika={modManager.updateFika}
      />

      <ServerStatus
        onRefresh={handleGlobalRefresh}
        isChecking={modManager.isCheckingSptUpdate}
      />

      <div className="content-area">
        <ModListControls
          currentList={modManager.currentList}
          modLists={modManager.modLists}
          onListChange={modManager.handleListChange}
          onAddList={modManager.addList}
          onRenameList={modManager.renameList}
          onDeleteList={modManager.deleteList}
          onExportList={modManager.downloadList}
          onImportList={modManager.importList}
          onClearCache={modManager.clearInstalledCache}
        />

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
        />
      </div>
    </div>
  );
};

export default ModManagerContent;
