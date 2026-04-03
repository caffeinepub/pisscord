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
export type Time = bigint;
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
    createServer(name: string): Promise<Id>;
    getAllServers(): Promise<Array<Server>>;
    getCallerUserProfile(): Promise<UserProfile | null>;
    getCallerUserRole(): Promise<UserRole>;
    getChannelMessages(channel: string): Promise<Array<Message>>;
    getMySignals(channelName: string): Promise<Array<Signal>>;
    getServerMembers(serverId: Id): Promise<Array<Principal>>;
    getUserProfile(user: Principal): Promise<UserProfile | null>;
    getUserServers(): Promise<Array<Server>>;
    getVoiceChannelPresence(channelName: string): Promise<Array<Principal>>;
    isCallerAdmin(): Promise<boolean>;
    joinServer(serverId: Id): Promise<void>;
    joinVoiceChannel(channelName: string): Promise<void>;
    leaveVoiceChannel(channelName: string): Promise<void>;
    saveCallerUserProfile(profile: UserProfile): Promise<void>;
    sendMessage(channelName: string, content: string): Promise<void>;
    sendSignal(to: Principal, channelName: string, signalType: string, payload: string): Promise<void>;
}
