// useListOperations.ts
import { useCallback } from "react";
import { useModal } from "../components/ModalContext";

export function useListOperations(
  currentList: string,
  onListChange: (listName: string) => void,
  onAddList: (newListName?: string) => Promise<boolean>,
  onRenameList: (newName?: string) => Promise<boolean>,
  onDeleteList: () => Promise<void>
) {
  const { showConfirmation } = useModal();

  const handleAddList = useCallback(async () => {
    const newListName = await new Promise<string | undefined>((resolve) => {
      showConfirmation({
        title: "Create New List",
        message: "Enter the name for the new list:",
        showInput: true,
        inputPlaceholder: "List name",
        confirmText: "Create",
        cancelText: "Cancel",
        onConfirm: (inputValue: string | undefined) => {
          resolve(inputValue);
        },
        onCancel: () => {
          resolve(undefined);
        },
      });
    });

    if (newListName?.trim()) {
      const success = await onAddList(newListName);
      if (success) {
        onListChange(newListName);
      }
    }
  }, [onAddList, onListChange, showConfirmation]);

  const handleRenameList = useCallback(async () => {
    if (!currentList) return;

    const newName = await new Promise<string | undefined>((resolve) => {
      showConfirmation({
        title: "Rename List",
        message: "Enter the new name for the list:",
        showInput: true,
        inputPlaceholder: "New list name",
        inputDefaultValue: currentList,
        confirmText: "Rename",
        cancelText: "Cancel",
        onConfirm: (inputValue: string | undefined) => {
          resolve(inputValue);
        },
        onCancel: () => {
          resolve(undefined);
        },
      });
    });

    if (newName?.trim()) {
      const success = await onRenameList(newName);
      if (success) {
        onListChange(newName);
      }
    }
  }, [currentList, onRenameList, onListChange, showConfirmation]);

  const handleDeleteList = useCallback(async () => {
    if (!currentList) return;

    showConfirmation({
      title: "Delete List",
      message: `Are you sure you want to delete "${currentList}"? This action cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      onConfirm: async () => {
        await onDeleteList();
      },
    });
  }, [currentList, onDeleteList, showConfirmation]);

  return {
    handleAddList,
    handleRenameList,
    handleDeleteList,
  };
}
