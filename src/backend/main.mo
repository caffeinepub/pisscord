import Principal "mo:core/Principal";
import List "mo:core/List";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Int "mo:core/Int";
import Map "mo:core/Map";
import Iter "mo:core/Iter";
import Runtime "mo:core/Runtime";

import AccessControl "authorization/access-control";
import MixinAuthorization "authorization/MixinAuthorization";
import Time "mo:core/Time";
import Order "mo:core/Order";


actor {
  // Types
  type Id = Nat;

  type ChannelPresence = {
    channel : Text;
    users : [Principal];
  };

  public type UserProfile = {
    name : Text;
  };

  type Server = {
    id : Id;
    owner : Principal;
    name : Text;
    members : [Principal];
    channels : [Text];
    timestamp : Time.Time;
  };

  type Message = {
    id : Id;
    author : Principal;
    channel : Text;
    content : Text;
    timestamp : Time.Time;
  };

  type Signal = {
    id : Id;
    from : Principal;
    to : Principal;
    channelName : Text;
    signalType : Text;
    payload : Text;
    timestamp : Time.Time;
  };

  // DMCallState type is kept identical to the previous stable version.
  // invitedMembers is stored separately in dmCallInvitedMembers map.
  type DMCallState = {
    dmChannelId : Text;
    initiator : Principal;
    participants : [Principal];
    startedAt : Time.Time;
  };

  type GroupConversation = {
    id : Id;
    name : Text;
    members : [Principal];
    createdBy : Principal;
    timestamp : Time.Time;
  };

  type GroupMessage = {
    id : Id;
    groupId : Id;
    author : Principal;
    isSystem : Bool;
    content : Text;
    timestamp : Time.Time;
  };

  // Persistent state
  let activeVoiceChannels = List.empty<ChannelPresence>();
  let servers = Map.empty<Id, Server>();
  let messages = Map.empty<Id, Message>();
  let userProfiles = Map.empty<Principal, UserProfile>();
  let profilePhotos = Map.empty<Principal, Text>();
  let signals = List.empty<Signal>();
  let directMessages = Map.empty<Id, Message>();
  let userServers = Map.empty<Principal, [Id]>();
  let userConversations = Map.empty<Principal, [Principal]>();
  let groupMessages = Map.empty<Id, GroupMessage>();
  let groupConversations = Map.empty<Id, GroupConversation>();
  let dmCallStates = Map.empty<Text, DMCallState>();
  let dmSignals = List.empty<Signal>();
  // Separate map for invited members — avoids breaking DMCallState stable type
  let dmCallInvitedMembers = Map.empty<Text, [Principal]>();

  var nextId = 0;

  // Signal TTL: 60 seconds in nanoseconds
  let SIGNAL_TTL_NS : Int = 60_000_000_000;

  // DM Call TTL: 2 hours in nanoseconds
  let DM_CALL_TTL_NS : Int = 2 * 60 * 60 * 1_000_000_000;

  // Authorization
  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);

  func generateId() : Id {
    let id = nextId;
    nextId += 1;
    id;
  };

  // Prune stale DMCallState entries older than DM_CALL_TTL_NS
  func pruneStaleCallStates() {
    let now = Time.now();
    let staleKeys = List.empty<Text>();
    for ((channelId, state) in dmCallStates.entries()) {
      if (now - state.startedAt > DM_CALL_TTL_NS) {
        staleKeys.add(channelId);
      };
    };
    for (key in staleKeys.values()) {
      dmCallStates.remove(key);
      dmCallInvitedMembers.remove(key);
    };
  };

  // --------- User Profile ---------
  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can access profiles");
    };
    userProfiles.get(caller);
  };

  public query func getUserProfile(user : Principal) : async ?UserProfile {
    // Public read access per specification
    userProfiles.get(user);
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : UserProfile) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can save profiles");
    };
    userProfiles.add(caller, profile);
  };

  public query ({ caller }) func getAllUsers() : async [(Principal, UserProfile)] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can view all users");
    };
    userProfiles.toArray();
  };

  // --------- Profile Photos ---------
  public shared ({ caller }) func saveProfilePhoto(photo : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can save profile photos");
    };
    profilePhotos.add(caller, photo);
  };

  public query func getProfilePhoto(user : Principal) : async ?Text {
    profilePhotos.get(user);
  };

  // --------- Server Membership ---------
  public query ({ caller }) func getAllServers() : async [Server] {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can access servers");
    };
    servers.values().toArray().sort();
  };

  public query ({ caller }) func getUserServers() : async [Server] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can access their servers");
    };

    switch (userServers.get(caller)) {
      case (null) { [] };
      case (?serverIds) {
        serverIds.map(
          func(id) {
            switch (servers.get(id)) {
              case (null) {
                Runtime.trap("Server with id " # id.toText() # " does not exist");
              };
              case (?server) { server };
            };
          }
        );
      };
    };
  };

  public shared ({ caller }) func createServer(name : Text) : async Id {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can create servers");
    };
    let id = generateId();
    let newServer = {
      id;
      name;
      owner = caller;
      members = [caller];
      channels = [">general"]; // default text channel
      timestamp = Time.now();
    };
    servers.add(id, newServer);
    let updatedUserServers = switch (userServers.get(caller)) {
      case (null) { [id] };
      case (?existing) { existing.concat([id]) };
    };
    userServers.add(caller, updatedUserServers);
    id;
  };

  // Join existing server
  public shared ({ caller }) func joinServer(serverId : Id) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can join servers");
    };
    switch (servers.get(serverId)) {
      case (null) { Runtime.trap("Server does not exist") };
      case (?server) {
        for (member in server.members.values()) {
          if (member == caller) {
            Runtime.trap("Already a member of this server");
          };
        };
        let updatedServer : Server = {
          server with
          members = server.members.concat([caller]);
        };
        servers.add(serverId, updatedServer);
        let updatedUserServers = switch (userServers.get(caller)) {
          case (null) { [serverId] };
          case (?existing) { existing.concat([serverId]) };
        };
        userServers.add(caller, updatedUserServers);
      };
    };
  };

  public query ({ caller }) func getServerMembers(serverId : Id) : async [Principal] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can view server members");
    };
    switch (servers.get(serverId)) {
      case (null) { Runtime.trap("Server does not exist") };
      case (?server) {
        if (not isServerMember(serverId, caller)) {
          Runtime.trap("Unauthorized: Only members of the server can view the members");
        };
        server.members;
      };
    };
  };

  // Helper function to check if caller is member of a server
  func isServerMember(serverId : Id, caller : Principal) : Bool {
    switch (servers.get(serverId)) {
      case (null) { false };
      case (?server) {
        for (member in server.members.values()) {
          if (member == caller) {
            return true;
          };
        };
        false;
      };
    };
  };

  public shared ({ caller }) func addChannel(serverId : Id, channelName : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can add channels");
    };
    switch (servers.get(serverId)) {
      case (null) { Runtime.trap("Server does not exist") };
      case (?server) {
        var isMember = false;
        for (member in server.members.values()) {
          if (member == caller) {
            isMember := true;
          };
        };
        if (not isMember) { Runtime.trap("Unauthorized: Only members of the server can add channel") };
        if (server.owner != caller) {
          Runtime.trap("Unauthorized: Only the server owner can add new channels");
        };
        let updatedServer : Server = {
          server with
          channels = server.channels.concat([channelName]);
        };
        servers.add(serverId, updatedServer);
      };
    };
  };

  func getServerIdFromChannel(channelName : Text) : ?Id {
    for ((id, server) in servers.entries()) {
      for (channel in server.channels.values()) {
        if (channel == channelName) {
          return ?id;
        };
      };
    };
    null;
  };

  // --------- Messaging ---------
  public shared ({ caller }) func sendMessage(channelName : Text, content : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can send messages");
    };
    if (content.size() > 280) { Runtime.trap("Message too long") };
    switch (getServerIdFromChannel(channelName)) {
      case (null) { Runtime.trap("Channel does not exist") };
      case (?serverId) {
        if (not isServerMember(serverId, caller)) {
          Runtime.trap("Not a member of the server containing this channel");
        };
      };
    };
    let message = {
      id = generateId();
      author = caller;
      channel = channelName;
      content;
      timestamp = Time.now();
    };
    messages.add(message.id, message);
  };

  public query ({ caller }) func getChannelMessages(channel : Text) : async [Message] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can view messages");
    };
    switch (getServerIdFromChannel(channel)) {
      case (null) { Runtime.trap("Channel does not exist") };
      case (?serverId) {
        if (not isServerMember(serverId, caller)) {
          Runtime.trap("Not a member of the server containing this channel");
        };
      };
    };
    let filtered = messages.values().toArray().filter(
      func(m) { m.channel == channel }
    );
    filtered.sort();
  };

  // --------- Direct Messaging ---------
  func updateUserConversations(user : Principal, otherUser : Principal) {
    let conversations = switch (userConversations.get(user)) {
      case (null) { [otherUser] };
      case (?convos) {
        let filtered = convos.filter(func(conv) { conv != otherUser });
        [otherUser].concat(filtered);
      };
    };
    userConversations.add(user, conversations);
  };

  public shared ({ caller }) func sendDM(recipient : Principal, content : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can send DMs");
    };
    if (content.size() > 280) { Runtime.trap("Message too long") };
    let now = Time.now();
    let message = {
      id = generateId();
      author = caller;
      channel = recipient.toText();
      content;
      timestamp = now;
    };
    directMessages.add(message.id, message);
    updateUserConversations(caller, recipient);
    updateUserConversations(recipient, caller);
  };

  public query ({ caller }) func getConversationWith(recipient : Principal) : async [Message] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can view DMs");
    };
    let filtered = directMessages.values().toArray().filter(
      func(m) {
        (m.author == caller and m.channel == recipient.toText()) or
        (m.author == recipient and m.channel == caller.toText())
      }
    );
    filtered.sort();
  };

  public query ({ caller }) func getConversations() : async [(Principal, [Message])] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can view conversations");
    };
    switch (userConversations.get(caller)) {
      case (null) { [] };
      case (?conversations) {
        conversations.map(
          func(partner) {
            let msgs = directMessages.values().toArray().filter(
              func(m) {
                (m.author == caller and m.channel == partner.toText()) or
                (m.author == partner and m.channel == caller.toText())
              }
            );
            (partner, msgs.sort());
          }
        );
      };
    };
  };

  public query ({ caller }) func getMyConversations() : async [(Principal, [Message])] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can view conversations");
    };

    func messageCompare((_, msgs1) : (Principal, [Message]), (_, msgs2) : (Principal, [Message])) : Order.Order {
      if (msgs1.size() == 0 and msgs2.size() == 0) {
        return #equal;
      } else if (msgs1.size() == 0) {
        return #greater;
      } else if (msgs2.size() == 0) {
        return #less;
      };
      let lastMsg1 = msgs1[msgs1.size() - 1];
      let lastMsg2 = msgs2[msgs2.size() - 1];
      Int.compare(lastMsg2.timestamp, lastMsg1.timestamp);
    };

    switch (userConversations.get(caller)) {
      case (null) { [] };
      case (?conversations) {
        conversations.map(
          func(partner) {
            let partnerMessages = directMessages.values().toArray().filter(
              func(m) {
                (m.author == caller and m.channel == partner.toText()) or
                (m.author == partner and m.channel == caller.toText())
              }
            );
            (partner, partnerMessages.sort());
          }
        ).sort(messageCompare);
      };
    };
  };

  // --------- Voice Presence ---------
  public shared ({ caller }) func joinVoiceChannel(channelName : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can join voice channels");
    };
    let serverId = switch (getServerIdFromChannel(channelName)) {
      case (null) { Runtime.trap("Channel does not exist") };
      case (?serverId) { serverId };
    };
    if (not isServerMember(serverId, caller)) {
      Runtime.trap("Unauthorized: You're not a member of this server");
    };
    var found = false;
    var updatedPresence = List.empty<ChannelPresence>();
    for (presence in activeVoiceChannels.values()) {
      if (presence.channel == channelName) {
        found := true;
        let isPresent = presence.users.find(func(user) { user == caller }).isSome();
        if (not isPresent) {
          let updatedUsers = presence.users.concat([caller]);
          updatedPresence.add({ presence with users = updatedUsers });
        } else {
          updatedPresence.add(presence);
        };
      } else {
        updatedPresence.add(presence);
      };
    };
    activeVoiceChannels.clear();
    activeVoiceChannels.addAll(updatedPresence.values());
    if (not found) {
      activeVoiceChannels.add({ channel = channelName; users = [caller] });
    };
  };

  public shared ({ caller }) func leaveVoiceChannel(channelName : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can leave voice channels");
    };
    let serverId = switch (getServerIdFromChannel(channelName)) {
      case (null) { Runtime.trap("Channel does not exist") };
      case (?serverId) { serverId };
    };
    if (not isServerMember(serverId, caller)) {
      Runtime.trap("Unauthorized: You're not a member of this server");
    };
    var remainingPresence = List.empty<ChannelPresence>();
    for (presence in activeVoiceChannels.values()) {
      if (presence.channel == channelName) {
        var remainingUsers = List.empty<Principal>();
        for (user in presence.users.values()) {
          if (user != caller) {
            remainingUsers.add(user);
          };
        };
        let remainingUsersArray = remainingUsers.toArray();
        if (remainingUsersArray.size() > 0) {
          remainingPresence.add({ presence with users = remainingUsersArray });
        };
      } else {
        remainingPresence.add(presence);
      };
    };
    activeVoiceChannels.clear();
    activeVoiceChannels.addAll(remainingPresence.values());
  };

  public query ({ caller }) func getVoiceChannelPresence(channelName : Text) : async [Principal] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can view voice channel presence");
    };
    switch (getServerIdFromChannel(channelName)) {
      case (null) { Runtime.trap("Channel does not exist") };
      case (?serverId) {
        if (not isServerMember(serverId, caller)) {
          Runtime.trap("Not a member of the server containing this channel");
        };
      };
    };
    for (presence in activeVoiceChannels.values()) {
      if (presence.channel == channelName) {
        return presence.users;
      };
    };
    [];
  };

  // --------- WebRTC Signaling ---------
  public shared ({ caller }) func sendSignal(to : Principal, channelName : Text, signalType : Text, payload : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can send signals");
    };
    let serverId = switch (getServerIdFromChannel(channelName)) {
      case (null) { Runtime.trap("Channel does not exist") };
      case (?s) { s };
    };
    if (not isServerMember(serverId, caller)) {
      Runtime.trap("Unauthorized: Only members can send voice signals");
    };
    let now = Time.now();
    var fresh = List.empty<Signal>();
    for (sig in signals.values()) {
      if (now - sig.timestamp < SIGNAL_TTL_NS) {
        fresh.add(sig);
      };
    };
    signals.clear();
    signals.addAll(fresh.values());
    let newSignal = {
      id = generateId();
      from = caller;
      to;
      channelName;
      signalType;
      payload;
      timestamp = now;
    };
    signals.add(newSignal);
  };

  public query ({ caller }) func getMySignals(channelName : Text) : async [Signal] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can receive signals");
    };
    let serverId = switch (getServerIdFromChannel(channelName)) {
      case (null) { Runtime.trap("Channel does not exist") };
      case (?serverId) { serverId };
    };
    if (not isServerMember(serverId, caller)) {
      Runtime.trap("Unauthorized: Only members can receive voice signals");
    };
    let now = Time.now();
    var result = List.empty<Signal>();
    for (sig in signals.values()) {
      if (sig.to == caller and sig.channelName == channelName and now - sig.timestamp < SIGNAL_TTL_NS) {
        result.add(sig);
      };
    };
    result.toArray();
  };

  // --------- Group DMs ---------
  // Comparison function for sorting GroupMessages by timestamp
  module GroupMessage {
    public func compare(a : GroupMessage, b : GroupMessage) : Order.Order {
      Int.compare(a.timestamp, b.timestamp);
    };
  };

  public shared ({ caller }) func createGroupDM(members : [Principal]) : async Id {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can create groups");
    };
    let id = generateId();
    let uniqueMembers = members.filter(
      func(m) {
        m != caller;
      }
    ).concat([caller]);

    let newGroup : GroupConversation = {
      id;
      name = "";
      members = uniqueMembers;
      createdBy = caller;
      timestamp = Time.now();
    };
    groupConversations.add(id, newGroup);
    id;
  };

  public shared ({ caller }) func sendGroupDM(groupId : Id, content : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can send group messages");
    };
    if (content.size() > 280) { Runtime.trap("Message too long") };
    let group = switch (groupConversations.get(groupId)) {
      case (null) { Runtime.trap("Group does not exist") };
      case (?g) { g };
    };
    if (not group.members.find(func(x) { x == caller }).isSome()) {
      Runtime.trap("Not a member of this group");
    };
    let message : GroupMessage = {
      id = generateId();
      groupId;
      author = caller;
      content;
      timestamp = Time.now();
      isSystem = false;
    };
    groupMessages.add(message.id, message);
  };

  public query ({ caller }) func getGroupDMMessages(groupId : Id) : async [GroupMessage] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can view group messages");
    };
    switch (groupConversations.get(groupId)) {
      case (null) { Runtime.trap("Group does not exist") };
      case (?g) {
        if (not g.members.find(func(x) { x == caller }).isSome()) {
          Runtime.trap("Not a member of this group");
        };
      };
    };
    let filtered = groupMessages.values().toArray().filter(
      func(m) { m.groupId == groupId }
    );
    filtered.sort();
  };

  public query ({ caller }) func getMyGroupDMs() : async [GroupConversation] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can view group conversations");
    };
    groupConversations.values().toArray().filter(
      func(g) { g.members.find(func(x) { x == caller }).isSome() }
    );
  };

  public shared ({ caller }) func renameGroupDM(groupId : Id, newName : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can rename groups");
    };
    switch (groupConversations.get(groupId)) {
      case (null) { Runtime.trap("Group does not exist") };
      case (?group) {
        if (not group.members.find(func(x) { x == caller }).isSome()) {
          Runtime.trap("Caller is not a member of this group");
        };
        let updated = { group with name = newName };
        groupConversations.add(groupId, updated);
        let message : GroupMessage = {
          id = generateId();
          groupId;
          author = caller;
          content = "renamed the group to `" # newName # "`";
          isSystem = true;
          timestamp = Time.now();
        };
        groupMessages.add(message.id, message);
      };
    };
  };

  // Helper function to check if caller has DM relationship with another user
  func hasDMRelationship(caller : Principal, other : Principal) : Bool {
    // Check 1-on-1 DM relationship
    switch (userConversations.get(caller)) {
      case (?convos) {
        if (convos.find(func(p) { p == other }).isSome()) {
          return true;
        };
      };
      case (null) {};
    };

    // Check group DM relationship
    for (group in groupConversations.values()) {
      let callerIsMember = group.members.find(func(p) { p == caller }).isSome();
      let otherIsMember = group.members.find(func(p) { p == other }).isSome();
      if (callerIsMember and otherIsMember) {
        return true;
      };
    };

    false;
  };

  // --------- DM Call Signaling ---------
  public shared ({ caller }) func sendDMSignal(to : Principal, dmChannelId : Text, signalType : Text, payload : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can send signals");
    };

    // Check if caller has an active DM or group DM relationship with 'to'
    if (not hasDMRelationship(caller, to)) {
      Runtime.trap("Unauthorized: No DM relationship with recipient");
    };

    let now = Time.now();
    var fresh = List.empty<Signal>();
    for (sig in dmSignals.values()) {
      if (now - sig.timestamp < SIGNAL_TTL_NS) {
        fresh.add(sig);
      };
    };
    dmSignals.clear();
    dmSignals.addAll(fresh.values());
    let newSignal = {
      id = generateId();
      from = caller;
      to;
      channelName = dmChannelId;
      signalType;
      payload;
      timestamp = now;
    };
    dmSignals.add(newSignal);
  };

  public query ({ caller }) func getMyDMSignals(dmChannelId : Text) : async [Signal] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can receive signals");
    };
    let now = Time.now();
    var result = List.empty<Signal>();
    for (sig in dmSignals.values()) {
      if (sig.to == caller and sig.channelName == dmChannelId and now - sig.timestamp < SIGNAL_TTL_NS) {
        result.add(sig);
      };
    };
    result.toArray();
  };

  // startDMCall: store ONLY [initiator] in participants.
  // invitedMembers stored separately in dmCallInvitedMembers to preserve
  // stable type compatibility with the previous DMCallState shape.
  public shared ({ caller }) func startDMCall(dmChannelId : Text, members : [Principal]) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can start calls");
    };
    // Prune stale call states before creating a new one
    pruneStaleCallStates();
    let initiator = caller;
    // invitedMembers: everyone invited (ensure initiator is included)
    let hasInitiator = members.find(func(p) { p == initiator }).isSome();
    let invitedMembers = if (hasInitiator) { members } else { members.concat([initiator]) };
    // participants: only the initiator at start; others join via joinDMCall
    dmCallStates.add(dmChannelId, {
      dmChannelId;
      initiator;
      participants = [initiator];
      startedAt = Time.now();
    });
    dmCallInvitedMembers.add(dmChannelId, invitedMembers);
  };

  public query ({ caller }) func getDMCallState(dmChannelId : Text) : async ?DMCallState {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can get call state");
    };
    switch (dmCallStates.get(dmChannelId)) {
      case (null) { null };
      case (?state) {
        // Return null if the call is stale (TTL expired)
        let now = Time.now();
        if (now - state.startedAt > DM_CALL_TTL_NS) {
          null;
        } else {
          ?state;
        };
      };
    };
  };

  // endDMCall: no-op if call does not exist (prevents trap when both users hang up)
  public shared ({ caller }) func endDMCall(dmChannelId : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can end calls");
    };
    switch (dmCallStates.get(dmChannelId)) {
      case (null) { return }; // already ended — no-op
      case (?callState) {
        let isParticipant = callState.participants.find(func(x) { x == caller }).isSome();
        let isInitiator = callState.initiator == caller;
        if (not isParticipant and not isInitiator) {
          Runtime.trap("Not a participant in this call");
        };
        dmCallStates.remove(dmChannelId);
        dmCallInvitedMembers.remove(dmChannelId);
      };
    };
  };

  public shared ({ caller }) func joinDMCall(dmChannelId : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can join calls");
    };
    switch (dmCallStates.get(dmChannelId)) {
      case (null) { Runtime.trap("Call does not exist") };
      case (?state) {
        let isPresent = state.participants.find(func(p) { p == caller }).isSome();
        if (not isPresent) {
          let updated = {
            state with
            participants = state.participants.concat([caller]);
          };
          dmCallStates.add(dmChannelId, updated);
        };
      };
    };
  };

  public query ({ caller }) func getDMCallPresence(dmChannelId : Text) : async [Principal] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can get call presence");
    };
    switch (dmCallStates.get(dmChannelId)) {
      case (null) { Runtime.trap("Call does not exist") };
      case (?state) { state.participants };
    };
  };

  // getDMInvitedMembers: returns the full invited members list for UI tile display.
  // Stored separately from DMCallState to preserve stable type compatibility.
  public query ({ caller }) func getDMInvitedMembers(dmChannelId : Text) : async [Principal] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can get call members");
    };
    switch (dmCallInvitedMembers.get(dmChannelId)) {
      case (null) { [] };
      case (?members) { members };
    };
  };

  // --------- Ordering ---------
  module Server {
    public func compare(server1 : Server, server2 : Server) : Order.Order {
      Nat.compare(server1.id, server2.id);
    };
  };

  module Message {
    public func compare(message1 : Message, message2 : Message) : Order.Order {
      Int.compare(message1.id, message2.id);
    };
  };
};
