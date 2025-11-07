import React, { useRef } from "react";
import { NavigateFunction } from "react-router-dom";
import { useModManager } from "../hooks/useModManager";
import ModListControls from "./ModListControls";
import SPTUpdateBanner from "./SPTUpdateBanner";
import FikaUpdateBanner from "./FikaUpdateBanner";
import ModList from "./ModList";
import ServerStatus from "./ServerStatus";
import { useModal } from "./ModalContext";

interface ModManagerContentProps {
  listName?: string;
  navigate: NavigateFunction;
}

const ModManagerContent: React.FC<ModManagerContentProps> = ({
  listName,
  navigate,
}) => {
  const { showModal, showConfirmation } = useModal();

  const modManager = useModManager({
    listName,
    navigate,
    showModal,
    showConfirmation,
  });

  const modListRef = useRef<any>();

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
        currentList={modManager.currentList}
        onCheckModUpdates={modManager.checkAllModUpdates}
        onUpdateInstalledStatus={modManager.updateInstalledStatusOnce}
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
          selectedSptVersion={modManager.selectedSptVersion}
          sptVersions={modManager.sptVersions}
          handleSptVersionChange={modManager.handleSptVersionChange}
        />

        <ModList
          ref={modListRef}
          currentList={modManager.currentList}
          currentMods={modManager.currentMods}
          installedMods={modManager.installedMods}
          selectedSptVersion={modManager.selectedSptVersion}
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
