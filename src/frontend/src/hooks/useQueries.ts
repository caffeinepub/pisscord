import type { Principal } from "@icp-sdk/core/principal";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Message, Server, Signal, UserProfile } from "../backend";
import { useActor } from "./useActor";

export function useUserProfile() {
  const { actor, isFetching } = useActor();
  return useQuery<UserProfile | null>({
    queryKey: ["userProfile"],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getCallerUserProfile();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useSaveUserProfile() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!actor) throw new Error("No actor");
      await actor.saveCallerUserProfile({ name });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["userProfile"] });
    },
  });
}

export function useUserServers() {
  const { actor, isFetching } = useActor();
  return useQuery<Server[]>({
    queryKey: ["userServers"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getUserServers();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useAllServers() {
  const { actor, isFetching } = useActor();
  return useQuery<Server[]>({
    queryKey: ["allServers"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getAllServers();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useCreateServer() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!actor) throw new Error("No actor");
      return actor.createServer(name);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["userServers"] });
      qc.invalidateQueries({ queryKey: ["allServers"] });
    },
  });
}

export function useJoinServer() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (serverId: bigint) => {
      if (!actor) throw new Error("No actor");
      return actor.joinServer(serverId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["userServers"] });
    },
  });
}

export function useAddChannel() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      serverId,
      channelName,
    }: { serverId: bigint; channelName: string }) => {
      if (!actor) throw new Error("No actor");
      return actor.addChannel(serverId, channelName);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["userServers"] });
    },
  });
}

export function useChannelMessages(channel: string | null) {
  const { actor, isFetching } = useActor();
  return useQuery<Message[]>({
    queryKey: ["messages", channel],
    queryFn: async () => {
      if (!actor || !channel) return [];
      return actor.getChannelMessages(channel);
    },
    enabled: !!actor && !isFetching && !!channel,
    refetchInterval: 2000,
  });
}

export function useSendMessage() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      channel,
      content,
    }: { channel: string; content: string }) => {
      if (!actor) throw new Error("No actor");
      return actor.sendMessage(channel, content);
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["messages", variables.channel] });
    },
  });
}

export function useServerMembers(serverId: bigint | null) {
  const { actor, isFetching } = useActor();
  return useQuery<Principal[]>({
    queryKey: ["serverMembers", serverId?.toString()],
    queryFn: async () => {
      if (!actor || serverId === null) return [];
      return actor.getServerMembers(serverId);
    },
    enabled: !!actor && !isFetching && serverId !== null,
  });
}

export function useGetUserProfile(principal: Principal | null) {
  const { actor, isFetching } = useActor();
  return useQuery<UserProfile | null>({
    queryKey: ["profile", principal?.toString()],
    queryFn: async () => {
      if (!actor || !principal) return null;
      return actor.getUserProfile(principal);
    },
    enabled: !!actor && !isFetching && !!principal,
  });
}

export function useVoiceChannelPresence(channelName: string | null) {
  const { actor, isFetching } = useActor();
  return useQuery<Principal[]>({
    queryKey: ["voicePresence", channelName],
    queryFn: async () => {
      if (!actor || !channelName) return [];
      return actor.getVoiceChannelPresence(channelName);
    },
    enabled: !!actor && !isFetching && !!channelName,
    refetchInterval: 1500,
  });
}

export function useGetMySignals(channelName: string | null, enabled: boolean) {
  const { actor, isFetching } = useActor();
  return useQuery<Signal[]>({
    queryKey: ["mySignals", channelName],
    queryFn: async () => {
      if (!actor || !channelName) return [];
      return actor.getMySignals(channelName);
    },
    enabled: !!actor && !isFetching && !!channelName && enabled,
    refetchInterval: 500,
  });
}

export function useJoinVoiceChannel() {
  const { actor } = useActor();
  return useMutation({
    mutationFn: async (channelName: string) => {
      if (!actor) throw new Error("No actor");
      await actor.joinVoiceChannel(channelName);
    },
  });
}

export function useLeaveVoiceChannel() {
  const { actor } = useActor();
  return useMutation({
    mutationFn: async (channelName: string) => {
      if (!actor) throw new Error("No actor");
      await actor.leaveVoiceChannel(channelName);
    },
  });
}
