import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface Signal {
    id: Id;
    to: Principal;
    channelName: string;
    from: Principal;
    timestamp: Time;
    payload: string;
    signalType: string;
}
export interface DMCallState {
    startedAt: Time;
    participants: Array<Principal>;
    initiator: Principal;
    dmChannelId: string;
}
export type Time = bigint;
export interface GroupMessage {
    id: Id;
    content: string;
    isSystem: boolean;
    author: Principal;
    groupId: Id;
    timestamp: Time;
}
export interface GroupConversation {
    id: Id;
    members: Array<Principal>;
    name: string;
    createdBy: Principal;
    timestamp: Time;
}
export type Id = bigint;
export interface Message {
    id: Id;
    content: string;
    author: Principal;
    timestamp: Time;
    channel: string;
}
export interface UserProfile {
    name: string;
}
export interface Server {
    id: Id;
    members: Array<Principal>;
    owner: Principal;
    name: string;
    channels: Array<string>;
    timestamp: Time;
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    addChannel(serverId: Id, channelName: string): Promise<void>;
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    createGroupDM(members: Array<Principal>): Promise<Id>;
    createServer(name: string): Promise<Id>;
    endDMCall(dmChannelId: string): Promise<void>;
    getAllServers(): Promise<Array<Server>>;
    getAllUsers(): Promise<Array<[Principal, UserProfile]>>;
    getCallerUserProfile(): Promise<UserProfile | null>;
    getCallerUserRole(): Promise<UserRole>;
    getChannelMessages(channel: string): Promise<Array<Message>>;
    getConversationWith(recipient: Principal): Promise<Array<Message>>;
    getConversations(): Promise<Array<[Principal, Array<Message>]>>;
    getDMCallPresence(dmChannelId: string): Promise<Array<Principal>>;
    getDMCallState(dmChannelId: string): Promise<DMCallState | null>;
    getDMInvitedMembers(dmChannelId: string): Promise<Array<Principal>>;
    getGroupDMMessages(groupId: Id): Promise<Array<GroupMessage>>;
    getMyConversations(): Promise<Array<[Principal, Array<Message>]>>;
    getMyDMSignals(dmChannelId: string): Promise<Array<Signal>>;
    getMyGroupDMs(): Promise<Array<GroupConversation>>;
    getMySignals(channelName: string): Promise<Array<Signal>>;
    getProfilePhoto(user: Principal): Promise<string | null>;
    getServerMembers(serverId: Id): Promise<Array<Principal>>;
    getUserProfile(user: Principal): Promise<UserProfile | null>;
    getUserServers(): Promise<Array<Server>>;
    getVoiceChannelPresence(channelName: string): Promise<Array<Principal>>;
    isCallerAdmin(): Promise<boolean>;
    joinDMCall(dmChannelId: string): Promise<void>;
    joinServer(serverId: Id): Promise<void>;
    joinVoiceChannel(channelName: string): Promise<void>;
    leaveVoiceChannel(channelName: string): Promise<void>;
    renameGroupDM(groupId: Id, newName: string): Promise<void>;
    saveCallerUserProfile(profile: UserProfile): Promise<void>;
    saveProfilePhoto(photo: string): Promise<void>;
    sendDM(recipient: Principal, content: string): Promise<void>;
    sendDMSignal(to: Principal, dmChannelId: string, signalType: string, payload: string): Promise<void>;
    sendGroupDM(groupId: Id, content: string): Promise<void>;
    sendMessage(channelName: string, content: string): Promise<void>;
    sendSignal(to: Principal, channelName: string, signalType: string, payload: string): Promise<void>;
    startDMCall(dmChannelId: string, members: Array<Principal>): Promise<void>;
}
