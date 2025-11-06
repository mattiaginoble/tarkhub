import React from "react";
import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Mod, SptVersion, UpdateInfo } from "./types";

export const modUpdateKeys = {
  all: ["mod-updates"] as const,
  lists: () => [...modUpdateKeys.all, "lists"] as const,
  list: (listName: string) => [...modUpdateKeys.lists(), listName] as const,
  sptUpdate: () => [...modUpdateKeys.all, "spt-update"] as const,
  fikaUpdate: () => [...modUpdateKeys.all, "fika-update"] as const,
  sptVersions: () => [...modUpdateKeys.all, "spt-versions"] as const,
  modLists: () => [...modUpdateKeys.all, "mod-lists"] as const,
};

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

export const useModUpdates = (listName?: string) => {
  const queryClient = useQueryClient();
  const hookInstanceId = React.useRef(
    Math.random().toString(36).substring(2, 8)
  );

  const normalizedListName = listName ? normalizeListName(listName) : "";

  const sptVersionsQuery = useQuery({
    queryKey: modUpdateKeys.sptVersions(),
    queryFn: async () => {
      const result = await apiCall<SptVersion[]>("/api/spt_versions");
      if (!result.success) throw new Error(result.error);
      return result.data || [];
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const modListsQuery = useQuery({
    queryKey: modUpdateKeys.modLists(),
    queryFn: async () => {
      const result = await apiCall<string[]>("/api/mod_lists");
      if (!result.success) throw new Error(result.error);
      return result.data || [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const sptUpdateQuery = useQuery({
    queryKey: modUpdateKeys.sptUpdate(),
    queryFn: async () => {
      const result = await apiCall<UpdateInfo>("/api/spt/check-update");
      if (!result.success) throw new Error(result.error);
      return result.data || null;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });

  const fikaUpdateQuery = useQuery({
    queryKey: modUpdateKeys.fikaUpdate(),
    queryFn: async () => {
      const result = await apiCall<UpdateInfo>("/api/fika/check-update");
      if (!result.success) throw new Error(result.error);
      return result.data || null;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });

  const modUpdatesQuery = useQuery({
    queryKey: modUpdateKeys.list(normalizedListName),
    queryFn: async () => {
      if (!normalizedListName) return [];

      const result = await apiCall<Mod[]>(
        `/api/mod_list/${encodeURIComponent(normalizedListName)}/check_updates`
      );

      if (!result.success) throw new Error(result.error);
      return result.data || [];
    },
    enabled: !!normalizedListName,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });

  const checkAllModUpdatesMutation = useMutation({
    mutationFn: async (targetListName: string) => {
      const normalizedTarget = normalizeListName(targetListName);
      const result = await apiCall<Mod[]>(
        `/api/mod_list/${encodeURIComponent(normalizedTarget)}/check_updates`
      );
      if (!result.success) throw new Error(result.error);
      return result.data || [];
    },
    onSuccess: (data: Mod[], listName: string) => {
      const normalized = normalizeListName(listName);
      queryClient.setQueryData(modUpdateKeys.list(normalized), data);
    },
  });

  const checkSingleModUpdateMutation = useMutation({
    mutationFn: async ({
      listName,
      modId,
    }: {
      listName: string;
      modId: number;
    }) => {
      const normalized = normalizeListName(listName);
      const result = await apiCall<Mod>(
        `/api/mod_list/${encodeURIComponent(normalized)}/check_update/${modId}`
      );
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (
      updatedMod: Mod | undefined,
      variables: { listName: string; modId: number }
    ) => {
      if (updatedMod) {
        const normalized = normalizeListName(variables.listName);
        queryClient.setQueryData(
          modUpdateKeys.list(normalized),
          (old: Mod[] | undefined) =>
            old?.map((mod) =>
              mod.id === variables.modId ? updatedMod : mod
            ) || []
        );
      }
    },
  });

  const refreshSptUpdate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: modUpdateKeys.sptUpdate() });
  }, [queryClient]);

  const refreshFikaUpdate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: modUpdateKeys.fikaUpdate() });
  }, [queryClient]);

  const refreshModUpdates = useCallback(
    (targetListName: string) => {
      const normalized = normalizeListName(targetListName);
      queryClient.invalidateQueries({
        queryKey: modUpdateKeys.list(normalized),
      });
    },
    [queryClient]
  );

  return {
    sptVersions: sptVersionsQuery.data || [],
    modLists: modListsQuery.data || [],
    sptUpdate: sptUpdateQuery.data || null,
    fikaUpdate: fikaUpdateQuery.data || null,
    modUpdates: modUpdatesQuery.data || [],

    isLoading: sptVersionsQuery.isLoading || modListsQuery.isLoading,
    isCheckingSptUpdate: sptUpdateQuery.isFetching,
    isCheckingFikaUpdate: fikaUpdateQuery.isFetching,
    isCheckingModUpdates: modUpdatesQuery.isFetching,

    sptVersionsError: sptVersionsQuery.error,
    modListsError: modListsQuery.error,
    sptUpdateError: sptUpdateQuery.error,
    fikaUpdateError: fikaUpdateQuery.error,
    modUpdatesError: modUpdatesQuery.error,

    checkAllModUpdates: checkAllModUpdatesMutation.mutateAsync,
    isCheckingAllModUpdates: checkAllModUpdatesMutation.isPending,
    checkSingleModUpdate: checkSingleModUpdateMutation.mutateAsync,
    isCheckingSingleModUpdate: checkSingleModUpdateMutation.isPending,

    refreshSptUpdate,
    refreshFikaUpdate,
    refreshModUpdates,

    refetchSptVersions: sptVersionsQuery.refetch,
    refetchModLists: modListsQuery.refetch,
  };
};
