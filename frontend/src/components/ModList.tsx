import React, {
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import SptVersionSelector from "./SptVersionSelector";
import AddModBar from "./AddModBar";
import ModItem from "./ModItem";

interface ModListProps {
  currentList: string;
  currentMods: any[];
  installedMods: { [key: number]: boolean };
  selectedSptVersion: string;
  sptVersions: any[];
  handleSptVersionChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  modUrl: string;
  setModUrl: (url: string) => void;
  addMod: (e: React.FormEvent<HTMLFormElement>) => void;
  downloadMod: (id: number, name: string) => void;
  handleUpdateAndDownload: (id: number, name: string) => void;
  removeMod: (id: number, name: string) => void;
  getVersionMajor: (version: string) => string;
}

const ModList = forwardRef<any, ModListProps>(
  (
    {
      currentList,
      currentMods,
      installedMods,
      selectedSptVersion,
      sptVersions,
      handleSptVersionChange,
      modUrl,
      setModUrl,
      addMod,
      downloadMod,
      handleUpdateAndDownload,
      removeMod,
      getVersionMajor,
    },
    ref
  ) => {
    const [modsWithUpdates, setModsWithUpdates] = useState<Set<number>>(
      new Set()
    );
    const [updatedModsData, setUpdatedModsData] = useState<{
      [key: number]: any;
    }>({});

    // Check for mod updates for the current list
    const checkModUpdatesForList = async () => {
      if (!currentList) return;

      try {
        const response = await fetch(
          `/api/mod_list/${currentList}/check_updates`
        );
        if (response.ok) {
          const updatedMods = await response.json();
          const updateIds = new Set<number>();
          const updatedData: { [key: number]: any } = {};

          updatedMods.forEach((mod: any) => {
            const modId = Number(mod.id);
            if (!isNaN(modId)) {
              updateIds.add(modId);
              updatedData[mod.id] = {
                updateAvailable: true,
                latestVersion: mod.latestVersion || mod.version,
              };
            }
          });

          setModsWithUpdates(updateIds);
          setUpdatedModsData(updatedData);

          console.log(
            `Found ${updatedMods.length} updates for list ${currentList}`
          );
        }
      } catch (error) {
        console.error("Error checking mod updates:", error);
      }
    };

    // Enhance mod data with update information
    const getEnhancedMod = (mod: any) => {
      const updateInfo = updatedModsData[mod.id];
      if (updateInfo) {
        return {
          ...mod,
          updateAvailable: true,
          latestVersion: updateInfo.latestVersion,
        };
      }
      return mod;
    };

    // Check for updates when current list changes
    useEffect(() => {
      if (currentList) {
        checkModUpdatesForList();
      } else {
        setModsWithUpdates(new Set());
        setUpdatedModsData({});
      }
    }, [currentList, currentMods]);

    // Expose forceCheckUpdates method to parent component
    useImperativeHandle(ref, () => ({
      forceCheckUpdates: checkModUpdatesForList,
    }));

    if (!currentList) {
      return (
        <div className="mods-section">
          <div className="section-header">
            <h2>Mods in (0)</h2>
          </div>
          <div className="empty-state">
            <p>Select an existing list or create a new one to get started.</p>
          </div>
        </div>
      );
    }

    const hasUpdates = modsWithUpdates.size > 0;
    const enhancedMods = currentMods.map(getEnhancedMod);

    return (
      <div className="mods-section">
        <div className="section-header">
          <h2>
            Mods in {currentList} ({enhancedMods.length})
            {hasUpdates && (
              <span
                className="update-badge-header pulsing"
                title={`${modsWithUpdates.size} mod(s) have updates`}
              >
                {modsWithUpdates.size} update(s)
              </span>
            )}
          </h2>
          <SptVersionSelector
            currentList={currentList}
            sptVersions={sptVersions}
            selectedSptVersion={selectedSptVersion}
            handleSptVersionChange={handleSptVersionChange}
          />
        </div>

        <AddModBar
          modUrl={modUrl}
          setModUrl={setModUrl}
          addMod={addMod}
          currentList={currentList}
        />

        {enhancedMods.length === 0 ? (
          <div className="empty-state">
            <p>No mods in this list. Add some mods to get started!</p>
          </div>
        ) : (
          <div className="mods-grid">
            {enhancedMods.map((mod: any) => (
              <ModItem
                key={mod.id}
                mod={mod}
                isInstalled={installedMods[mod.id]}
                selectedSptVersion={selectedSptVersion}
                getVersionMajor={getVersionMajor}
                downloadMod={downloadMod}
                handleUpdateAndDownload={handleUpdateAndDownload}
                removeMod={removeMod}
                hasUpdate={modsWithUpdates.has(mod.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);

export default ModList;
