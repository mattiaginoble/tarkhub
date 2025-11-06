import { useCallback } from "react";
import type { Mod } from "./types";

interface UseModCRUDProps {
  currentList: string;
  currentMods: Mod[];
  modUrl: string;
  installedMods: Record<number, boolean>;
  setModUrl: (url: string) => void;
  setCurrentMods: (mods: Mod[] | ((prev: Mod[]) => Mod[])) => void;
  setModInstalled: (modId: number, installed: boolean) => void;
  removeModInstallStatus: (modId: number) => void;
  loadModsOfList: (listName: string) => Promise<void>;
  showModal: (options: any) => void;
  showConfirmation: (options: any) => void;
  updateInstalledStatusOnce?: () => Promise<void>;
  checkModInstalled?: (modId: number) => Promise<boolean>;
}

const apiCall = async <T>(
  url: string,
  options?: RequestInit
): Promise<{ success: boolean; data?: T; error?: string }> => {
  try {
    const response = await fetch(url, options);
    if (response.ok) {
      const data = await response.json();
      return { success: true, data };
    } else {
      const error = await response.json();
      return { success: false, error: error.error || "Request failed" };
    }
  } catch (error) {
    console.error(`API call failed: ${url}`, error);
    return { success: false, error: "Network error" };
  }
};

export function useModCRUD({
  currentList,
  currentMods,
  modUrl,
  installedMods,
  setModUrl,
  setCurrentMods,
  setModInstalled,
  removeModInstallStatus,
  loadModsOfList,
  showModal,
  showConfirmation,
  updateInstalledStatusOnce,
}: UseModCRUDProps) {
  const handleAddMod = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!modUrl.trim() || !currentList) {
        showModal({
          type: "warning",
          title: "Empty URL",
          message: "Please enter a mod URL",
        });
        return false;
      }

      try {
        const result = await apiCall<any>(
          `/api/mod_list/${encodeURIComponent(currentList)}/add_mod`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: modUrl }),
          }
        );

        if (result.success && result.data?.mod) {
          setCurrentMods((prev) => {
            if (prev.some((mod) => mod.id === result.data.mod.id)) {
              showModal({
                type: "warning",
                title: "Mod Already Exists",
                message: `Mod "${result.data.mod.name}" is already in the list`,
              });
              return prev;
            }
            showModal({
              type: "success",
              title: "Mod Added",
              message: `Mod "${result.data.mod.name}" added successfully`,
            });
            return [...prev, result.data.mod];
          });
          setModUrl("");
          return true;
        } else {
          showModal({
            type: "error",
            title: "Add Mod Failed",
            message: result.error || "Failed to add mod",
          });
          return false;
        }
      } catch (error) {
        console.error("Add mod failed:", error);
        showModal({
          type: "error",
          title: "Add Mod Failed",
          message: "An error occurred while adding the mod",
        });
        return false;
      }
    },
    [modUrl, currentList, showModal, setCurrentMods, setModUrl]
  );

  const handleRemoveMod = useCallback(
    async (id: number, modName: string) => {
      if (!currentList) {
        showModal({
          type: "warning",
          title: "No List Selected",
          message: "Please select a list first",
        });
        return;
      }

      const isInstalled = installedMods[id] || false;

      showConfirmation({
        title: "Remove Mod",
        message: `Remove "${modName}" from list?${
          isInstalled ? " You can also choose to delete installed files." : ""
        }`,
        cancelText: "Cancel",
        confirmText: "Remove from List",
        showDeleteOption: isInstalled,
        deleteOptionText: "Also delete installed files",
        onConfirm: async (deleteFiles?: string | boolean) => {
          const shouldDeleteFiles = Boolean(deleteFiles);
          const url = `/api/mod_list/${encodeURIComponent(
            currentList
          )}/remove_mod/${id}${shouldDeleteFiles ? "?deleteFiles=true" : ""}`;

          try {
            const result = await apiCall(url, { method: "DELETE" });

            if (result.success) {
              removeModInstallStatus(id);
              setCurrentMods((prev) => prev.filter((mod) => mod.id !== id));
              showModal({
                type: "success",
                title: "Mod Removed",
                message: `Mod "${modName}" removed successfully${
                  shouldDeleteFiles ? " and files deleted" : ""
                }`,
              });
            } else {
              showModal({
                type: "error",
                title: "Remove Failed",
                message: result.error || `Failed to remove "${modName}"`,
              });
            }
          } catch (error) {
            console.error("Remove mod failed:", error);
            showModal({
              type: "error",
              title: "Remove Failed",
              message: `An error occurred while removing "${modName}"`,
            });
          }
        },
      });
    },
    [
      currentList,
      installedMods,
      removeModInstallStatus,
      showModal,
      showConfirmation,
      setCurrentMods,
    ]
  );

  const handleDownloadMod = useCallback(
    async (modId: number, modName: string) => {
      if (!currentList) {
        showModal({
          type: "warning",
          title: "No List Selected",
          message: "Please select a list first",
        });
        return false;
      }

      try {
        const result = await apiCall(
          `/api/mod_list/${encodeURIComponent(
            currentList
          )}/download_mod/${modId}`,
          { method: "POST" }
        );

        if (result.success) {
          setModInstalled(modId, true);

          if (updateInstalledStatusOnce) {
            setTimeout(() => {
              updateInstalledStatusOnce();
            }, 500);
          }

          showModal({
            type: "success",
            title: "Download Complete",
            message: `Mod "${modName}" downloaded successfully`,
          });
          return true;
        } else {
          showModal({
            type: "error",
            title: "Download Failed",
            message: result.error || `Failed to download "${modName}"`,
          });
          return false;
        }
      } catch (error) {
        console.error("Download failed:", error);
        showModal({
          type: "error",
          title: "Download Failed",
          message: `An error occurred while downloading "${modName}"`,
        });
        return false;
      }
    },
    [currentList, setModInstalled, showModal, updateInstalledStatusOnce]
  );

  const handleUpdateAndDownload = useCallback(
    async (modId: number, modName: string) => {
      if (!currentList) {
        showModal({
          type: "warning",
          title: "No List Selected",
          message: "Please select a list first",
        });
        return;
      }

      showConfirmation({
        title: "Force Update Mod",
        message: `Force update "${modName}"? Existing version will be overwritten.`,
        confirmText: "Update",
        onConfirm: async () => {
          try {
            const result = await apiCall(
              `/api/mod_list/${encodeURIComponent(
                currentList
              )}/force_update/${modId}`,
              { method: "POST" }
            );

            if (result.success) {
              setModInstalled(modId, true);

              if (updateInstalledStatusOnce) {
                await updateInstalledStatusOnce();
              }

              await loadModsOfList(currentList);
              showModal({
                type: "success",
                title: "Update Successful",
                message: `Mod "${modName}" updated successfully`,
              });
            } else {
              showModal({
                type: "error",
                title: "Update Failed",
                message: result.error || `Failed to update "${modName}"`,
              });
            }
          } catch (error) {
            console.error("Update failed:", error);
            showModal({
              type: "error",
              title: "Update Failed",
              message: `An error occurred while updating "${modName}"`,
            });
          }
        },
      });
    },
    [
      currentList,
      setModInstalled,
      loadModsOfList,
      updateInstalledStatusOnce,
      showModal,
      showConfirmation,
    ]
  );

  return {
    addMod: handleAddMod,
    downloadMod: handleDownloadMod,
    handleUpdateAndDownload,
    removeMod: handleRemoveMod,
  };
}
