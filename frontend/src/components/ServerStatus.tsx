import React, { useState, useEffect, useRef } from "react";
import {
  RefreshCwIcon,
  WifiIcon,
  WifiOffIcon,
  AlertCircleIcon,
} from "lucide-react";
import { useModal } from "../components/ModalContext";

interface ServerStatusProps {
  onRefresh?: () => Promise<void>;
  isChecking?: boolean;
}

interface ServerStatusInfo {
  sptVersion: string;
  isRunning: boolean;
  players: string;
  uptime: string;
  timestamp: string;
}

interface UpdateInfo {
  sptUpdateAvailable: boolean;
  fikaUpdateAvailable: boolean;
  modUpdatesAvailable: boolean;
  sptLatestVersion?: string;
  fikaLatestVersion?: string;
  modUpdateCount?: number;
}

const ServerStatus: React.FC<ServerStatusProps> = ({
  onRefresh,
  isChecking = false,
}) => {
  const { showModal } = useModal();
  const [serverInfo, setServerInfo] = useState<ServerStatusInfo>({
    sptVersion: "unknown",
    uptime: "0s",
    players: "0/0",
    isRunning: false,
    timestamp: new Date().toISOString(),
  });

  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>({
    sptUpdateAvailable: false,
    fikaUpdateAvailable: false,
    modUpdatesAvailable: false,
  });

  const [isSpinning, setIsSpinning] = useState(false);
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

  const checkSptUpdate = async () => {
    try {
      const response = await fetch("/api/spt/check-update");
      if (response.ok) {
        const data = await response.json();
        setUpdateInfo((prev) => ({
          ...prev,
          sptUpdateAvailable: data.updateAvailable,
          sptLatestVersion: data.latestVersion,
        }));
      }
    } catch (error) {
      console.error("Error checking SPT update:", error);
    }
  };

  const checkFikaUpdate = async () => {
    try {
      const response = await fetch("/api/fika/check-update");
      if (response.ok) {
        const data = await response.json();
        setUpdateInfo((prev) => ({
          ...prev,
          fikaUpdateAvailable: data.updateAvailable,
          fikaLatestVersion: data.latestVersion,
        }));
      }
    } catch (error) {
      console.error("Error checking Fika update:", error);
    }
  };

  const checkModUpdates = async () => {
    try {
      const listsResponse = await fetch("/api/mod_lists");
      if (!listsResponse.ok) return;

      const listNames: string[] = await listsResponse.json();
      let totalUpdateCount = 0;

      for (const listName of listNames) {
        const updatesResponse = await fetch(
          `/api/mod_list/${listName}/check_updates`
        );
        if (updatesResponse.ok) {
          const updatedMods = await updatesResponse.json();
          totalUpdateCount += updatedMods.filter(
            (mod: any) => mod.updateAvailable
          ).length;
        }
      }

      setUpdateInfo((prev) => ({
        ...prev,
        modUpdatesAvailable: totalUpdateCount > 0,
        modUpdateCount: totalUpdateCount,
      }));
    } catch (error) {
      console.error("Error checking mod updates:", error);
    }
  };

  const checkAllUpdates = async () => {
    await Promise.all([checkSptUpdate(), checkFikaUpdate(), checkModUpdates()]);
  };

  useEffect(() => {
    fetchServerStatus();
    const statusInterval = setInterval(fetchServerStatus, 10000);
    return () => clearInterval(statusInterval);
  }, []);

  useEffect(() => {
    checkAllUpdates();
  }, []);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  const handleRefresh = async () => {
    setIsSpinning(true);

    try {
      if (onRefresh) await onRefresh();
      await Promise.all([fetchServerStatus(), checkAllUpdates()]);

      const hasUpdates =
        updateInfo.sptUpdateAvailable ||
        updateInfo.fikaUpdateAvailable ||
        updateInfo.modUpdatesAvailable;

      let message = "All components are up to date.";
      let modalType: "success" | "info" = "success";

      if (hasUpdates) {
        const updates = [];
        if (updateInfo.sptUpdateAvailable) updates.push("SPT");
        if (updateInfo.fikaUpdateAvailable) updates.push("Fika");
        if (updateInfo.modUpdatesAvailable)
          updates.push(`${updateInfo.modUpdateCount} mods`);

        message = `Refresh completed. Updates available for: ${updates.join(
          ", "
        )}`;
        modalType = "info";
      }

      showModal({
        type: modalType,
        title: "Refresh Completed",
        message,
        duration: 4000,
      });
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
      }, 2000);
    }
  };

  const showSpinning = isSpinning || isChecking;

  return (
    <div className="server-status-compact">
      <div className="server-status-header-compact">
        <div className="server-title-compact">
          <h3>Server Status</h3>
        </div>
        <button
          className="refresh-btn-compact"
          onClick={handleRefresh}
          disabled={showSpinning}
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
            {updateInfo.sptUpdateAvailable && (
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
