import { Rumor } from "applesauce-common/helpers/gift-wrap";
import { mapEventsToTimeline } from "applesauce-core";
import { getEventHash, type NostrEvent } from "applesauce-core/helpers";
import { use$, useRenderedContent } from "applesauce-react/hooks";
import { Loader2, Menu, XCircle } from "lucide-react";
import {
  extractMarmotGroupData,
  getGroupMembers,
  getNostrGroupIdHex,
  MarmotGroup,
  unixNow,
} from "marmot-ts";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { from, of, switchMap } from "rxjs";
import { catchError, map } from "rxjs/operators";

import { defaultContentComponents } from "@/components/content-renderers";
import { UserBadge } from "@/components/nostr-user";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useGroupMessages } from "@/hooks/use-group-messages";
import accountManager, { accounts, user$ } from "@/lib/accounts";
import { marmotClient$ } from "@/lib/marmot-client";
import { pool } from "@/lib/nostr";
import { getGroupSubscriptionManager } from "@/lib/runtime";
import { extraRelays$ } from "@/lib/settings";
import { withActiveAccount } from "../../components/with-active-account";

// ============================================================================
// Component: MessageItem
// ============================================================================

interface MessageItemProps {
  rumor: Rumor;
  isOwnMessage: boolean;
}

const MessageItem = memo(function MessageItem({
  rumor,
  isOwnMessage,
}: MessageItemProps) {
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString();
  };

  // Render content with rich text formatting
  const content = useRenderedContent(rumor, defaultContentComponents);

  return (
    <div
      className={`flex flex-col gap-1 ${
        isOwnMessage ? "items-end" : "items-start"
      }`}
    >
      <div className="flex items-center gap-2">
        <UserBadge pubkey={rumor.pubkey} size="sm" />
        <span className="text-xs text-muted-foreground/70">
          {formatTimestamp(rumor.created_at)}
        </span>
      </div>
      <div
        className={`p-3 max-w-[80%] rounded-lg ${
          isOwnMessage
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        <div className="text-sm whitespace-pre-wrap break-words overflow-hidden">
          {content}
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// Component: MessageList
// ============================================================================

interface MessageListProps {
  messages: Rumor[];
  currentUserPubkey: string | null;
  loadMoreMessages?: () => Promise<void>;
  loadingMore?: boolean;
  loadingDone?: boolean;
}

const MessageList = memo(function MessageList({
  messages,
  currentUserPubkey,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>No messages yet. Start the conversation!</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.map((rumor, index) => (
        <MessageItem
          key={`${rumor.id}-${index}`}
          rumor={rumor}
          isOwnMessage={rumor.pubkey === currentUserPubkey}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
});

// ============================================================================
// Component: MessageForm (owns draft state so typing does not re-render page)
// ============================================================================

interface MessageFormProps {
  isSending: boolean;
  onSend: (text: string) => Promise<void>;
}

function MessageForm({ isSending, onSend }: MessageFormProps) {
  const input = useRef<HTMLInputElement>(null);
  const [messageText, setMessageText] = useState("");

  const handleSubmit = async () => {
    const text = messageText.trim();
    if (!text) return;
    try {
      await onSend(text);
      setMessageText("");

      // Focus the input after sending
      input.current?.focus();
    } catch {
      // Error shown by parent; keep draft
    }
  };

  return (
    <div className="flex gap-2">
      <Input
        ref={input}
        type="text"
        placeholder="Type your message..."
        value={messageText}
        onChange={(e) => setMessageText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        disabled={isSending}
        className="flex-1"
      />
      <Button
        onClick={handleSubmit}
        disabled={isSending || !messageText.trim()}
      >
        {isSending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending...
          </>
        ) : (
          "Send"
        )}
      </Button>
    </div>
  );
}

// ============================================================================
// Hook: useMessageSender
// ============================================================================

function useMessageSender(group: MarmotGroup<any> | null) {
  const account = accountManager.active;
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = async (messageText: string): Promise<Rumor | null> => {
    if (!group || !account || !messageText.trim()) return null;

    try {
      setIsSending(true);
      setError(null);

      // Create rumor (unsigned Nostr event)
      const pubkey = await account.signer.getPublicKey();
      const rumor: Rumor = {
        id: "", // Will be computed
        kind: 9, // Chat message kind
        pubkey,
        created_at: unixNow(),
        content: messageText.trim(),
        tags: [],
      };

      // Compute event ID
      rumor.id = getEventHash(rumor);

      // Send via group
      await group.sendApplicationRumor(rumor);

      return rumor;
    } catch (err) {
      console.error("Failed to send message:", err);
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setIsSending(false);
    }
  };

  return { sendMessage, isSending, error };
}

// ============================================================================
// Component: GroupDetailsDrawer
// ============================================================================

interface GroupDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupDetails: {
    name: string;
    epoch: bigint;
    members: string[];
    admins: string[];
  } | null;
  isAdmin: boolean;
  onInviteClick: () => void;
}

function GroupDetailsDrawer({
  open,
  onOpenChange,
  groupDetails,
  isAdmin,
  onInviteClick,
}: GroupDetailsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>Group details</SheetTitle>
          <SheetDescription>
            Inspect metadata and MLS state (read-only).
          </SheetDescription>
        </SheetHeader>

        <div className="p-4 space-y-4 overflow-auto">
          {groupDetails && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Name</div>
                  <div className="text-sm font-medium">{groupDetails.name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Epoch</div>
                  <div className="text-sm font-mono">
                    {String(groupDetails.epoch)}
                  </div>
                </div>
              </div>

              {/* Admins Section */}
              <div>
                <div className="text-xs text-muted-foreground mb-3">
                  Admins ({groupDetails.admins.length})
                </div>
                <div className="space-y-2">
                  {groupDetails.admins.map((pk) => (
                    <Link key={pk} to={`/contacts/${pk}`} className="block">
                      <Card
                        size="sm"
                        className="cursor-pointer hover:bg-accent transition-colors"
                      >
                        <CardHeader>
                          <CardContent className="p-0">
                            <UserBadge pubkey={pk} size="md" />
                          </CardContent>
                        </CardHeader>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Members Section */}
              <div>
                <div className="text-xs text-muted-foreground mb-3">
                  Members ({groupDetails.members.length})
                </div>
                {groupDetails.members.length > 0 ? (
                  <div className="space-y-2">
                    {groupDetails.members.map((pk) => (
                      <Link key={pk} to={`/contacts/${pk}`} className="block">
                        <Card
                          size="sm"
                          className="cursor-pointer hover:bg-accent transition-colors"
                        >
                          <CardHeader>
                            <CardContent className="p-0">
                              <UserBadge pubkey={pk} size="md" />
                            </CardContent>
                          </CardHeader>
                        </Card>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No additional members
                  </p>
                )}
              </div>

              {/* Invite Member Button */}
              <div className="pt-2">
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!isAdmin}
                  onClick={onInviteClick}
                >
                  Invite member
                </Button>
                {!isAdmin && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Only group admins can invite members
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [inviteContactPubkey, setInviteContactPubkey] = useState<string>("");
  const [selectedKeyPackageEventId, setSelectedKeyPackageEventId] =
    useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const account = use$(accounts.active$);

  // Get the selected group from marmotClient$
  const group = use$(
    () =>
      marmotClient$.pipe(
        switchMap((client) => {
          if (!client || !id) return of(null);
          return from(client.getGroup(id)).pipe(catchError(() => of(null)));
        }),
      ),
    [id],
  );

  const { messages, loadMoreMessages, loadingMore, loadingDone } =
    useGroupMessages(group ?? null);

  const groupIdHex = useMemo(() => {
    if (!group) return null;
    return getNostrGroupIdHex(group.state);
  }, [group]);

  // Mark group as seen when viewing it and when new messages arrive
  useEffect(() => {
    if (!groupIdHex) return;
    const subscriptionManager = getGroupSubscriptionManager();
    if (!subscriptionManager) return;
    subscriptionManager.markGroupSeen(groupIdHex, unixNow());
  }, [groupIdHex, messages.length]);

  // If the group doesn't exist locally, go back to the groups list.
  // Only do this after we have a resolved value (null means "not found").
  useEffect(() => {
    if (!id) return;
    if (group === null) {
      navigate("/groups");
    }
  }, [id, group, navigate]);

  // Message sender
  const {
    sendMessage,
    isSending,
    error: sendError,
  } = useMessageSender(group ?? null);

  // Handle sending messages (text passed from MessageForm so page doesn't re-render on typing)
  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;

    try {
      const sentRumor = await sendMessage(text);

      // Optimistically save new messages to the groups history for immediate feedback
      if (sentRumor && group?.history) await group.history.saveRumor(sentRumor);
    } catch (err) {
      // Error is already set by useMessageSender
    }
  };

  // Get group name
  const groupName = group
    ? extractMarmotGroupData(group.state)?.name || "Unnamed Group"
    : "Loading...";

  const groupDetails = useMemo(() => {
    if (!group) return null;

    const data = extractMarmotGroupData(group.state);
    const allMembers = getGroupMembers(group.state);
    const adminPubkeys = data?.adminPubkeys || [];

    // Filter out admins from members list to avoid duplication
    const members = allMembers.filter((pk) => !adminPubkeys.includes(pk));

    return {
      name: data?.name || "Unnamed Group",
      epoch: group.state.groupContext.epoch,
      members,
      admins: adminPubkeys,
    };
  }, [group]);

  const isAdmin = useMemo(() => {
    if (!group || !account?.pubkey) return false;
    const data = extractMarmotGroupData(group.state);
    return data?.adminPubkeys?.includes(account?.pubkey) ?? false;
  }, [group, account?.pubkey]);

  const contacts = use$(user$.contacts$);
  const contactOptions = useMemo(() => {
    return (contacts ?? []).map((c) => ({
      pubkey: c.pubkey,
      label: `${c.pubkey.slice(0, 12)}...`,
    }));
  }, [contacts]);

  const extraRelays = use$(extraRelays$);

  const contactKeyPackages = use$(() => {
    if (!inviteContactPubkey) return;
    return pool
      .request(extraRelays ?? [], {
        kinds: [443],
        authors: [inviteContactPubkey],
        limit: 50,
      })
      .pipe(
        mapEventsToTimeline(),
        map((arr) => [...arr] as NostrEvent[]),
      );
  }, [inviteContactPubkey, extraRelays?.join(",")]);

  const handleInvite = async () => {
    if (!group) return;

    setInviteError(null);

    if (!isAdmin) {
      setInviteError("Only group admins can invite members");
      return;
    }

    const selectedEvent =
      contactKeyPackages?.find((e) => e.id === selectedKeyPackageEventId) ??
      null;
    if (!selectedEvent) {
      setInviteError("Select a KeyPackage event to invite");
      return;
    }

    try {
      setIsInviting(true);
      await group.inviteByKeyPackageEvent(selectedEvent);
      setInviteOpen(false);
      setInviteContactPubkey("");
      setSelectedKeyPackageEventId("");
    } catch (err) {
      console.error("Failed to invite member:", err);
      setInviteError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsInviting(false);
    }
  };

  if (!id) {
    return (
      <>
        <PageHeader
          items={[
            { label: "Home", to: "/" },
            { label: "Groups", to: "/groups" },
            { label: "Invalid Group" },
          ]}
        />
        <div className="flex items-center justify-center h-full p-4">
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>Invalid group ID</AlertDescription>
          </Alert>
        </div>
      </>
    );
  }

  if (group === undefined) {
    return (
      <>
        <PageHeader
          items={[
            { label: "Home", to: "/" },
            { label: "Groups", to: "/groups" },
            { label: "Loading..." },
          ]}
        />
        <div className="flex items-center justify-center h-full p-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading group...</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/groups")}
            >
              Back to Groups
            </Button>
          </div>
        </div>
      </>
    );
  }

  if (group === null) {
    return null;
  }

  return (
    <>
      <PageHeader
        items={[
          { label: "Home", to: "/" },
          { label: "Groups", to: "/groups" },
          { label: groupName },
        ]}
        actions={
          <GroupDetailsDrawer
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
            groupDetails={groupDetails}
            isAdmin={isAdmin}
            onInviteClick={() => setInviteOpen(true)}
          />
        }
      />

      {/* Invite Member Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite member</DialogTitle>
            <DialogDescription>
              Choose a contact and a KeyPackage event (kind 443) to send a
              Welcome.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!isAdmin && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  Only group admins can invite members.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label>Contact</Label>
              <Select
                value={inviteContactPubkey}
                onValueChange={(v) => {
                  setInviteContactPubkey(v);
                  setSelectedKeyPackageEventId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a contact" />
                </SelectTrigger>
                <SelectContent>
                  {contactOptions.map((c) => (
                    <SelectItem key={c.pubkey} value={c.pubkey}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>KeyPackage event</Label>
              <Select
                value={selectedKeyPackageEventId}
                onValueChange={setSelectedKeyPackageEventId}
                disabled={!inviteContactPubkey}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select KeyPackage event" />
                </SelectTrigger>
                <SelectContent>
                  {(contactKeyPackages ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.id.slice(0, 16)}... (
                      {new Date(e.created_at * 1000).toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {inviteError && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>{inviteError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button onClick={handleInvite} disabled={!isAdmin || isInviting}>
              {isInviting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Inviting...
                </>
              ) : (
                "Send invite"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main chat container */}
      <div className="flex flex-col h-[calc(100vh-65px)]">
        {/* Error Display */}
        {sendError && (
          <div className="p-4">
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>Error: {sendError}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Messages - flex-col-reverse for scroll-to-bottom behavior */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col-reverse h-full">
            <MessageList
              messages={messages}
              currentUserPubkey={account?.pubkey ?? null}
            />
            {loadMoreMessages && !loadingDone && (
              <div className="flex justify-center py-2">
                <Button onClick={loadMoreMessages} disabled={loadingMore}>
                  {loadingMore ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Load older messages"
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Message Input - sticky at bottom; state lives in MessageForm to avoid full-page re-renders on typing */}
        <div className="border-t p-4 bg-background">
          <MessageForm isSending={isSending} onSend={handleSendMessage} />
        </div>
      </div>
    </>
  );
}

export default withActiveAccount(GroupDetailPage);
