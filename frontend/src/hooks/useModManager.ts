import { useModal } from "../components/ModalContext";
import { useModState } from "./useModState";
import { useListManagement } from "./useListManagement";
import { useModCRUD } from "./useModCRUD";
import { useInstallStatus } from "./useInstallStatus";
import { useSPTFikaManagement } from "./useSPTFikaManagement";
import type { UseModManagerProps } from "./types";

export function useModManager(props: UseModManagerProps) {
  const modal = useModal();
  const state = useModState(props);

  const listManagement = useListManagement({
    currentList: state.currentList,
    sptVersions: state.sptVersions,
    onListChange: state.loadModsOfList,
    navigate: props.navigate,
  });

  const installStatus = useInstallStatus(state.currentList, state.currentMods);

  const modCRUD = useModCRUD({
    ...props,
    ...state,
    ...modal,
    installedMods: installStatus.installedMods,
    setModInstalled: installStatus.setModInstalled,
    removeModInstallStatus: installStatus.removeModInstallStatus,
    updateInstalledStatusOnce: installStatus.updateInstalledStatusOnce,
    checkModInstalled: installStatus.checkModInstalled,
  });

  const sptFikaManagement = useSPTFikaManagement();

  return {
    modLists: state.modLists,
    sptVersions: state.sptVersions,
    sptUpdate: state.sptUpdate,
    fikaUpdate: state.fikaUpdate,
    currentMods: state.currentMods,
    selectedSptVersion: state.selectedSptVersion,
    modUrl: state.modUrl,
    installedMods: installStatus.installedMods,
    currentList: state.currentList,

    isLoading: state.isLoading,

    setModUrl: state.setModUrl,

    handleListChange: listManagement.handleListChange,
    handleSptVersionChange: state.handleSptVersionChange,
    addList: listManagement.addList,
    renameList: listManagement.renameList,
    deleteList: listManagement.deleteList,
    downloadList: listManagement.downloadList,
    importList: listManagement.importList,

    addMod: modCRUD.addMod,
    downloadMod: modCRUD.downloadMod,
    handleUpdateAndDownload: modCRUD.handleUpdateAndDownload,
    removeMod: modCRUD.removeMod,

    updateInstalledStatusOnce: installStatus.updateInstalledStatusOnce,
    setModInstalled: installStatus.setModInstalled,

    downloadAllMods: async () => false,
    checkAllModUpdates: async () => {},
    checkSingleModUpdate: async () => null,
    isCheckingSptUpdate: false,
    isCheckingFikaUpdate: false,
    isCheckingModUpdates: false,
    isCheckingAllModUpdates: false,
    isUpdatingSpt: sptFikaManagement.isUpdatingSpt,
    isUpdatingFika: sptFikaManagement.isUpdatingFika,
    checkSptUpdate: sptFikaManagement.checkSptUpdate,
    updateSpt: sptFikaManagement.updateSpt,
    checkFikaUpdate: sptFikaManagement.checkFikaUpdate,
    updateFika: sptFikaManagement.updateFika,
    setSelectedSptVersion: state.setSelectedSptVersion,
    isInitialLoad: false,
  };
}
