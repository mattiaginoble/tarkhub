import { useCallback } from "react";
import { useModal } from "../components/ModalContext";
import { useModUpdates } from "./useModUpdates";
import { Mod, ApiResponse, DownloadResult, ModOperationResult } from "./types";

export function useModOperations(
  currentList: string,
  installedMods: Record<number, boolean>
) {
  const { showModal, showConfirmation } = useModal();
  const { refreshModUpdates } = useModUpdates(currentList);

  const apiCall = useCallback(
    async <T>(
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
    },
    []
  );

  const showTimedModal = useCallback(
    (options: {
      type: "success" | "error" | "warning";
      title: string;
      message: string;
      duration?: number;
    }) => {
      const defaultDurations = {
        success: 3000,
        warning: 4000,
        error: 5000,
      };

      showModal({
        ...options,
        duration: options.duration || defaultDurations[options.type],
      });
    },
    [showModal]
  );

  const downloadMod = useCallback(
    async (modId: number, modName: string) => {
      if (!currentList) {
        showTimedModal({
          type: "warning",
          title: "No List Selected",
          message: "Please select a list first",
        });
        return;
      }

      showConfirmation({
        title: "Download Mod",
        message: `Download and install "${modName}"?`,
        confirmText: "Download",
        onConfirm: async () => {
          const result = await apiCall<ApiResponse>(
            `/api/mod_list/${encodeURIComponent(
              currentList
            )}/download_mod/${modId}`,
            { method: "POST" }
          );

          if (result.success) {
            showTimedModal({
              type: "success",
              title: "Download Complete",
              message: result.data?.message || "Mod downloaded successfully",
            });
            return true;
          } else {
            showTimedModal({
              type: "error",
              title: "Download Failed",
              message: result.error || "Download failed",
            });
            return false;
          }
        },
      });
    },
    [currentList, apiCall, showModal, showConfirmation]
  );

  const downloadAllMods = useCallback(
    async (currentMods: Mod[]) => {
      if (!currentList) {
        showTimedModal({
          type: "warning",
          title: "No List Selected",
          message: "Please select a list first",
        });
        return;
      }

      if (currentMods.length === 0) {
        showTimedModal({
          type: "warning",
          title: "Empty List",
          message: "The list contains no mods",
        });
        return;
      }

      showConfirmation({
        title: "Download All Mods",
        message: `Download and install all ${currentMods.length} mods?`,
        confirmText: "Download All",
        onConfirm: async () => {
          const result = await apiCall<DownloadResult[]>(
            `/api/mod_list/${encodeURIComponent(currentList)}/download_all`,
            { method: "POST" }
          );

          if (result.success && result.data) {
            const successCount = result.data.filter((r) => r.success).length;
            const errorCount = result.data.filter((r) => !r.success).length;

            if (errorCount === 0) {
              showTimedModal({
                type: "success",
                title: "Download Complete",
                message: `All ${successCount} mods downloaded successfully!`,
              });
            } else {
              showTimedModal({
                type: "warning",
                title: "Download Completed with Errors",
                message: `${successCount} mods downloaded, ${errorCount} failed`,
              });
            }
            return { success: successCount, error: errorCount };
          } else {
            showTimedModal({
              type: "error",
              title: "Download Failed",
              message: result.error || "Download failed",
            });
            return { success: 0, error: currentMods.length };
          }
        },
      });
    },
    [currentList, apiCall, showModal, showConfirmation]
  );

  const removeMod = useCallback(
    async (
      id: number,
      modName: string,
      onRemove: (id: number, deleteFiles?: boolean) => void
    ) => {
      if (!currentList) return;

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
        onConfirm: async (inputValue?: string | boolean) => {
          const deleteFiles = Boolean(inputValue);
          const url = `/api/mod_list/${encodeURIComponent(
            currentList
          )}/remove_mod/${id}${deleteFiles ? "?deleteFiles=true" : ""}`;

          const result = await apiCall<ApiResponse>(url, { method: "DELETE" });

          if (result.success) {
            onRemove(id, deleteFiles);
            showTimedModal({
              type: "success",
              title: "Mod Removed",
              message:
                result.data?.message ||
                `Mod "${modName}" removed successfully${
                  deleteFiles ? " and files deleted" : ""
                }`,
            });
          } else {
            showTimedModal({
              type: "error",
              title: "Remove Failed",
              message: result.error || "Remove failed",
            });
          }
        },
      });
    },
    [currentList, installedMods, apiCall, showModal, showConfirmation]
  );

  const addMod = useCallback(
    async (modUrl: string, currentMods: Mod[], onAdd: (mod: Mod) => void) => {
      if (!modUrl.trim()) {
        showTimedModal({
          type: "warning",
          title: "Empty URL",
          message: "Please enter a mod URL",
        });
        return false;
      }

      if (!currentList) {
        showTimedModal({
          type: "warning",
          title: "No List Selected",
          message: "Please select a list first",
        });
        return false;
      }

      const result = await apiCall<ModOperationResult>(
        `/api/mod_list/${encodeURIComponent(currentList)}/add_mod`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: modUrl }),
        }
      );

      if (result.success) {
        showTimedModal({
          type: "success",
          title: "Mod Added",
          message: result.data?.message || "Mod added successfully",
        });

        if (
          result.data?.mod &&
          result.data.message !== "Mod already present in the list"
        ) {
          onAdd(result.data.mod);
        }
        return true;
      } else {
        showTimedModal({
          type: "error",
          title: "Add Mod Failed",
          message: result.error || "Failed to add mod",
        });
        return false;
      }
    },
    [currentList, apiCall, showModal]
  );

  const handleUpdateAndDownload = useCallback(
    async (
      modId: number,
      modName: string,
      onUpdate: (modId: number) => void
    ) => {
      if (!currentList) return;

      showConfirmation({
        title: "Force Update Mod",
        message: `Force update "${modName}"? Existing version will be overwritten.`,
        confirmText: "Update",
        onConfirm: async () => {
          const result = await apiCall<any>(
            `/api/mod_list/${encodeURIComponent(
              currentList
            )}/force_update/${modId}`,
            { method: "POST" }
          );

          if (result.success) {
            onUpdate(modId);
            showTimedModal({
              type: "success",
              title: "Update Successful",
              message: result.data?.message || "Mod updated successfully",
            });
          } else {
            showTimedModal({
              type: "error",
              title: "Update Failed",
              message: result.error || "Update failed",
            });
          }
        },
      });
    },
    [currentList, apiCall, showModal, showConfirmation]
  );

  return {
    downloadMod,
    downloadAllMods,
    removeMod,
    addMod,
    handleUpdateAndDownload,
  };
}
