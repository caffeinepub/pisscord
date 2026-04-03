import Principal "mo:core/Principal";
import List "mo:core/List";
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Int "mo:core/Int";
import Map "mo:core/Map";
import Iter "mo:core/Iter";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import Order "mo:core/Order";
import AccessControl "authorization/access-control";
import MixinAuthorization "authorization/MixinAuthorization";



actor {
  // Types
  type Id = Nat;

  type ChannelPresence = {
    channel : Text;
    users : [Principal];
  };

  type Server = {
    id : Id;
    name : Text;
    owner : Principal;
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

  public type UserProfile = {
    name : Text;
  };

  // Signal TTL: 60 seconds in nanoseconds
  let SIGNAL_TTL_NS : Int = 60_000_000_000;

  // Persistent state
  let servers = Map.empty<Id, Server>();
  let messages = Map.empty<Id, Message>();
  let userServers = Map.empty<Principal, [Id]>();
  var nextId = 0;

  // New persistent variables
  let activeVoiceChannels = List.empty<ChannelPresence>();
  let userProfiles = Map.empty<Principal, UserProfile>();
  let signals = List.empty<Signal>();

  // Authorization
  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);

  func generateId() : Id {
    let id = nextId;
    nextId += 1;
    id;
  };

  // --------- User Profile ---------
  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can access profiles");
    };
    userProfiles.get(caller);
  };

  public query ({ caller }) func getUserProfile(user : Principal) : async ?UserProfile {
    // Public access - no permission check needed per specification
    userProfiles.get(user);
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : UserProfile) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can save profiles");
    };
    userProfiles.add(caller, profile);
  };

  // --------- Server Membership ---------
  public query ({ caller }) func getAllServers() : async [Server] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
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
              case (null) { Runtime.trap("Server with id " # id.toText() # " does not exist") };
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
        // Make sure caller is not already member
        for (member in server.members.values()) {
          if (member == caller) {
            Runtime.trap("Already a member of this server");
          };
        };
        // Update server members
        let updatedServer : Server = {
          server with
          members = server.members.concat([caller]);
        };
        servers.add(serverId, updatedServer);
        // Update user servers
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
        // Verify caller is member of this server
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
        // Make sure caller is member
        var isMember = false;
        for (member in server.members.values()) {
          if (member == caller) {
            isMember := true;
          };
        };
        if (not isMember) { Runtime.trap("Unauthorized: Only members of the server can add channel") };
        // Check if user is the owner
        if (server.owner != caller) {
          Runtime.trap("Unauthorized: Only the server owner can add new channels");
        };
        // Add channel
        let updatedServer : Server = {
          server with
          channels = server.channels.concat([channelName]);
        };
        servers.add(serverId, updatedServer);
      };
    };
  };

  // Get server ID from channel name
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
    // Verify caller is member of the server containing this channel
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
    // Verify caller is member of the server containing this channel
    switch (getServerIdFromChannel(channel)) {
      case (null) { Runtime.trap("Channel does not exist") };
      case (?serverId) {
        if (not isServerMember(serverId, caller)) {
          Runtime.trap("Not a member of the server containing this channel");
        };
      };
    };
    // Filter messages by channel name
    let filtered = messages.values().toArray().filter(
      func(m) { m.channel == channel }
    );
    filtered.sort();
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
    // Check if user is a member of the server
    if (not isServerMember(serverId, caller)) {
      Runtime.trap("Unauthorized: You're not a member of this server");
    };
    // Voice presence
    var found = false;
    var updatedPresence = List.empty<ChannelPresence>();
    for (presence in activeVoiceChannels.values()) {
      if (presence.channel == channelName) {
        found := true;
        let isPresent = presence.users.find(func(user) { user == caller }).isSome();
        if (not isPresent) {
          let updatedUsers = presence.users.concat([caller]); // Add caller to users
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
    // Check if user is a member of the server
    if (not isServerMember(serverId, caller)) {
      Runtime.trap("Unauthorized: You're not a member of this server");
    };
    // Remove from channel presence
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
    // User must be a member of the server where the channel exists
    let serverId = switch (getServerIdFromChannel(channelName)) {
      case (null) { Runtime.trap("Channel does not exist") };
      case (?serverId) { serverId };
    };
    if (not isServerMember(serverId, caller)) {
      Runtime.trap("Unauthorized: Only members can send voice signals");
    };
    let now = Time.now();
    // Purge expired signals (older than TTL)
    var fresh = List.empty<Signal>();
    for (sig in signals.values()) {
      if (now - sig.timestamp < SIGNAL_TTL_NS) {
        fresh.add(sig);
      };
    };
    signals.clear();
    signals.addAll(fresh.values());
    // Add new signal
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

  // Read-only query: returns signals addressed to caller in channelName.
  // Signals are NOT deleted here; they expire via TTL in sendSignal.
  // The frontend deduplicates via processedSignalIds.
  public query ({ caller }) func getMySignals(channelName : Text) : async [Signal] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can receive signals");
    };
    // User must be a member of the server where the channel exists
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
