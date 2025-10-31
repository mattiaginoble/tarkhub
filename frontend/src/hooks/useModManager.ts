import { useState, useEffect } from "react";
import { NavigateFunction } from "react-router-dom";
import { getVersionMajor } from "../utils/versionUtils";

// Types
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

export interface UseModManagerProps {
  listName?: string;
  navigate: NavigateFunction;
}

export default function useModManager({
  listName,
  navigate,
}: UseModManagerProps) {
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

  // Utility: Storage
  function saveInstalledModsToStorage(modsStatus: Record<number, boolean>) {
    try {
      localStorage.setItem("installedMods", JSON.stringify(modsStatus));
    } catch (e) {
      console.error("Error saving installedMods to localStorage:", e);
    }
  }

  function loadInstalledModsFromStorage(): Record<number, boolean> {
    try {
      const saved = localStorage.getItem("installedMods");
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.error("Error loading installedMods from localStorage:", e);
      return {};
    }
  }

  // SPT Update
  const checkSptUpdate = async () => {
    setIsCheckingSptUpdate(true);
    try {
      const response = await fetch("/api/spt/check-update");
      if (response.ok) {
        const updateInfo = await response.json();
        setSptUpdate(updateInfo);
      }
    } catch (error) {
      console.error("Error checking SPT update:", error);
      alert("❌ Error checking SPT update");
    } finally {
      setIsCheckingSptUpdate(false);
    }
  };

  const updateSpt = async () => {
    if (!sptUpdate?.downloadUrl) return;
    if (
      !window.confirm(
        `Are you sure you want to update SPT from version ${sptUpdate.currentVersion} to ${sptUpdate.latestVersion}? The server will automatically restart.`
      )
    ) {
      return;
    }
    setIsUpdatingSpt(true);
    try {
      const response = await fetch("/api/spt/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ downloadUrl: sptUpdate.downloadUrl }),
      });
      if (response.ok) {
        alert("✅ SPT updated successfully! The server is restarting...");
        setSptUpdate(null);
        setTimeout(() => window.location.reload(), 5000);
      } else {
        const error = await response.json();
        alert(`❌ Update error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error updating SPT:", error);
      alert("❌ Error updating SPT");
    } finally {
      setIsUpdatingSpt(false);
    }
  };

  // Fika Update
  const checkFikaUpdate = async () => {
    setIsCheckingFikaUpdate(true);
    try {
      const response = await fetch("/api/fika/check-update");
      if (response.ok) {
        const updateInfo = await response.json();
        setFikaUpdate(updateInfo);
      }
    } catch (error) {
      console.error("Error checking Fika update:", error);
      alert("❌ Error checking Fika update");
    } finally {
      setIsCheckingFikaUpdate(false);
    }
  };

  const updateFika = async () => {
    if (!fikaUpdate?.downloadUrl) return;
    if (
      !window.confirm(
        `Are you sure you want to update Fika from version ${fikaUpdate.currentVersion} to ${fikaUpdate.latestVersion}? The server will automatically restart.`
      )
    ) {
      return;
    }
    setIsUpdatingFika(true);
    try {
      const response = await fetch("/api/fika/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ downloadUrl: fikaUpdate.downloadUrl }),
      });
      if (response.ok) {
        alert("✅ Fika updated successfully! The server is restarting...");
        setFikaUpdate(null);
        setTimeout(() => window.location.reload(), 5000);
      } else {
        const error = await response.json();
        alert(`❌ Update error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error updating Fika:", error);
      alert("❌ Error updating Fika");
    } finally {
      setIsUpdatingFika(false);
    }
  };

  // List logic
  function getCurrentList(): string {
    if (listName) {
      const matchingList = modLists.find(
        (list) => list.toLowerCase() === listName.toLowerCase()
      );
      return matchingList || "";
    }
    return localStorage.getItem("lastSelectedList") || "";
  }
  const currentList = getCurrentList();

  function updateUrlForList(listName: string) {
    if (listName) {
      const normalizedListName = listName.toLowerCase();
      navigate(`/mod/${encodeURIComponent(normalizedListName)}`);
    } else {
      navigate("/mod");
    }
  }

  // Effects
  useEffect(() => {
    checkSptUpdate();
  }, []);

  useEffect(() => {
    checkFikaUpdate();
  }, []);

  useEffect(() => {
    async function loadInitialData() {
      try {
        const resVersions = await fetch("/api/spt_versions");
        const dataVersions = await resVersions.json();
        setSptVersions(dataVersions);

        const resLists = await fetch("/api/mod_lists");
        const lists = await resLists.json();
        setModLists(lists);

        // Load list by URL param or localStorage
        if (listName) {
          const matchingList = lists.find(
            (list: string) => list.toLowerCase() === listName.toLowerCase()
          );
          if (matchingList) {
            await handleListSelection(matchingList, dataVersions);
          }
        } else {
          const savedList = localStorage.getItem("lastSelectedList");
          if (savedList && lists.includes(savedList)) {
            updateUrlForList(savedList);
            await handleListSelection(savedList, dataVersions);
          }
        }
        setIsInitialLoad(false);
      } catch (e) {
        console.error("Failed to load initial data:", e);
        setIsInitialLoad(false);
      }
    }
    loadInitialData();
    // eslint-disable-next-line
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
    // eslint-disable-next-line
  }, [currentList, currentMods]);

  useEffect(() => {
    if (currentList && !isInitialLoad) {
      localStorage.setItem("lastSelectedList", currentList);
    }
    // eslint-disable-next-line
  }, [currentList, isInitialLoad]);

  // Handlers
  async function handleListSelection(
    listName: string,
    sptVersionsData: SptVersion[]
  ) {
    updateUrlForList(listName);
    try {
      const res = await fetch(`/api/mod_list/${encodeURIComponent(listName)}`);
      const mods: Mod[] = await res.json();
      setCurrentMods(mods);

      const resSpt = await fetch(
        `/api/mod_list/${encodeURIComponent(listName)}/spt_version`
      );
      const sptData = await resSpt.json();
      if (sptData.selectedSptVersion) {
        setSelectedSptVersion(sptData.selectedSptVersion);
      } else if (sptVersionsData.length > 0) {
        setSelectedSptVersion(sptVersionsData[0].version);
      }
    } catch (e) {
      console.error("Failed to load mods for list", listName, e);
      setCurrentMods([]);
    }
  }

  async function loadModsOfList(listName: string) {
    try {
      const res = await fetch(`/api/mod_list/${encodeURIComponent(listName)}`);
      const mods: Mod[] = await res.json();
      setCurrentMods(mods);
      const resSpt = await fetch(
        `/api/mod_list/${encodeURIComponent(listName)}/spt_version`
      );
      const sptData = await resSpt.json();
      if (sptData.selectedSptVersion) {
        setSelectedSptVersion(sptData.selectedSptVersion);
      } else if (sptVersions.length > 0) {
        setSelectedSptVersion(sptVersions[0].version);
      }
      setTimeout(updateAllInstalledStatus, 100);
    } catch (e) {
      console.error("Failed to load mods for list", listName, e);
      setCurrentMods([]);
    }
  }

  async function saveSptVersion(listName: string, version: string) {
    try {
      await fetch(`/api/mod_list/${encodeURIComponent(listName)}/spt_version`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sptVersion: version }),
      });
    } catch (e) {
      console.error("Failed to save SPT version:", e);
    }
  }

  const checkAllModUpdates = async () => {
    if (!currentList) {
      alert("Select a list first!");
      return;
    }
    try {
      const response = await fetch(
        `/api/mod_list/${encodeURIComponent(currentList)}/check_updates`
      );
      if (response.ok) {
        const updatedMods = await response.json();
        if (updatedMods.length > 0) {
          setCurrentMods((prevMods) =>
            prevMods.map((mod) => {
              const updatedMod = updatedMods.find((m: Mod) => m.id === mod.id);
              return updatedMod || mod;
            })
          );
          alert(`🎉 Found ${updatedMods.length} updates available!`);
        } else {
          alert("✅ All mods are up to date!");
        }
      }
    } catch (error) {
      console.error("Error checking updates:", error);
      alert("❌ Error checking updates");
    }
  };

  const checkSingleModUpdate = async (modId: number) => {
    if (!currentList) return null;
    try {
      const response = await fetch(
        `/api/mod_list/${encodeURIComponent(currentList)}/check_update/${modId}`
      );
      if (response.ok) {
        const updatedMod = await response.json();
        if (updatedMod) {
          setCurrentMods((prevMods) =>
            prevMods.map((mod) => (mod.id === modId ? updatedMod : mod))
          );
          return updatedMod;
        } else {
          const currentMod = currentMods.find((m) => m.id === modId);
          return currentMod;
        }
      } else if (response.status === 404) {
        const currentMod = currentMods.find((m) => m.id === modId);
        return currentMod;
      }
    } catch (error) {
      console.error("Error checking update:", error);
      alert("❌ Error checking update");
    }
    return null;
  };

  function handleListChange(e: React.ChangeEvent<HTMLSelectElement>) {
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
  }

  function handleSptVersionChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newVersion = e.target.value;
    setSelectedSptVersion(newVersion);
    if (currentList) {
      saveSptVersion(currentList, newVersion);
    }
  }

  const handleUpdateAndDownload = async (modId: number, modName: string) => {
    if (!currentList) return;
    if (
      !window.confirm(
        `Force update of "${modName}"? The existing version will be overwritten.`
      )
    ) {
      return;
    }
    try {
      const response = await fetch(
        `/api/mod_list/${encodeURIComponent(
          currentList
        )}/force_update/${modId}`,
        { method: "POST" }
      );
      const result = await response.json();
      if (response.ok) {
        alert(`✅ ${result.message}`);
        if (result.mod) {
          setCurrentMods((prevMods) =>
            prevMods.map((mod) => (mod.id === modId ? result.mod : mod))
          );
        }
        const newInstalledStatus = {
          ...installedMods,
          [modId]: true,
        };
        setInstalledMods(newInstalledStatus);
        saveInstalledModsToStorage(newInstalledStatus);
      } else {
        alert(`❌ ${result.error}`);
      }
    } catch (error) {
      console.error("Error in update and download:", error);
      alert("❌ Error in update and download of the mod");
    }
  };

  async function addList() {
    const newListName = prompt("Enter the name for the new list:");
    if (!newListName || newListName.trim() === "") {
      alert("Invalid name.");
      return;
    }
    const normalizedNewName = newListName.toLowerCase();
    const exists = modLists.some(
      (list) => list.toLowerCase() === normalizedNewName
    );
    if (exists) {
      alert("Name already exists (names are not case-sensitive).");
      return;
    }
    try {
      const res = await fetch("/api/mod_list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newListName }),
      });
      if (!res.ok) throw new Error("Error creating list");
      setModLists((prev) => [...prev, newListName]);
      updateUrlForList(newListName);
      setCurrentMods([]);
      if (sptVersions.length > 0) {
        setSelectedSptVersion(sptVersions[0].version);
        saveSptVersion(newListName, sptVersions[0].version);
      }
    } catch (e) {
      alert("Error: " + (e as Error).message);
    }
  }

  async function renameList() {
    if (!currentList) {
      alert("Select a list first!");
      return;
    }
    const newName = prompt("Enter the new name for the list:", currentList);
    if (!newName || newName.trim() === "") {
      alert("Invalid name.");
      return;
    }
    const normalizedNewName = newName.toLowerCase();
    const exists = modLists.some(
      (list) => list.toLowerCase() === normalizedNewName && list !== currentList
    );
    if (exists) {
      alert("Name already exists (names are not case-sensitive).");
      return;
    }
    try {
      const res = await fetch(`/api/mod_list/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName: currentList, newName }),
      });
      if (!res.ok) throw new Error("Error renaming list");
      setModLists((prev) =>
        prev.map((name) => (name === currentList ? newName : name))
      );
      updateUrlForList(newName);
    } catch (e) {
      alert("Error: " + (e as Error).message);
    }
  }

  async function deleteList() {
    if (!currentList) {
      alert("Select a list first!");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete "${currentList}"?`))
      return;
    try {
      const res = await fetch(
        `/api/mod_list/${encodeURIComponent(currentList)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Error deleting list");
      setModLists((prev) => prev.filter((name) => name !== currentList));
      if (localStorage.getItem("lastSelectedList") === currentList) {
        localStorage.removeItem("lastSelectedList");
      }
      if (modLists.length > 1) {
        const nextList = modLists.find((name) => name !== currentList) || "";
        updateUrlForList(nextList);
        loadModsOfList(nextList);
      } else {
        updateUrlForList("");
        setCurrentMods([]);
      }
    } catch (e) {
      alert("Error: " + (e as Error).message);
    }
  }

  async function downloadList() {
    if (!currentList) {
      alert("Select a list first!");
      return;
    }
    try {
      const res = await fetch(
        `/api/mod_list/${encodeURIComponent(currentList)}`
      );
      if (!res.ok) throw new Error("Error loading list");
      const modsData = await res.json();
      const resSpt = await fetch(
        `/api/mod_list/${encodeURIComponent(currentList)}/spt_version`
      );
      const sptData = await resSpt.json();
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
    } catch (e) {
      alert("Error downloading: " + (e as Error).message);
    }
  }

  function importList() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const listData = JSON.parse(text);
        if (!listData.listName || !Array.isArray(listData.mods)) {
          throw new Error("Invalid JSON file");
        }
        if (
          !window.confirm(
            `Import list "${listData.listName}" with ${listData.mods.length} mods?`
          )
        ) {
          return;
        }
        await fetch("/api/mod_list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: listData.listName }),
        });
        for (const mod of listData.mods) {
          await fetch(
            `/api/mod_list/${encodeURIComponent(listData.listName)}/add_mod`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: mod.detailUrl || mod.url }),
            }
          );
        }
        if (listData.selectedSptVersion) {
          await fetch(
            `/api/mod_list/${encodeURIComponent(
              listData.listName
            )}/spt_version`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sptVersion: listData.selectedSptVersion }),
            }
          );
        }
        setModLists((prev) => [
          ...prev.filter((name) => name !== listData.listName),
          listData.listName,
        ]);
        updateUrlForList(listData.listName);
        loadModsOfList(listData.listName);
        alert(`List "${listData.listName}" imported successfully!`);
      } catch (e) {
        alert("Import error: " + (e as Error).message);
      }
    };
    input.click();
  }

  async function addMod(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modUrl.trim()) return;
    if (!currentList) {
      alert("Select a list first!");
      return;
    }
    try {
      const res = await fetch(
        `/api/mod_list/${encodeURIComponent(currentList)}/add_mod`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: modUrl }),
        }
      );
      const result = await res.json();
      if (!res.ok) {
        alert("Error: " + (result.error || "Generic error"));
      } else {
        alert(result.message);
        if (result.message !== "Mod already present in the list") {
          setCurrentMods((prev) => {
            if (prev.some((mod) => mod.id === result.mod.id)) {
              return prev;
            }
            return [...prev, result.mod];
          });
        }
        setModUrl("");
      }
    } catch (err) {
      alert("Fetch error: " + (err as Error).message);
    }
  }

  const downloadMod = async (modId: number, modName: string) => {
    if (!currentList) {
      alert("Select a list first!");
      return;
    }
    if (!window.confirm(`Download and install the mod "${modName}"?`)) {
      return;
    }
    try {
      const response = await fetch(
        `/api/mod_list/${encodeURIComponent(
          currentList
        )}/download_mod/${modId}`,
        { method: "POST" }
      );
      const result = await response.json();
      if (response.ok) {
        alert(`✅ ${result.message}`);
        const newInstalledStatus = {
          ...installedMods,
          [modId]: true,
        };
        setInstalledMods(newInstalledStatus);
        saveInstalledModsToStorage(newInstalledStatus);
      } else {
        alert(`❌ ${result.error}`);
      }
    } catch (error) {
      console.error("Error downloading:", error);
      alert("❌ Error downloading the mod");
    }
  };

  const clearInstalledCache = () => {
    if (
      window.confirm(
        "Are you sure you want to clear the installed mods cache? You'll have to check status manually again."
      )
    ) {
      setInstalledMods({});
      saveInstalledModsToStorage({});
      alert("Cache cleared! Click '🔄 Update Installation Status' to recheck.");
    }
  };

  const downloadAllMods = async () => {
    if (!currentList) {
      alert("Select a list first!");
      return;
    }
    if (currentMods.length === 0) {
      alert("The list is empty!");
      return;
    }
    if (
      !window.confirm(
        `Download and install all ${currentMods.length} mods in the list?`
      )
    ) {
      return;
    }
    try {
      const response = await fetch(
        `/api/mod_list/${encodeURIComponent(currentList)}/download_all`,
        { method: "POST" }
      );
      const results = await response.json();
      if (response.ok) {
        const successCount = results.filter((r: any) => r.success).length;
        const errorCount = results.filter((r: any) => !r.success).length;
        if (errorCount === 0) {
          alert(`✅ All ${successCount} mods downloaded successfully!`);
          const newInstalledStatus = { ...installedMods };
          currentMods.forEach((mod) => {
            newInstalledStatus[mod.id] = true;
          });
          setInstalledMods(newInstalledStatus);
          saveInstalledModsToStorage(newInstalledStatus);
        } else {
          alert(
            `✅ ${successCount} mods downloaded, ❌ ${errorCount} errors. Check console for details.`
          );
          console.log("Download details:", results);
          const newInstalledStatus = { ...installedMods };
          results.forEach((result: any, index: number) => {
            if (result.success && currentMods[index]) {
              newInstalledStatus[currentMods[index].id] = true;
            }
          });
          setInstalledMods(newInstalledStatus);
          saveInstalledModsToStorage(newInstalledStatus);
        }
      } else {
        alert("❌ Error downloading mods");
      }
    } catch (error) {
      console.error("Error downloading:", error);
      alert("❌ Error downloading mods");
    }
  };

  async function removeMod(id: number, modName: string) {
    if (!currentList) return;
    const deleteFiles = window.confirm(
      `Do you want to remove "${modName}" from the list? Also DELETE installation files from /app/spt-server folder?`
    );
    try {
      const url = `/api/mod_list/${encodeURIComponent(
        currentList
      )}/remove_mod/${id}${deleteFiles ? "?deleteFiles=true" : ""}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Error removing mod");
      }
      const result = await res.json();
      const newInstalledStatus = { ...installedMods };
      delete newInstalledStatus[id];
      setInstalledMods(newInstalledStatus);
      saveInstalledModsToStorage(newInstalledStatus);
      setCurrentMods((prev) => prev.filter((mod) => mod.id !== id));
      alert(`✅ ${result.message}`);
    } catch (e) {
      alert("Error: " + (e as Error).message);
    }
  }

  async function checkModInstalled(modId: number): Promise<boolean> {
    if (!currentList) return false;
    try {
      const response = await fetch(
        `/api/mod_list/${encodeURIComponent(currentList)}/is_installed/${modId}`
      );
      if (response.ok) {
        const data = await response.json();
        return data.installed;
      }
    } catch (error) {
      console.error("Error checking mod installation:", error);
    }
    return false;
  }

  async function updateAllInstalledStatus() {
    if (!currentList || currentMods.length === 0) return;
    const installedStatus: Record<number, boolean> = {};
    for (const mod of currentMods) {
      installedStatus[mod.id] = await checkModInstalled(mod.id);
    }
    setInstalledMods(installedStatus);
    saveInstalledModsToStorage(installedStatus);
  }

  // Export all states/handlers
  return {
    modLists,
    currentMods,
    sptVersions,
    selectedSptVersion,
    setSelectedSptVersion,
    modUrl,
    setModUrl,
    isInitialLoad,
    installedMods,
    sptUpdate,
    isCheckingSptUpdate,
    isUpdatingSpt,
    fikaUpdate,
    isCheckingFikaUpdate,
    isUpdatingFika,
    currentList,
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
    getVersionMajor, // from utils
  };
}
