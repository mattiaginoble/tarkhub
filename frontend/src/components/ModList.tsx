import React, {
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useRef,
} from "react";
import AddModBar from "./AddModBar";
import ModItem from "./ModItem";
import { Mod } from "../hooks/types";
import { useModUpdates } from "../hooks/useModUpdates";

interface ModListProps {
  currentList: string;
  currentMods: Mod[];
  installedMods: Record<number, boolean>;
  selectedSptVersion: string;
  modUrl: string;
  setModUrl: (url: string) => void;
  addMod: (e: React.FormEvent<HTMLFormElement>) => void;
  downloadMod: (id: number, name: string) => void;
  handleUpdateAndDownload: (id: number, name: string) => void;
  removeMod: (id: number, name: string) => void;
}

interface ModListRef {
  forceCheckUpdates: () => void;
}

const ModList = forwardRef<ModListRef, ModListProps>(
  (
    {
      currentList,
      currentMods,
      installedMods,
      selectedSptVersion,
      modUrl,
      setModUrl,
      addMod,
      downloadMod,
      handleUpdateAndDownload,
      removeMod,
    },
    ref
  ) => {
    const { modUpdates, refreshModUpdates, isCheckingModUpdates } =
      useModUpdates(currentList);

    const [modsWithUpdates, setModsWithUpdates] = useState<Set<number>>(
      new Set()
    );

    const [updatedModsData, setUpdatedModsData] = useState<Record<number, Mod>>(
      {}
    );

    const checkUpdateTimeoutRef = useRef<number>();

    const checkModUpdatesForList = async () => {
      if (!currentList || isCheckingModUpdates) return;

      try {
        await refreshModUpdates(currentList);
      } catch (error) {
        console.error("Error checking mod updates:", error);
      }
    };

    const getEnhancedMod = (mod: Mod): Mod => {
      const updatedMod = modUpdates.find((m: Mod) => m.id === mod.id);
      return updatedMod || mod;
    };

    useEffect(() => {
      if (currentList && currentMods.length > 0) {
        if (checkUpdateTimeoutRef.current) {
          clearTimeout(checkUpdateTimeoutRef.current);
        }

        checkUpdateTimeoutRef.current = window.setTimeout(() => {
          checkModUpdatesForList();
        }, 1000);
      } else {
        setModsWithUpdates(new Set());
        setUpdatedModsData({});
      }

      return () => {
        if (checkUpdateTimeoutRef.current) {
          clearTimeout(checkUpdateTimeoutRef.current);
        }
      };
    }, [currentList, currentMods]);

    useEffect(() => {
      if (currentMods.length > 0) {
        setModsWithUpdates((prev) => {
          const newSet = new Set(prev);
          currentMods.forEach((mod) => {
            newSet.delete(mod.id);
          });
          return newSet;
        });

        setUpdatedModsData((prev) => {
          const newData = { ...prev };
          currentMods.forEach((mod) => {
            delete newData[mod.id];
          });
          return newData;
        });
      }
    }, [currentMods]);

    useEffect(() => {
      if (modUpdates.length > 0) {
        const updateIds = new Set<number>();
        const updatedData: Record<number, Mod> = {};

        modUpdates.forEach((mod: Mod) => {
          if (mod.updateAvailable) {
            updateIds.add(mod.id);
            updatedData[mod.id] = mod;
          }
        });

        setModsWithUpdates(updateIds);
        setUpdatedModsData(updatedData);
      }
    }, [modUpdates]);

    useImperativeHandle(ref, () => ({
      forceCheckUpdates: checkModUpdatesForList,
    }));

    if (!currentList) {
      return (
        <div className="mods-section">
          <div className="section-header">
            <h2>0 Mods</h2>
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
          <div className="section-header-title">
            {hasUpdates && (
              <span
                className="update-badge-header pulsing"
                title={`${modsWithUpdates.size} mod(s) have updates`}
              >
                {modsWithUpdates.size} update(s)
              </span>
            )}

            <h2>
              {enhancedMods.length} Mod{enhancedMods.length !== 1 ? "s" : ""} in{" "}
              {currentList}
            </h2>
          </div>
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
            {enhancedMods.map((mod) => (
              <ModItem
                key={mod.id}
                mod={mod}
                isInstalled={installedMods[mod.id]}
                selectedSptVersion={selectedSptVersion}
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

ModList.displayName = "ModList";

export default ModList;
