import { useState, useCallback } from "react";
import { useModal } from "../components/ModalContext";
import { useModUpdates } from "./useModUpdates";

export function useSPTFikaManagement() {
  const { showModal, showConfirmation } = useModal();
  const { sptUpdate, fikaUpdate, refreshSptUpdate, refreshFikaUpdate } =
    useModUpdates();

  const [isUpdatingSpt, setIsUpdatingSpt] = useState<boolean>(false);
  const [isUpdatingFika, setIsUpdatingFika] = useState<boolean>(false);

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

  const checkSptUpdate = useCallback(async () => {
    refreshSptUpdate();
  }, [refreshSptUpdate]);

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
          showTimedModal({
            type: "success",
            title: "SPT Updated",
            message: "SPT updated successfully! Server restarting...",
            duration: 5000,
          });
          refreshSptUpdate();
          setTimeout(() => window.location.reload(), 5000);
        } else {
          showTimedModal({
            type: "error",
            title: "SPT Update Failed",
            message: result.error || "Update failed",
          });
        }
        setIsUpdatingSpt(false);
      },
    });
  }, [sptUpdate, showModal, showConfirmation, refreshSptUpdate]);

  const checkFikaUpdate = useCallback(async () => {
    refreshFikaUpdate();
  }, [refreshFikaUpdate]);

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
          showTimedModal({
            type: "success",
            title: "Fika Updated",
            message: "Fika updated successfully! Server restarting...",
            duration: 5000,
          });
          refreshFikaUpdate();
          setTimeout(() => window.location.reload(), 5000);
        } else {
          showTimedModal({
            type: "error",
            title: "Fika Update Failed",
            message: result.error || "Update failed",
          });
        }
        setIsUpdatingFika(false);
      },
    });
  }, [fikaUpdate, showModal, showConfirmation, refreshFikaUpdate]);

  return {
    isUpdatingSpt,
    isUpdatingFika,

    checkSptUpdate,
    updateSpt,

    checkFikaUpdate,
    updateFika,
  };
}
