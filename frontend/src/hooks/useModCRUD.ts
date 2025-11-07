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

interface ModDownloadResponse {
  success: boolean;
  message?: string;
  error?: string;
  requiresUserChoice?: boolean;
  TempExtractPath?: string;
  ModName?: string;
}

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
  const handleModStructureChoice = useCallback(
    (modName: string, tempExtractPath: string, onComplete: () => void) => {
      let choiceMade = false;

      const completeInstallation = async (installAsServerMod: boolean) => {
        if (choiceMade) return;
        choiceMade = true;

        const modType = installAsServerMod ? "Server" : "Client";

        try {
          const result = await apiCall(
            `/api/mod_list/${encodeURIComponent(
              currentList
            )}/complete_installation`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                modName,
                tempExtractPath,
                installAsServerMod,
              }),
            }
          );

          if (result.success) {
            showModal({
              type: "success",
              title: "Installazione Completata",
              message: `Mod installata con successo come ${modType} Mod`,
            });
            onComplete();
          } else {
            console.error(
              `❌ ${modType} mod installation failed:`,
              result.error
            );
            showModal({
              type: "error",
              title: "Installazione Fallita",
              message: result.error || "Installazione fallita",
            });
          }
        } catch (error) {
          console.error(`💥 Error completing ${modType} installation:`, error);
          showModal({
            type: "error",
            title: "Installazione Fallita",
            message: "Errore durante l'installazione",
          });
        }
      };

      showConfirmation({
        title: "Scelta Installazione Mod",
        message: `La mod "${modName}" non ha una struttura standard. Dove vuoi installarla?`,
        cancelText: "Mod Server (SPT/user/mods)",
        confirmText: "Mod Client (BepInEx/plugins)",
        onConfirm: () => completeInstallation(false),
        onCancel: () => completeInstallation(true),
      });
    },
    [currentList, showModal, showConfirmation]
  );

  const handleAddMod = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!modUrl.trim() || !currentList) {
        showModal({
          type: "warning",
          title: "URL Vuoto",
          message: "Inserisci un URL della mod",
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
                title: "Mod Già Presente",
                message: `La mod "${result.data.mod.name}" è già nella lista`,
              });
              return prev;
            }
            showModal({
              type: "success",
              title: "Mod Aggiunta",
              message: `Mod "${result.data.mod.name}" aggiunta con successo`,
            });
            return [...prev, result.data.mod];
          });
          setModUrl("");
          return true;
        } else {
          showModal({
            type: "error",
            title: "Aggiunta Mod Fallita",
            message: result.error || "Impossibile aggiungere la mod",
          });
          return false;
        }
      } catch (error) {
        console.error("Add mod failed:", error);
        showModal({
          type: "error",
          title: "Aggiunta Mod Fallita",
          message: "Errore durante l'aggiunta della mod",
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
          title: "Nessuna Lista Selezionata",
          message: "Seleziona prima una lista",
        });
        return;
      }

      const isInstalled = installedMods[id] || false;

      showConfirmation({
        title: "Rimuovi Mod",
        message: `Rimuovere "${modName}" dalla lista?${
          isInstalled
            ? " Puoi anche scegliere di eliminare i file installati."
            : ""
        }`,
        cancelText: "Annulla",
        confirmText: "Rimuovi dalla Lista",
        showDeleteOption: isInstalled,
        deleteOptionText: "Elimina anche i file installati",
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
                title: "Mod Rimossa",
                message: `Mod "${modName}" rimossa con successo${
                  shouldDeleteFiles ? " e file eliminati" : ""
                }`,
              });
            } else {
              showModal({
                type: "error",
                title: "Rimozione Fallita",
                message: result.error || `Impossibile rimuovere "${modName}"`,
              });
            }
          } catch (error) {
            console.error("Remove mod failed:", error);
            showModal({
              type: "error",
              title: "Rimozione Fallita",
              message: `Errore durante la rimozione di "${modName}"`,
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
          title: "Nessuna Lista Selezionata",
          message: "Seleziona prima una lista",
        });
        return false;
      }

      try {
        const result = await apiCall<any>(
          `/api/mod_list/${encodeURIComponent(
            currentList
          )}/download_mod/${modId}`,
          { method: "POST" }
        );

        if (
          result.data?.requiresUserChoice === true &&
          result.data.tempExtractPath
        ) {
          handleModStructureChoice(
            result.data.modName || modName,
            result.data.tempExtractPath,
            () => {
              setModInstalled(modId, true);
              if (updateInstalledStatusOnce) {
                setTimeout(() => {
                  updateInstalledStatusOnce();
                }, 500);
              }
            }
          );
          return false;
        } else if (result.success && result.data?.success !== false) {
          setModInstalled(modId, true);
          if (updateInstalledStatusOnce) {
            setTimeout(() => {
              updateInstalledStatusOnce();
            }, 500);
          }
          showModal({
            type: "success",
            title: "Download Completato",
            message:
              result.data?.message || `Mod "${modName}" scaricata con successo`,
          });
          return true;
        } else {
          console.error("❌ Download failed:", result.error);
          showModal({
            type: "error",
            title: "Download Fallito",
            message: result.error || `Impossibile scaricare "${modName}"`,
          });
          return false;
        }
      } catch (error) {
        console.error("💥 Download failed with exception:", error);
        showModal({
          type: "error",
          title: "Download Fallito",
          message: `Errore durante il download di "${modName}"`,
        });
        return false;
      }
    },
    [
      currentList,
      setModInstalled,
      showModal,
      updateInstalledStatusOnce,
      handleModStructureChoice,
    ]
  );

  const handleUpdateAndDownload = useCallback(
    async (modId: number, modName: string) => {
      if (!currentList) {
        showModal({
          type: "warning",
          title: "Nessuna Lista Selezionata",
          message: "Seleziona prima una lista",
        });
        return;
      }

      showConfirmation({
        title: "Aggiorna Mod Forzatamente",
        message: `Aggiornare forzatamente "${modName}"? La versione esistente verrà sovrascritta.`,
        confirmText: "Aggiorna",
        onConfirm: async () => {
          try {
            const result = await apiCall<ModDownloadResponse>(
              `/api/mod_list/${encodeURIComponent(
                currentList
              )}/force_update/${modId}`,
              { method: "POST" }
            );

            if (
              result.success ||
              (result.data?.requiresUserChoice && result.data.TempExtractPath)
            ) {
              if (
                result.data?.requiresUserChoice &&
                result.data.TempExtractPath
              ) {
                handleModStructureChoice(
                  modName,
                  result.data.TempExtractPath,
                  async () => {
                    setModInstalled(modId, true);
                    if (updateInstalledStatusOnce) {
                      await updateInstalledStatusOnce();
                    }
                    await loadModsOfList(currentList);
                  }
                );
              } else {
                setModInstalled(modId, true);
                if (updateInstalledStatusOnce) {
                  await updateInstalledStatusOnce();
                }
                await loadModsOfList(currentList);
                showModal({
                  type: "success",
                  title: "Aggiornamento Completato",
                  message: `Mod "${modName}" aggiornata con successo`,
                });
              }
            } else {
              showModal({
                type: "error",
                title: "Aggiornamento Fallita",
                message: result.error || `Impossibile aggiornare "${modName}"`,
              });
            }
          } catch (error) {
            console.error("Update failed:", error);
            showModal({
              type: "error",
              title: "Aggiornamento Fallita",
              message: `Errore durante l'aggiornamento di "${modName}"`,
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
      handleModStructureChoice,
    ]
  );

  return {
    addMod: handleAddMod,
    downloadMod: handleDownloadMod,
    handleUpdateAndDownload,
    removeMod: handleRemoveMod,
  };
}
