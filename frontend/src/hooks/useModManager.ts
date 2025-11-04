import { useState, useEffect, useCallback } from "react";
import { NavigateFunction } from "react-router-dom";
import { getVersionMajor } from "../utils/versionUtils";
import { useModal } from "../components/ModalContext";

export interface Mod {
  id: number;
  name: string;
  version: string;
  latestVersion?: string;
  updateAvailable?: boolean;
  sptVersionConstraint: string;
  thumbnail: string;
  teaser: string;
  detailUrl: string;
  contentLength: string;
}

export interface SptVersion {
  version: string;
}

export interface UpdateInfo {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl?: string;
}

export interface ApiResponse {
  message?: string;
  success?: boolean;
  error?: string;
}

export interface ModDownloadResult {
  success: boolean;
  message: string;
  modName?: string;
}

export interface ModOperationResult extends ApiResponse {
  mod?: Mod;
}

export interface UseModManagerProps {
  listName?: string;
  navigate: NavigateFunction;
}

export default function useModManager({
  listName,
  navigate,
}: UseModManagerProps) {
  const { showModal, showConfirmation } = useModal();

  // State
  const [modLists, setModLists] = useState<string[]>([]);
  const [currentMods, setCurrentMods] = useState<Mod[]>([]);
  const [sptVersions, setSptVersions] = useState<SptVersion[]>([]);
  const [selectedSptVersion, setSelectedSptVersion] = useState<string>("");
  const [modUrl, setModUrl] = useState<string>("");
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);
  const [installedMods, setInstalledMods] = useState<Record<number, boolean>>(
    loadInstalledModsFromStorage()
  );
  const [sptUpdate, setSptUpdate] = useState<UpdateInfo | null>(null);
  const [isCheckingSptUpdate, setIsCheckingSptUpdate] =
    useState<boolean>(false);
  const [isUpdatingSpt, setIsUpdatingSpt] = useState<boolean>(false);
  const [fikaUpdate, setFikaUpdate] = useState<UpdateInfo | null>(null);
  const [isCheckingFikaUpdate, setIsCheckingFikaUpdate] =
    useState<boolean>(false);
  const [isUpdatingFika, setIsUpdatingFika] = useState<boolean>(false);

  // Storage utilities
  const saveInstalledModsToStorage = useCallback(
    (modsStatus: Record<number, boolean>) => {
      try {
        localStorage.setItem("installedMods", JSON.stringify(modsStatus));
      } catch (e) {
        console.error("Error saving installedMods to localStorage:", e);
      }
    },
    []
  );

  function loadInstalledModsFromStorage(): Record<number, boolean> {
    try {
      const saved = localStorage.getItem("installedMods");
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.error("Error loading installedMods from localStorage:", e);
      return {};
    }
  }

  // List management
  const getCurrentList = useCallback((): string => {
    if (listName) {
      const matchingList = modLists.find(
        (list) => list.toLowerCase() === listName.toLowerCase()
      );
      return matchingList || "";
    }
    return localStorage.getItem("lastSelectedList") || "";
  }, [listName, modLists]);

  const currentList = getCurrentList();

  const updateUrlForList = useCallback(
    (listName: string) => {
      if (listName) {
        const normalizedListName = listName.toLowerCase();
        navigate(`/mod/${encodeURIComponent(normalizedListName)}`);
      } else {
        navigate("/mod");
      }
    },
    [navigate]
  );

  // API Calls
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

  // SPT Management
  const checkSptUpdate = useCallback(async () => {
    setIsCheckingSptUpdate(true);
    const result = await apiCall<UpdateInfo>("/api/spt/check-update");
    if (result.success && result.data) {
      setSptUpdate(result.data);
    } else if (result.error) {
      showModal({
        type: "error",
        title: "SPT Update Check Failed",
        message: result.error,
      });
    }
    setIsCheckingSptUpdate(false);
  }, [showModal]);

  const updateSpt = useCallback(async () => {
    if (!sptUpdate?.downloadUrl) return;

    showConfirmation({
      title: "Update SPT",
      message: `Update SPT from ${sptUpdate.currentVersion} to ${sptUpdate.latestVersion}? The server will restart automatically.`,
      confirmText: "Update",
      onConfirm: async () => {
        setIsUpdatingSpt(true);
        const result = await apiCall("/api/spt/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ downloadUrl: sptUpdate.downloadUrl }),
        });

        if (result.success) {
          showModal({
            type: "success",
            title: "SPT Updated",
            message: "SPT updated successfully! Server restarting...",
            duration: 5000,
          });
          setSptUpdate(null);
          setTimeout(() => window.location.reload(), 5000);
        } else {
          showModal({
            type: "error",
            title: "SPT Update Failed",
            message: result.error || "Update failed",
          });
        }
        setIsUpdatingSpt(false);
      },
    });
  }, [sptUpdate, showModal, showConfirmation]);

  // Fika Management
  const checkFikaUpdate = useCallback(async () => {
    setIsCheckingFikaUpdate(true);
    const result = await apiCall<UpdateInfo>("/api/fika/check-update");
    if (result.success && result.data) {
      setFikaUpdate(result.data);
    } else if (result.error) {
      showModal({
        type: "error",
        title: "Fika Update Check Failed",
        message: result.error,
      });
    }
    setIsCheckingFikaUpdate(false);
  }, [showModal]);

  const updateFika = useCallback(async () => {
    if (!fikaUpdate?.downloadUrl) return;

    showConfirmation({
      title: "Update Fika",
      message: `Update Fika from ${fikaUpdate.currentVersion} to ${fikaUpdate.latestVersion}? The server will restart automatically.`,
      confirmText: "Update",
      onConfirm: async () => {
        setIsUpdatingFika(true);
        const result = await apiCall("/api/fika/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ downloadUrl: fikaUpdate.downloadUrl }),
        });

        if (result.success) {
          showModal({
            type: "success",
            title: "Fika Updated",
            message: "Fika updated successfully! Server restarting...",
            duration: 5000,
          });
          setFikaUpdate(null);
          setTimeout(() => window.location.reload(), 5000);
        } else {
          showModal({
            type: "error",
            title: "Fika Update Failed",
            message: result.error || "Update failed",
          });
        }
        setIsUpdatingFika(false);
      },
    });
  }, [fikaUpdate, showModal, showConfirmation]);

  // List Operations
  const loadModsOfList = useCallback(
    async (listName: string) => {
      try {
        const [modsRes, sptRes] = await Promise.all([
          fetch(`/api/mod_list/${encodeURIComponent(listName)}`),
          fetch(`/api/mod_list/${encodeURIComponent(listName)}/spt_version`),
        ]);

        if (modsRes.ok) {
          const mods: Mod[] = await modsRes.json();
          setCurrentMods(mods);
        }

        if (sptRes.ok) {
          const sptData = await sptRes.json();
          if (sptData.selectedSptVersion) {
            setSelectedSptVersion(sptData.selectedSptVersion);
          } else if (sptVersions.length > 0) {
            setSelectedSptVersion(sptVersions[0].version);
          }
        }
        setTimeout(updateAllInstalledStatus, 100);
      } catch (e) {
        console.error("Failed to load mods for list", listName, e);
        setCurrentMods([]);
      }
    },
    [sptVersions]
  );

  const saveSptVersion = useCallback(
    async (listName: string, version: string) => {
      const result = await apiCall(
        `/api/mod_list/${encodeURIComponent(listName)}/spt_version`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sptVersion: version }),
        }
      );

      if (!result.success) {
        console.error("Failed to save SPT version:", result.error);
      }
    },
    []
  );

  // Mod Operations
  const checkAllModUpdates = useCallback(async () => {
    if (!currentList) {
      showModal({
        type: "warning",
        title: "No List Selected",
        message: "Please select a list first",
      });
      return;
    }

    const result = await apiCall<Mod[]>(
      `/api/mod_list/${encodeURIComponent(currentList)}/check_updates`
    );

    if (result.success && result.data) {
      setCurrentMods((prevMods) =>
        prevMods.map((mod) => {
          const updatedMod = result.data!.find((m) => m.id === mod.id);
          return updatedMod || mod;
        })
      );

      const updatedCount = result.data.filter(
        (mod) => mod.updateAvailable
      ).length;
      if (updatedCount > 0) {
        showModal({
          type: "success",
          title: "Updates Available",
          message: `Found ${updatedCount} mod updates!`,
        });
      } else {
        showModal({
          type: "success",
          title: "Up to Date",
          message: "All mods are current",
        });
      }
    } else if (result.error) {
      showModal({
        type: "error",
        title: "Update Check Failed",
        message: result.error,
      });
    }
  }, [currentList, showModal]);

  const checkSingleModUpdate = useCallback(
    async (modId: number): Promise<Mod | null> => {
      if (!currentList) return null;

      const result = await apiCall<Mod>(
        `/api/mod_list/${encodeURIComponent(currentList)}/check_update/${modId}`
      );

      if (result.success && result.data) {
        setCurrentMods((prevMods) =>
          prevMods.map((mod) => (mod.id === modId ? result.data! : mod))
        );
        return result.data;
      }

      return currentMods.find((m) => m.id === modId) || null;
    },
    [currentList, currentMods]
  );

  const handleUpdateAndDownload = useCallback(
    async (modId: number, modName: string) => {
      if (!currentList) return;

      showConfirmation({
        title: "Force Update Mod",
        message: `Force update "${modName}"? Existing version will be overwritten.`,
        confirmText: "Update",
        onConfirm: async () => {
          const result = await apiCall<ModOperationResult>(
            `/api/mod_list/${encodeURIComponent(
              currentList
            )}/force_update/${modId}`,
            { method: "POST" }
          );

          if (result.success) {
            if (result.data?.mod) {
              setCurrentMods((prevMods) =>
                prevMods.map((mod) =>
                  mod.id === modId ? result.data!.mod! : mod
                )
              );
            }

            const newInstalledStatus = { ...installedMods, [modId]: true };
            setInstalledMods(newInstalledStatus);
            saveInstalledModsToStorage(newInstalledStatus);

            showModal({
              type: "success",
              title: "Update Successful",
              message: result.data?.message || "Mod updated successfully",
            });
          } else {
            showModal({
              type: "error",
              title: "Update Failed",
              message: result.error || "Update failed",
            });
          }
        },
      });
    },
    [
      currentList,
      installedMods,
      saveInstalledModsToStorage,
      showModal,
      showConfirmation,
    ]
  );

  const downloadMod = useCallback(
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
            const newInstalledStatus = { ...installedMods, [modId]: true };
            setInstalledMods(newInstalledStatus);
            saveInstalledModsToStorage(newInstalledStatus);

            showModal({
              type: "success",
              title: "Download Complete",
              message: result.data?.message || "Mod downloaded successfully",
            });
          } else {
            showModal({
              type: "error",
              title: "Download Failed",
              message: result.error || "Download failed",
            });
          }
        },
      });
    },
    [
      currentList,
      installedMods,
      saveInstalledModsToStorage,
      showModal,
      showConfirmation,
    ]
  );

  const downloadAllMods = useCallback(async () => {
    if (!currentList) {
      showModal({
        type: "warning",
        title: "No List Selected",
        message: "Please select a list first",
      });
      return;
    }

    if (currentMods.length === 0) {
      showModal({
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
        const result = await apiCall<ModDownloadResult[]>(
          `/api/mod_list/${encodeURIComponent(currentList)}/download_all`,
          { method: "POST" }
        );

        if (result.success && result.data) {
          const successCount = result.data.filter((r) => r.success).length;
          const errorCount = result.data.filter((r) => !r.success).length;

          const newInstalledStatus = { ...installedMods };
          currentMods.forEach((mod) => {
            newInstalledStatus[mod.id] = true;
          });
          setInstalledMods(newInstalledStatus);
          saveInstalledModsToStorage(newInstalledStatus);

          if (errorCount === 0) {
            showModal({
              type: "success",
              title: "Download Complete",
              message: `All ${successCount} mods downloaded successfully!`,
            });
          } else {
            showModal({
              type: "warning",
              title: "Download Completed with Errors",
              message: `${successCount} mods downloaded, ${errorCount} failed`,
            });
          }
        } else {
          showModal({
            type: "error",
            title: "Download Failed",
            message: result.error || "Download failed",
          });
        }
      },
    });
  }, [
    currentList,
    currentMods,
    installedMods,
    saveInstalledModsToStorage,
    showModal,
    showConfirmation,
  ]);

  const removeMod = useCallback(
    async (id: number, modName: string) => {
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
            const newInstalledStatus = { ...installedMods };
            delete newInstalledStatus[id];
            setInstalledMods(newInstalledStatus);
            saveInstalledModsToStorage(newInstalledStatus);
            setCurrentMods((prev) => prev.filter((mod) => mod.id !== id));

            showModal({
              type: "success",
              title: "Mod Removed",
              message:
                result.data?.message ||
                `Mod "${modName}" removed successfully${
                  deleteFiles ? " and files deleted" : ""
                }`,
            });
          } else {
            showModal({
              type: "error",
              title: "Remove Failed",
              message: result.error || "Remove failed",
            });
          }
        },
      });
    },
    [
      currentList,
      installedMods,
      saveInstalledModsToStorage,
      showModal,
      showConfirmation,
    ]
  );

  const addMod = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (!modUrl.trim()) {
        showModal({
          type: "warning",
          title: "Empty URL",
          message: "Please enter a mod URL",
        });
        return;
      }

      if (!currentList) {
        showModal({
          type: "warning",
          title: "No List Selected",
          message: "Please select a list first",
        });
        return;
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
        showModal({
          type: "success",
          title: "Mod Added",
          message: result.data?.message || "Mod added successfully",
        });

        if (
          result.data?.mod &&
          result.data.message !== "Mod already present in the list"
        ) {
          setCurrentMods((prev) => {
            if (prev.some((mod) => mod.id === result.data!.mod!.id)) {
              return prev;
            }
            return [...prev, result.data!.mod!];
          });
        }
        setModUrl("");
      } else {
        showModal({
          type: "error",
          title: "Add Mod Failed",
          message: result.error || "Failed to add mod",
        });
      }
    },
    [modUrl, currentList, showModal]
  );

  // List Management
  const handleListChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const listName = e.target.value;
      if (listName) {
        updateUrlForList(listName);
        loadModsOfList(listName);
      } else {
        updateUrlForList("");
        setCurrentMods([]);
        setSelectedSptVersion("");
        localStorage.removeItem("lastSelectedList");
      }
    },
    [updateUrlForList, loadModsOfList]
  );

  const handleSptVersionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newVersion = e.target.value;
      setSelectedSptVersion(newVersion);
      if (currentList) {
        saveSptVersion(currentList, newVersion);
      }
    },
    [currentList, saveSptVersion]
  );

  const addList = useCallback(
    async (newListName?: string) => {
      let listNameStr = newListName;

      if (!listNameStr) {
        listNameStr = await new Promise<string>((resolve) => {
          showConfirmation({
            title: "Create New List",
            message: "Enter the name for the new list:",
            showInput: true,
            inputPlaceholder: "List name",
            confirmText: "Create",
            cancelText: "Cancel",
            onConfirm: (inputValue: string | undefined) => {
              resolve(inputValue || "");
            },
            onCancel: () => {
              resolve("");
            },
          });
        });
      }

      if (!listNameStr?.trim()) {
        return false;
      }

      const normalizedNewName = listNameStr.toLowerCase();
      const exists = modLists.some(
        (list) => list.toLowerCase() === normalizedNewName
      );
      if (exists) {
        showModal({
          type: "error",
          title: "Name Exists",
          message: "A list with this name already exists",
        });
        return false;
      }

      const result = await apiCall("/api/mod_list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: listNameStr }),
      });

      if (result.success) {
        setModLists((prev) => [...prev, listNameStr]);
        updateUrlForList(listNameStr);
        setCurrentMods([]);

        if (sptVersions.length > 0) {
          setSelectedSptVersion(sptVersions[0].version);
          saveSptVersion(listNameStr, sptVersions[0].version);
        }

        showModal({
          type: "success",
          title: "List Created",
          message: `List "${listNameStr}" created successfully`,
        });
        return true;
      } else {
        showModal({
          type: "error",
          title: "Create Failed",
          message: result.error || "Failed to create list",
        });
        return false;
      }
    },
    [
      modLists,
      sptVersions,
      updateUrlForList,
      saveSptVersion,
      showModal,
      showConfirmation,
    ]
  );

  const renameList = useCallback(
    async (newName?: string) => {
      if (!currentList) {
        showModal({
          type: "warning",
          title: "No List Selected",
          message: "Please select a list first",
        });
        return false;
      }

      let listNameStr = newName;
      if (!listNameStr) {
        listNameStr = await new Promise<string>((resolve) => {
          showConfirmation({
            title: "Rename List",
            message: "Enter the new name for the list:",
            showInput: true,
            inputPlaceholder: "New list name",
            inputDefaultValue: currentList,
            confirmText: "Rename",
            cancelText: "Cancel",
            onConfirm: (inputValue: string | undefined) => {
              resolve(inputValue || "");
            },
            onCancel: () => {
              resolve("");
            },
          });
        });
      }

      if (!listNameStr?.trim()) {
        return false;
      }

      const normalizedNewName = listNameStr.toLowerCase();
      const exists = modLists.some(
        (list) =>
          list.toLowerCase() === normalizedNewName && list !== currentList
      );
      if (exists) {
        showModal({
          type: "error",
          title: "Name Exists",
          message: "A list with this name already exists",
        });
        return false;
      }

      const result = await apiCall("/api/mod_list/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName: currentList, newName: listNameStr }),
      });

      if (result.success) {
        setModLists((prev) =>
          prev.map((name) => (name === currentList ? listNameStr : name))
        );
        updateUrlForList(listNameStr);

        showModal({
          type: "success",
          title: "List Renamed",
          message: `List renamed to "${listNameStr}" successfully`,
        });
        return true;
      } else {
        showModal({
          type: "error",
          title: "Rename Failed",
          message: result.error || "Failed to rename list",
        });
        return false;
      }
    },
    [currentList, modLists, updateUrlForList, showModal, showConfirmation]
  );

  const deleteList = useCallback(async () => {
    if (!currentList) {
      showModal({
        type: "warning",
        title: "No List Selected",
        message: "Please select a list first",
      });
      return;
    }

    showConfirmation({
      title: "Delete List",
      message: `Are you sure you want to delete "${currentList}"?`,
      confirmText: "Delete",
      onConfirm: async () => {
        const result = await apiCall(
          `/api/mod_list/${encodeURIComponent(currentList)}`,
          {
            method: "DELETE",
          }
        );

        if (result.success) {
          setModLists((prev) => prev.filter((name) => name !== currentList));

          if (localStorage.getItem("lastSelectedList") === currentList) {
            localStorage.removeItem("lastSelectedList");
          }

          if (modLists.length > 1) {
            const nextList =
              modLists.find((name) => name !== currentList) || "";
            updateUrlForList(nextList);
            loadModsOfList(nextList);
          } else {
            updateUrlForList("");
            setCurrentMods([]);
          }

          showModal({
            type: "success",
            title: "List Deleted",
            message: `List "${currentList}" deleted successfully`,
          });
        } else {
          showModal({
            type: "error",
            title: "Delete Failed",
            message: result.error || "Failed to delete list",
          });
        }
      },
    });
  }, [
    currentList,
    modLists,
    updateUrlForList,
    loadModsOfList,
    showModal,
    showConfirmation,
  ]);

  const downloadList = useCallback(async () => {
    if (!currentList) {
      showModal({
        type: "warning",
        title: "No List Selected",
        message: "Please select a list first",
      });
      return;
    }

    try {
      const [modsRes, sptRes] = await Promise.all([
        fetch(`/api/mod_list/${encodeURIComponent(currentList)}`),
        fetch(`/api/mod_list/${encodeURIComponent(currentList)}/spt_version`),
      ]);

      if (!modsRes.ok || !sptRes.ok) throw new Error("Error loading list data");

      const modsData = await modsRes.json();
      const sptData = await sptRes.json();

      const listData = {
        listName: currentList,
        exportedAt: new Date().toISOString(),
        selectedSptVersion: sptData.selectedSptVersion,
        mods: modsData,
      };

      const blob = new Blob([JSON.stringify(listData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${currentList}_mods.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showModal({
        type: "success",
        title: "List Exported",
        message: `List "${currentList}" exported successfully`,
      });
    } catch (e) {
      showModal({
        type: "error",
        title: "Export Failed",
        message: "Error exporting list: " + (e as Error).message,
      });
    }
  }, [currentList, showModal]);

  const importList = useCallback(
    async (fileInput?: HTMLInputElement | File) => {
      try {
        let file: File;

        if (!fileInput || !(fileInput instanceof File)) {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".json";

          file = await new Promise<File>((resolve, reject) => {
            input.onchange = (e: Event) => {
              const selectedFile = (e.target as HTMLInputElement).files?.[0];
              if (selectedFile) {
                resolve(selectedFile);
              } else {
                reject(new Error("No file selected"));
              }
            };
            input.oncancel = () =>
              reject(new Error("File selection cancelled"));
            input.click();
          });
        } else {
          file = fileInput as File;
        }

        const text = await file.text();
        const listData = JSON.parse(text);

        const listName = listData.listName || listData.Name;
        const mods = listData.mods || listData.Mods;
        const selectedSptVersion =
          listData.selectedSptVersion || listData.SelectedSptVersion;

        if (!listName || !Array.isArray(mods)) {
          throw new Error(
            "Invalid JSON file format - missing listName/Name or mods/Mods"
          );
        }

        showConfirmation({
          title: "Import List",
          message: `Import list "${listName}" with ${mods.length} mods?`,
          confirmText: "Import",
          onConfirm: async () => {
            await apiCall("/api/mod_list", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: listName }),
            });

            for (const mod of mods) {
              await apiCall(
                `/api/mod_list/${encodeURIComponent(listName)}/add_mod`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    url: mod.detailUrl || mod.url || mod.DetailUrl,
                  }),
                }
              );
            }

            if (selectedSptVersion) {
              await apiCall(
                `/api/mod_list/${encodeURIComponent(listName)}/spt_version`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    sptVersion: selectedSptVersion,
                  }),
                }
              );
            }

            setModLists((prev) => [
              ...prev.filter((name) => name !== listName),
              listName,
            ]);
            updateUrlForList(listName);
            loadModsOfList(listName);

            showModal({
              type: "success",
              title: "Import Successful",
              message: `List "${listName}" imported successfully!`,
            });
          },
        });
      } catch (e) {
        if ((e as Error).message !== "File selection cancelled") {
          showModal({
            type: "error",
            title: "Import Failed",
            message: "Import error: " + (e as Error).message,
          });
        }
      }
    },
    [updateUrlForList, loadModsOfList, showModal, showConfirmation]
  );

  const clearInstalledCache = useCallback(() => {
    showConfirmation({
      title: "Clear Installation Cache",
      message:
        "Clear installed mods cache? You'll need to recheck installation status manually.",
      confirmText: "Clear Cache",
      onConfirm: () => {
        setInstalledMods({});
        saveInstalledModsToStorage({});
        showModal({
          type: "success",
          title: "Cache Cleared",
          message: "Installation cache cleared successfully",
        });
      },
    });
  }, [saveInstalledModsToStorage, showModal, showConfirmation]);

  // Installation Status
  const checkModInstalled = useCallback(
    async (modId: number): Promise<boolean> => {
      if (!currentList) return false;

      const result = await apiCall<{ installed: boolean }>(
        `/api/mod_list/${encodeURIComponent(currentList)}/is_installed/${modId}`
      );

      return result.success && result.data ? result.data.installed : false;
    },
    [currentList]
  );

  const updateAllInstalledStatus = useCallback(async () => {
    if (!currentList || currentMods.length === 0) return;

    const installedStatus: Record<number, boolean> = {};
    for (const mod of currentMods) {
      installedStatus[mod.id] = await checkModInstalled(mod.id);
    }
    setInstalledMods(installedStatus);
    saveInstalledModsToStorage(installedStatus);
  }, [currentList, currentMods, checkModInstalled, saveInstalledModsToStorage]);

  // Effects
  useEffect(() => {
    checkSptUpdate();
    checkFikaUpdate();
  }, []);

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [versionsRes, listsRes] = await Promise.all([
          fetch("/api/spt_versions"),
          fetch("/api/mod_lists"),
        ]);

        const dataVersions = await versionsRes.json();
        const lists = await listsRes.json();

        setSptVersions(dataVersions);
        setModLists(lists);

        if (listName) {
          const matchingList = lists.find(
            (list: string) => list.toLowerCase() === listName.toLowerCase()
          );
          if (matchingList) {
            updateUrlForList(matchingList);
            await loadModsOfList(matchingList);
          }
        } else {
          const savedList = localStorage.getItem("lastSelectedList");
          if (savedList && lists.includes(savedList)) {
            updateUrlForList(savedList);
            await loadModsOfList(savedList);
          }
        }
        setIsInitialLoad(false);
      } catch (e) {
        console.error("Failed to load initial data:", e);
        showModal({
          type: "error",
          title: "Load Failed",
          message: "Failed to load initial data",
        });
        setIsInitialLoad(false);
      }
    }
    loadInitialData();
  }, [listName]);

  useEffect(() => {
    if (currentList && currentMods.length > 0) {
      const currentListModIds = currentMods.map((mod) => mod.id);
      const updatedInstalledMods = { ...installedMods };
      let needsUpdate = false;

      Object.keys(updatedInstalledMods).forEach((modId) => {
        if (!currentListModIds.includes(Number(modId))) {
          delete updatedInstalledMods[Number(modId)];
          needsUpdate = true;
        }
      });

      if (needsUpdate) {
        setInstalledMods(updatedInstalledMods);
        saveInstalledModsToStorage(updatedInstalledMods);
      }
      updateAllInstalledStatus();
    }
  }, [currentList, currentMods]);

  useEffect(() => {
    if (currentList && !isInitialLoad) {
      localStorage.setItem("lastSelectedList", currentList);
    }
  }, [currentList, isInitialLoad]);

  return {
    modLists,
    currentMods,
    sptVersions,
    selectedSptVersion,
    modUrl,
    isInitialLoad,
    installedMods,
    sptUpdate,
    isCheckingSptUpdate,
    isUpdatingSpt,
    fikaUpdate,
    isCheckingFikaUpdate,
    isUpdatingFika,
    currentList,

    setModUrl,
    setSelectedSptVersion,

    handleListChange,
    handleSptVersionChange,
    addList,
    renameList,
    deleteList,
    downloadList,
    importList,
    addMod,
    downloadMod,
    handleUpdateAndDownload,
    clearInstalledCache,
    downloadAllMods,
    removeMod,
    checkAllModUpdates,
    checkSingleModUpdate,
    checkSptUpdate,
    updateSpt,
    checkFikaUpdate,
    updateFika,
    updateAllInstalledStatus,
  };
}
