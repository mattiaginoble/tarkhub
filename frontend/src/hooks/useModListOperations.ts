import { useCallback } from "react";
import { NavigateFunction } from "react-router-dom";
import type { Mod, SptVersion } from "./types";

interface UseModListOperationsProps {
  navigate: NavigateFunction;
  modLists: string[];
  currentList: string;
  currentMods: Mod[];
  sptVersions: SptVersion[];
  loadModsOfList: (listName: string) => Promise<void>;
  setCurrentMods: (mods: Mod[]) => void;
  setCurrentList: (list: string) => void;
  setSelectedSptVersion: (version: string) => void;
  refetchModLists?: () => Promise<any>;
  showModal: (options: any) => void;
  showConfirmation: (options: any) => void;
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

export function useModListOperations({
  navigate,
  modLists,
  currentList,
  currentMods,
  sptVersions,
  loadModsOfList,
  setCurrentMods,
  setCurrentList,
  setSelectedSptVersion,
  refetchModLists,
  showModal,
  showConfirmation,
}: UseModListOperationsProps) {
  const handleListChange = useCallback(
    (newListName: string) => {
      if (!newListName) {
        navigate("/mod");
        setCurrentList("");
        setCurrentMods([]);
        return;
      }

      const targetPath = `/mod/${encodeURIComponent(
        newListName.toLowerCase()
      )}`;
      if (window.location.pathname !== targetPath) {
        navigate(targetPath);
      }

      localStorage.setItem("lastSelectedList", newListName);

      loadModsOfList(newListName);
    },
    [navigate, loadModsOfList, setCurrentList, setCurrentMods]
  );

  const handleListChangeEvent = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      handleListChange(e.target.value);
    },
    [handleListChange]
  );

  const addList = useCallback(
    async (newListName?: string): Promise<boolean> => {
      let listNameStr = newListName;

      if (!listNameStr) {
        return new Promise<boolean>((resolve) => {
          showConfirmation({
            title: "Create New List",
            message: "Enter the name for the new list:",
            showInput: true,
            inputPlaceholder: "List name",
            confirmText: "Create",
            cancelText: "Cancel",
            onConfirm: (inputValue: string | boolean | undefined) => {
              const name = typeof inputValue === "string" ? inputValue : "";
              if (name?.trim()) {
                addList(name).then(resolve);
              } else {
                resolve(false);
              }
            },
            onCancel: () => {
              resolve(false);
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
        await refetchModLists?.();
        handleListChange(listNameStr);

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
    [modLists, handleListChange, showModal, showConfirmation, refetchModLists]
  );

  const renameList = useCallback(
    async (newName?: string): Promise<boolean> => {
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
        await refetchModLists?.();
        handleListChange(listNameStr);

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
    [
      currentList,
      modLists,
      handleListChange,
      showModal,
      showConfirmation,
      refetchModLists,
    ]
  );

  const deleteList = useCallback(async (): Promise<void> => {
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
          await refetchModLists?.();

          const availableLists = modLists || [];
          if (availableLists.length > 0) {
            handleListChange(availableLists[0]);
          } else {
            setCurrentMods([]);
            setCurrentList("");
            navigate("/mod");
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
    handleListChange,
    navigate,
    showModal,
    showConfirmation,
    modLists,
    refetchModLists,
    setCurrentMods,
    setCurrentList,
  ]);

  const downloadList = useCallback(async (): Promise<void> => {
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

  const importList = useCallback(async (): Promise<void> => {
    try {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";

      input.onchange = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
          const text = await file.text();
          const listData = JSON.parse(text);
          const listName = listData.listName || listData.Name;
          const mods = listData.mods || listData.Mods;
          const importedSptVersion =
            listData.selectedSptVersion || listData.SelectedSptVersion;

          if (!listName || !Array.isArray(mods)) {
            throw new Error("Invalid file format");
          }

          showConfirmation({
            title: "Import List",
            message: `Import list "${listName}" with ${mods.length} mods${
              importedSptVersion ? ` for SPT ${importedSptVersion}` : ""
            }?`,
            confirmText: "Import",
            onConfirm: async () => {
              await apiCall("/api/mod_list", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: listName }),
              });

              if (importedSptVersion) {
                await apiCall(
                  `/api/mod_list/${encodeURIComponent(listName)}/spt_version`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sptVersion: importedSptVersion }),
                  }
                );
              }

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

              await refetchModLists?.();

              if (importedSptVersion) {
                setSelectedSptVersion(importedSptVersion);
              }

              handleListChange(listName);

              showModal({
                type: "success",
                title: "Import Successful",
                message: `List "${listName}" imported successfully${
                  importedSptVersion ? ` for SPT ${importedSptVersion}` : ""
                }!`,
              });
            },
          });
        } catch (error) {
          if ((error as Error).message !== "File selection cancelled") {
            showModal({
              type: "error",
              title: "Import Failed",
              message: "Import error: " + (error as Error).message,
            });
          }
        }
      };

      input.click();
    } catch (e) {
      console.error("Import failed:", e);
    }
  }, [
    handleListChange,
    showModal,
    showConfirmation,
    refetchModLists,
    setSelectedSptVersion,
  ]);

  return {
    handleListChange: handleListChangeEvent,
    addList,
    renameList,
    deleteList,
    downloadList,
    importList,
  };
}
