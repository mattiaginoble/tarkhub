import { useState, useEffect, useCallback, useRef } from "react";
import { useModUpdates } from "./useModUpdates";
import { useInstallStatus } from "./useInstallStatus";
import type { UseModManagerProps, Mod } from "./types";

const normalizeListName = (listName: string): string => {
  if (!listName) return "";
  return listName.charAt(0).toUpperCase() + listName.slice(1).toLowerCase();
};

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

export function useModState({ listName, navigate }: UseModManagerProps) {
  const {
    modLists,
    sptVersions,
    sptUpdate,
    fikaUpdate,
    refreshSptUpdate,
    refreshFikaUpdate,
    refetchModLists,
  } = useModUpdates();

  const [currentMods, setCurrentMods] = useState<Mod[]>([]);
  const [selectedSptVersion, setSelectedSptVersion] = useState<string>("");
  const [modUrl, setModUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentList, setCurrentList] = useState<string>("");

  const initializedRef = useRef(false);
  const navigatingRef = useRef(false);

  const {
    installedMods,
    setModInstalled,
    removeModInstallStatus,
    updateInstalledStatusOnce,
  } = useInstallStatus(currentList, currentMods);

  const loadModsOfList = useCallback(async (listName: string) => {
    if (!listName) {
      setCurrentMods([]);
      setCurrentList("");
      return;
    }

    setIsLoading(true);
    try {
      const result = await apiCall<Mod[]>(
        `/api/mod_list/${encodeURIComponent(listName)}`
      );

      if (result.success && result.data) {
        setCurrentMods(result.data);
        setCurrentList(listName);
      } else {
        setCurrentMods([]);
        setCurrentList(listName);
      }

      const sptResult = await apiCall<{ selectedSptVersion: string }>(
        `/api/mod_list/${encodeURIComponent(listName)}/spt_version`
      );
      if (sptResult.success && sptResult.data) {
        setSelectedSptVersion(sptResult.data.selectedSptVersion);
      }
    } catch {
      setCurrentMods([]);
      setCurrentList(listName);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initializedRef.current) return;

    if (modLists.length > 0 && !currentList) {
      const loadFirstList = async () => {
        const firstList = modLists[0];
        await loadModsOfList(firstList);

        const expectedPath = `/mod/${encodeURIComponent(
          firstList.toLowerCase()
        )}`;
        if (window.location.pathname !== expectedPath) {
          navigatingRef.current = true;
          navigate(expectedPath);
          setTimeout(() => {
            navigatingRef.current = false;
          }, 100);
        }

        localStorage.setItem("lastSelectedList", firstList);
      };

      loadFirstList();
    }
  }, [modLists, currentList, loadModsOfList, navigate]);

  useEffect(() => {
    if (initializedRef.current) return;

    const initializeApp = async () => {
      try {
        setIsLoading(true);

        if (modLists.length === 0) {
          await refetchModLists?.();
        }

        const availableLists = modLists || [];

        if (availableLists.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          await refetchModLists?.();

          const updatedLists = modLists || [];
          if (updatedLists.length === 0) {
            setIsLoading(false);
            initializedRef.current = true;
            return;
          }
        }

        let listToLoad = "";

        if (listName) {
          const normalizedFromUrl = normalizeListName(listName);
          const foundList = availableLists.find(
            (l) => l.toLowerCase() === normalizedFromUrl.toLowerCase()
          );
          if (foundList) {
            listToLoad = foundList;
          }
        }

        if (!listToLoad) {
          const savedList = localStorage.getItem("lastSelectedList");
          if (savedList) {
            const foundList = availableLists.find(
              (l) => l.toLowerCase() === savedList.toLowerCase()
            );
            if (foundList) {
              listToLoad = foundList;
            }
          }
        }

        if (!listToLoad && availableLists.length > 0) {
          listToLoad = availableLists[0];
        }

        if (listToLoad) {
          await loadModsOfList(listToLoad);

          const expectedPath = `/mod/${encodeURIComponent(
            listToLoad.toLowerCase()
          )}`;
          if (
            !navigatingRef.current &&
            window.location.pathname !== expectedPath
          ) {
            navigatingRef.current = true;
            navigate(expectedPath);
            setTimeout(() => {
              navigatingRef.current = false;
            }, 100);
          }

          localStorage.setItem("lastSelectedList", listToLoad);
        }
      } catch (error) {
        console.error("Error initializing app:", error);
      } finally {
        setIsLoading(false);
        initializedRef.current = true;
      }
    };

    initializeApp();
  }, [listName, navigate, loadModsOfList, modLists, refetchModLists]);

  useEffect(() => {
    if (initializedRef.current) return;

    const initializeApp = async () => {
      try {
        setIsLoading(true);

        if (modLists.length === 0) {
          await refetchModLists?.();
        }

        const availableLists = modLists || [];

        let listToLoad = "";

        if (listName) {
          const normalizedFromUrl = normalizeListName(listName);
          const foundList = availableLists.find(
            (l) => l.toLowerCase() === normalizedFromUrl.toLowerCase()
          );
          if (foundList) {
            listToLoad = foundList;
          }
        }

        if (!listToLoad) {
          const savedList = localStorage.getItem("lastSelectedList");
          if (savedList) {
            const foundList = availableLists.find(
              (l) => l.toLowerCase() === savedList.toLowerCase()
            );
            if (foundList) {
              listToLoad = foundList;
            }
          }
        }

        if (!listToLoad && availableLists.length > 0) {
          listToLoad = availableLists[0];
        }

        if (listToLoad) {
          await loadModsOfList(listToLoad);

          const expectedPath = `/mod/${encodeURIComponent(
            listToLoad.toLowerCase()
          )}`;
          if (
            !navigatingRef.current &&
            window.location.pathname !== expectedPath
          ) {
            navigatingRef.current = true;
            navigate(expectedPath);
            setTimeout(() => {
              navigatingRef.current = false;
            }, 100);
          }

          localStorage.setItem("lastSelectedList", listToLoad);
        }
      } catch {
      } finally {
        setIsLoading(false);
        initializedRef.current = true;
      }
    };

    initializeApp();
  }, [listName, navigate, loadModsOfList, modLists, refetchModLists]);

  useEffect(() => {
    if (!initializedRef.current || !listName) return;

    const handleUrlListChange = async () => {
      const availableLists = modLists || [];
      if (availableLists.length === 0) return;

      const normalizedFromUrl = normalizeListName(listName);
      const foundList = availableLists.find(
        (l) => l.toLowerCase() === normalizedFromUrl.toLowerCase()
      );

      if (foundList && foundList !== currentList) {
        await loadModsOfList(foundList);
        localStorage.setItem("lastSelectedList", foundList);
      }
    };

    handleUrlListChange();
  }, [listName, modLists, currentList, loadModsOfList, initializedRef.current]);

  const handleSptVersionChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newVersion = e.target.value;
      setSelectedSptVersion(newVersion);

      if (currentList) {
        await apiCall(
          `/api/mod_list/${encodeURIComponent(currentList)}/spt_version`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sptVersion: newVersion }),
          }
        );
      }
    },
    [currentList]
  );

  return {
    modLists,
    sptVersions,
    sptUpdate,
    fikaUpdate,
    currentMods,
    selectedSptVersion,
    modUrl,
    installedMods,
    currentList,
    isLoading,
    setModUrl,
    setCurrentMods,
    setSelectedSptVersion,
    setCurrentList,
    loadModsOfList,
    handleSptVersionChange,
    updateInstalledStatusOnce,
    setModInstalled,
    removeModInstallStatus,
    refreshSptUpdate,
    refreshFikaUpdate,
    refetchModLists,
  };
}
