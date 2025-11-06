// useListManagement.ts
import { useCallback } from "react";
import { useModal } from "../components/ModalContext";
import { useModUpdates } from "./useModUpdates";
import type { SptVersion } from "./types";

interface UseListManagementProps {
  currentList: string;
  sptVersions: SptVersion[];
  onListChange: (listName: string) => void;
  onSptVersionChange?: (listName: string, version: string) => void;
  navigate: any;
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
    return { success: false, error: "Network error" };
  }
};

export function useListManagement({
  currentList,
  sptVersions,
  onListChange,
  onSptVersionChange,
  navigate,
}: UseListManagementProps) {
  const { showModal, showConfirmation } = useModal();
  const { modLists, refetchModLists } = useModUpdates();

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

  const handleListChange = useCallback(
    (newListName: string | React.ChangeEvent<HTMLSelectElement>) => {
      let listName: string;

      if (typeof newListName === "string") {
        listName = newListName;
      } else if (newListName && newListName.target) {
        listName = newListName.target.value;
      } else {
        return;
      }

      if (!listName) {
        navigate("/mod");
        return;
      }

      const targetPath = `/mod/${encodeURIComponent(
        typeof listName === "string"
          ? listName.toLowerCase()
          : String(listName).toLowerCase()
      )}`;

      if (window.location.pathname !== targetPath) {
        navigate(targetPath);
      }

      localStorage.setItem("lastSelectedList", listName);
      onListChange(listName);
    },
    [navigate, onListChange]
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
            onConfirm: (inputValue: string | undefined) => {
              const name = inputValue || "";
              if (name.trim()) {
                addList(name).then(resolve);
              } else {
                resolve(false);
              }
            },
            onCancel: () => resolve(false),
          });
        });
      }

      if (!listNameStr.trim()) return false;

      const normalizedNewName = listNameStr.toLowerCase();
      const exists = modLists.some(
        (list) => list.toLowerCase() === normalizedNewName
      );

      if (exists) {
        showTimedModal({
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
        await refetchModLists();
        handleListChange(listNameStr);

        if (sptVersions.length > 0 && onSptVersionChange) {
          onSptVersionChange(listNameStr, sptVersions[0].version);
        }

        showTimedModal({
          type: "success",
          title: "List Created",
          message: `List "${listNameStr}" created successfully`,
        });
        return true;
      } else {
        showTimedModal({
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
      handleListChange,
      showConfirmation,
      refetchModLists,
      onSptVersionChange,
    ]
  );

  const renameList = useCallback(
    async (newName?: string): Promise<boolean> => {
      if (!currentList) {
        showTimedModal({
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
            onConfirm: (inputValue: string | undefined) =>
              resolve(inputValue || ""),
            onCancel: () => resolve(""),
          });
        });
      }

      if (!listNameStr.trim()) return false;

      const normalizedNewName = listNameStr.toLowerCase();
      const exists = modLists.some(
        (list) =>
          list.toLowerCase() === normalizedNewName && list !== currentList
      );

      if (exists) {
        showTimedModal({
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
        await refetchModLists();
        handleListChange(listNameStr);

        showTimedModal({
          type: "success",
          title: "List Renamed",
          message: `List renamed to "${listNameStr}" successfully`,
        });
        return true;
      } else {
        showTimedModal({
          type: "error",
          title: "Rename Failed",
          message: result.error || "Failed to rename list",
        });
        return false;
      }
    },
    [currentList, modLists, handleListChange, showConfirmation, refetchModLists]
  );

  const deleteList = useCallback(async (): Promise<void> => {
    if (!currentList) {
      showTimedModal({
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
          { method: "DELETE" }
        );

        if (result.success) {
          await refetchModLists();

          const availableLists = modLists.filter(
            (name) => name !== currentList
          );
          if (availableLists.length > 0) {
            handleListChange(availableLists[0]);
          } else {
            handleListChange("");
          }

          showTimedModal({
            type: "success",
            title: "List Deleted",
            message: `List "${currentList}" deleted successfully`,
          });
        } else {
          showTimedModal({
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
    handleListChange,
    showConfirmation,
    refetchModLists,
  ]);

  const importList = useCallback(async (): Promise<void> => {
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

            await refetchModLists();
            handleListChange(listName);

            showTimedModal({
              type: "success",
              title: "Import Successful",
              message: `List "${listName}" imported successfully!`,
            });
          },
        });
      } catch (error) {
        showTimedModal({
          type: "error",
          title: "Import Failed",
          message: "Import error: " + (error as Error).message,
        });
      }
    };

    input.click();
  }, [handleListChange, showConfirmation, refetchModLists]);

  const downloadList = useCallback(async (): Promise<void> => {
    if (!currentList) {
      showTimedModal({
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

      showTimedModal({
        type: "success",
        title: "List Exported",
        message: `List "${currentList}" exported successfully`,
      });
    } catch (e) {
      showTimedModal({
        type: "error",
        title: "Export Failed",
        message: "Error exporting list: " + (e as Error).message,
      });
    }
  }, [currentList]);

  return {
    handleListChange,
    addList,
    renameList,
    deleteList,
    importList,
    downloadList,
  };
}
