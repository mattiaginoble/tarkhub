import { useState, useEffect, useCallback, useRef } from "react";
import { Mod } from "./types";

export function useInstallStatus(currentList: string, currentMods: Mod[]) {
  const [installedMods, setInstalledMods] = useState<Record<number, boolean>>(
    loadInstalledModsFromStorage
  );

  const isCheckingRef = useRef(false);
  const lastCheckRef = useRef<number>(0);

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
        return { success: false, error: "Network error" };
      }
    },
    []
  );

  const checkModInstalled = useCallback(
    async (modId: number): Promise<boolean> => {
      if (!currentList) return false;

      const result = await apiCall<{ installed: boolean }>(
        `/api/mod_list/${encodeURIComponent(currentList)}/is_installed/${modId}`
      );

      return result.success && result.data ? result.data.installed : false;
    },
    [currentList, apiCall]
  );

  const updateInstalledStatusOnce = useCallback(async () => {
    if (isCheckingRef.current) return;

    const now = Date.now();
    if (now - lastCheckRef.current < 2000) return;

    if (!currentList || !currentMods.length) return;

    isCheckingRef.current = true;
    lastCheckRef.current = now;

    try {
      const installedStatus: Record<number, boolean> = {};

      const promises = currentMods.map(async (mod) => {
        try {
          installedStatus[mod.id] = await checkModInstalled(mod.id);
        } catch (error) {
          installedStatus[mod.id] = false;
        }
      });

      await Promise.allSettled(promises);

      setInstalledMods(installedStatus);
      saveInstalledModsToStorage(installedStatus);
    } catch (error) {
      console.error("Error updating installed status:", error);
    } finally {
      isCheckingRef.current = false;
    }
  }, [currentList, currentMods, checkModInstalled, saveInstalledModsToStorage]);

  useEffect(() => {
    if (!currentList || currentMods.length === 0) return;

    const currentListModIds = new Set(currentMods.map((mod) => mod.id));

    setInstalledMods((prev) => {
      const updated = { ...prev };
      let needsUpdate = false;

      Object.keys(updated).forEach((modIdStr) => {
        const modId = Number(modIdStr);
        if (!currentListModIds.has(modId)) {
          delete updated[modId];
          needsUpdate = true;
        }
      });

      if (needsUpdate) {
        saveInstalledModsToStorage(updated);
      }

      return needsUpdate ? updated : prev;
    });
  }, [currentList, currentMods, saveInstalledModsToStorage]);

  useEffect(() => {
    if (!currentList || !currentMods.length) return;

    const timeoutId = setTimeout(updateInstalledStatusOnce, 500);
    return () => clearTimeout(timeoutId);
  }, [currentList, currentMods.length, updateInstalledStatusOnce]);

  const setModInstalled = useCallback(
    (modId: number, installed: boolean) => {
      setInstalledMods((prev) => {
        const newStatus = { ...prev, [modId]: installed };
        saveInstalledModsToStorage(newStatus);
        return newStatus;
      });
    },
    [saveInstalledModsToStorage]
  );

  const removeModInstallStatus = useCallback(
    (modId: number) => {
      setInstalledMods((prev) => {
        const newStatus = { ...prev };
        delete newStatus[modId];
        saveInstalledModsToStorage(newStatus);
        return newStatus;
      });
    },
    [saveInstalledModsToStorage]
  );

  return {
    installedMods,
    setModInstalled,
    removeModInstallStatus,
    updateInstalledStatusOnce,
    checkModInstalled,
  };
}
