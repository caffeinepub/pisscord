import { Principal } from "@icp-sdk/core/principal";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  GroupConversation,
  GroupMessage,
  Message,
  Server,
  Signal,
  UserProfile,
} from "../backend";
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

// ── DM hooks ───────────────────────────────────────────────────────────────

export function useMyConversations() {
  const { actor, isFetching } = useActor();
  return useQuery<Array<[Principal, Array<Message>]>>({
    queryKey: ["myConversations"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getMyConversations();
    },
    enabled: !!actor && !isFetching,
    refetchInterval: 2000,
  });
}

export function useConversationWith(principalStr: string | null) {
  const { actor, isFetching } = useActor();
  return useQuery<Message[]>({
    queryKey: ["conversation", principalStr],
    queryFn: async () => {
      if (!actor || !principalStr) return [];
      const p = Principal.fromText(principalStr);
      return actor.getConversationWith(p);
    },
    enabled: !!actor && !isFetching && !!principalStr,
    refetchInterval: 2000,
  });
}

export function useSendDM() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      recipientStr,
      content,
    }: { recipientStr: string; content: string }) => {
      if (!actor) throw new Error("No actor");
      const p = Principal.fromText(recipientStr);
      return actor.sendDM(p, content);
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: ["conversation", variables.recipientStr],
      });
      qc.invalidateQueries({ queryKey: ["myConversations"] });
    },
  });
}

export function useAllUsers() {
  const { actor, isFetching } = useActor();
  return useQuery<Array<[Principal, UserProfile]>>({
    queryKey: ["allUsers"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getAllUsers();
    },
    enabled: !!actor && !isFetching,
  });
}

// ── Group DM hooks ─────────────────────────────────────────────────────────

export function useMyGroupDMs() {
  const { actor, isFetching } = useActor();
  return useQuery<GroupConversation[]>({
    queryKey: ["myGroupDMs"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getMyGroupDMs();
    },
    enabled: !!actor && !isFetching,
    refetchInterval: 2000,
  });
}

export function useGroupDMMessages(groupId: bigint | null) {
  const { actor, isFetching } = useActor();
  return useQuery<GroupMessage[]>({
    queryKey: ["groupMessages", groupId?.toString()],
    queryFn: async () => {
      if (!actor || groupId === null) return [];
      return actor.getGroupDMMessages(groupId);
    },
    enabled: !!actor && !isFetching && groupId !== null,
    refetchInterval: 2000,
  });
}

export function useCreateGroupDM() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (members: Principal[]) => {
      if (!actor) throw new Error("No actor");
      return actor.createGroupDM(members);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["myGroupDMs"] });
    },
  });
}

export function useSendGroupDM() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      groupId,
      content,
    }: { groupId: bigint; content: string }) => {
      if (!actor) throw new Error("No actor");
      return actor.sendGroupDM(groupId, content);
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: ["groupMessages", variables.groupId.toString()],
      });
    },
  });
}

export function useRenameGroupDM() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      groupId,
      newName,
    }: { groupId: bigint; newName: string }) => {
      if (!actor) throw new Error("No actor");
      return actor.renameGroupDM(groupId, newName);
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["myGroupDMs"] });
      qc.invalidateQueries({
        queryKey: ["groupMessages", variables.groupId.toString()],
      });
    },
  });
}

// ── DM Call hooks ──────────────────────────────────────────────────────────

export function useGetMyDMSignals(
  dmChannelId: string | null,
  enabled: boolean,
) {
  const { actor, isFetching } = useActor();
  return useQuery<Signal[]>({
    queryKey: ["dmSignals", dmChannelId],
    queryFn: async () => {
      if (!actor || !dmChannelId) return [];
      return actor.getMyDMSignals(dmChannelId);
    },
    enabled: !!actor && !isFetching && !!dmChannelId && enabled,
    refetchInterval: 500,
  });
}

export function useGetDMCallState(dmChannelId: string | null) {
  const { actor, isFetching } = useActor();
  return useQuery({
    queryKey: ["dmCallState", dmChannelId],
    queryFn: async () => {
      if (!actor || !dmChannelId) return null;
      return actor.getDMCallState(dmChannelId);
    },
    enabled: !!actor && !isFetching && !!dmChannelId,
    refetchInterval: 2000,
  });
}

export function useGetDMCallPresence(
  dmChannelId: string | null,
  enabled: boolean,
) {
  const { actor, isFetching } = useActor();
  return useQuery<Principal[]>({
    queryKey: ["dmCallPresence", dmChannelId],
    queryFn: async () => {
      if (!actor || !dmChannelId) return [];
      return actor.getDMCallPresence(dmChannelId);
    },
    enabled: !!actor && !isFetching && !!dmChannelId && enabled,
    refetchInterval: 1500,
  });
}
