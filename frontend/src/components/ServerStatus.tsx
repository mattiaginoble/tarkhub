import React, { useState, useEffect, useRef } from "react";
import {
  RefreshCwIcon,
  WifiIcon,
  WifiOffIcon,
  AlertCircleIcon,
} from "lucide-react";
import { useModal } from "../components/ModalContext";
import { useModUpdates } from "../hooks/useModUpdates";
import { Mod } from "../hooks/types";

interface ServerStatusProps {
  onRefresh?: () => Promise<void>;
  isChecking?: boolean;
  currentList?: string;
  onCheckModUpdates?: () => Promise<void>;
  onUpdateInstalledStatus?: () => Promise<void>;
}

interface ServerStatusInfo {
  sptVersion: string;
  isRunning: boolean;
  players: string;
  uptime: string;
  timestamp: string;
}

const normalizeListName = (listName: string): string => {
  if (!listName) return "";
  return listName.charAt(0).toUpperCase() + listName.slice(1).toLowerCase();
};

const ServerStatus: React.FC<ServerStatusProps> = ({
  isChecking = false,
  currentList,
  onCheckModUpdates,
  onUpdateInstalledStatus,
}) => {
  const { showModal } = useModal();
  const [serverInfo, setServerInfo] = useState<ServerStatusInfo>({
    sptVersion: "unknown",
    uptime: "0s",
    players: "0/0",
    isRunning: false,
    timestamp: new Date().toISOString(),
  });

  const normalizedCurrentList = currentList
    ? normalizeListName(currentList)
    : "";

  const {
    sptUpdate,
    fikaUpdate,
    modUpdates,
    refreshSptUpdate,
    refreshFikaUpdate,
    refreshModUpdates,
    isCheckingSptUpdate,
    isCheckingFikaUpdate,
    isCheckingModUpdates,
  } = useModUpdates(normalizedCurrentList);

  const [isSpinning, setIsSpinning] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimeoutRef = useRef<number>();

  const fetchServerStatus = async () => {
    try {
      const response = await fetch("/api/server/status");
      if (response.ok) {
        const data: ServerStatusInfo = await response.json();
        setServerInfo(data);
      } else {
        setServerInfo((prev) => ({
          ...prev,
          isRunning: false,
          players: "0/0",
        }));
      }
    } catch (error) {
      console.error("Error fetching server status:", error);
      setServerInfo((prev) => ({ ...prev, isRunning: false, players: "0/0" }));
    }
  };

  useEffect(() => {
    fetchServerStatus();
    const statusInterval = setInterval(fetchServerStatus, 30000);
    return () => clearInterval(statusInterval);
  }, []);

  const handleRefresh = async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    setIsSpinning(true);

    try {
      const refreshPromises = [];

      refreshPromises.push(refreshSptUpdate());
      refreshPromises.push(refreshFikaUpdate());

      refreshPromises.push(fetchServerStatus());

      if (normalizedCurrentList) {
        refreshPromises.push(refreshModUpdates(normalizedCurrentList));

        if (onUpdateInstalledStatus) {
          refreshPromises.push(
            new Promise((resolve) => {
              setTimeout(async () => {
                await onUpdateInstalledStatus();
                resolve(void 0);
              }, 1000);
            })
          );
        }
      }

      await Promise.all(refreshPromises);

      const sptUpdates = sptUpdate?.updateAvailable ? 1 : 0;
      const fikaUpdates = fikaUpdate?.updateAvailable ? 1 : 0;
      const modUpdatesCount = modUpdates.filter(
        (mod: Mod) => mod.updateAvailable
      ).length;

      const totalUpdates = sptUpdates + fikaUpdates + modUpdatesCount;

      if (totalUpdates > 0) {
        const updates = [];
        if (sptUpdates > 0) updates.push("SPT");
        if (fikaUpdates > 0) updates.push("Fika");
        if (modUpdatesCount > 0) updates.push(`${modUpdatesCount} mods`);

        showModal({
          type: "info",
          title: "Updates Available",
          message: `Found updates for: ${updates.join(", ")}`,
          duration: 5000,
        });
      } else {
        showModal({
          type: "success",
          title: "All Up to Date",
          message: "No updates available for SPT, Fika, or mods",
          duration: 3000,
        });
      }
    } catch (error) {
      console.error("Refresh error:", error);
      showModal({
        type: "error",
        title: "Refresh Failed",
        message: "An error occurred during refresh",
        duration: 3000,
      });
    } finally {
      refreshTimeoutRef.current = window.setTimeout(() => {
        setIsSpinning(false);
        setIsRefreshing(false);
      }, 1000);
    }
  };

  const showSpinning =
    isSpinning ||
    isCheckingSptUpdate ||
    isCheckingFikaUpdate ||
    isCheckingModUpdates;

  return (
    <div className="server-status-compact">
      <div className="server-status-header-compact">
        <div className="server-title-compact">
          <h3>Server Status</h3>
        </div>
        <button
          className="refresh-btn-compact"
          onClick={handleRefresh}
          disabled={showSpinning || isRefreshing}
          title="Check for SPT, Fika, and mod updates"
        >
          <RefreshCwIcon size={18} className={showSpinning ? "spinning" : ""} />
        </button>
      </div>

      <div className="server-stats-compact">
        <div className="stat-item-compact">
          <div className="stat-label-compact">Status</div>
          <div
            className={`stat-value-compact status-${
              serverInfo.isRunning ? "online" : "offline"
            }`}
          >
            {serverInfo.isRunning ? (
              <WifiIcon size={16} />
            ) : (
              <WifiOffIcon size={16} />
            )}
            {serverInfo.isRunning ? "Online" : "Offline"}
          </div>
        </div>

        <div className="stat-item-compact">
          <div className="stat-label-compact">Version</div>
          <div className="stat-value-compact version-info">
            {sptUpdate?.updateAvailable && (
              <AlertCircleIcon size={16} className="version-alert-icon" />
            )}
            <span>{serverInfo.sptVersion}</span>
          </div>
        </div>
        <div className="stat-item-compact">
          <div className="stat-label-compact">Uptime</div>
          <div className="stat-value-compact">{serverInfo.uptime}</div>
        </div>

        <div className="stat-item-compact">
          <div className="stat-label-compact">Players</div>
          <div className="stat-value-compact">{serverInfo.players}</div>
        </div>
      </div>
    </div>
  );
};

export default ServerStatus;
