import { use$ } from "applesauce-react/hooks";
import { Search, UserPlus } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { useOutletContext } from "react-router";

import { InviteMemberDialog } from "@/components/group/invite-member-dialog";
import { UserMemberCard } from "@/components/group/user-member-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accounts } from "@/lib/accounts";

import type { MarmotGroup } from "marmot-ts";
import { eventStore } from "../../../lib/nostr";
import { getDisplayName } from "applesauce-core/helpers";

interface GroupOutletContext {
  group: MarmotGroup<any>;
  groupDetails: {
    name: string;
    epoch: number;
    members: string[];
    admins: string[];
  } | null;
  isAdmin: boolean;
}

export default function GroupMembersPage() {
  const { group, groupDetails, isAdmin } =
    useOutletContext<GroupOutletContext>();
  const account = use$(accounts.active$);
  const [searchQuery, setSearchQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  // Defer search query for performance
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Combine all members (admins + regular members)
  const allMembers = useMemo(() => {
    if (!groupDetails) return [];
    const seen = new Set<string>();

    return [
      ...groupDetails.admins.map((pubkey) => ({ pubkey, isAdmin: true })),
      ...groupDetails.members.map((pubkey) => ({ pubkey, isAdmin: false })),
    ].filter((member) => !seen.has(member.pubkey) && seen.add(member.pubkey));
  }, [groupDetails]);

  // Filter members based on search query (simple pubkey-based for now)
  const filteredMembers = useMemo(() => {
    if (!deferredSearchQuery.trim()) return allMembers;

    const query = deferredSearchQuery.toLowerCase();

    return allMembers.filter((member) => {
      const metadata = eventStore.getReplaceable(0, member.pubkey);
      const name = metadata && getDisplayName(metadata);

      return (
        member.pubkey.toLowerCase().includes(query) ||
        name?.toLowerCase().includes(query)
      );
    });
  }, [allMembers, deferredSearchQuery]);

  if (!groupDetails) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-118px)] p-4">
        <p className="text-muted-foreground">Loading group details...</p>
      </div>
    );
  }

  return (
    <>
      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        group={group}
        isAdmin={isAdmin}
      />

      <div className="flex flex-col h-[calc(100vh-118px)] p-4">
        {/* Header with search and invite button */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search members by name or npub..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            onClick={() => setInviteOpen(true)}
            disabled={!isAdmin}
            className="shrink-0"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Invite member
          </Button>
        </div>

        {/* Member count */}
        <div className="text-sm text-muted-foreground mb-4">
          {filteredMembers.length === allMembers.length ? (
            <>
              {allMembers.length}{" "}
              {allMembers.length === 1 ? "member" : "members"}
            </>
          ) : (
            <>
              Showing {filteredMembers.length} of {allMembers.length} members
            </>
          )}
        </div>

        {/* Members grid */}
        <div className="flex-1 overflow-y-auto">
          {filteredMembers.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-2">
                <p className="text-muted-foreground">
                  {searchQuery.trim()
                    ? "No members found matching your search"
                    : "No members in this group"}
                </p>
                {searchQuery.trim() && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchQuery("")}
                  >
                    Clear search
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
              {filteredMembers.map((member) => (
                <UserMemberCard
                  key={member.pubkey}
                  pubkey={member.pubkey}
                  isAdmin={member.isAdmin}
                  canRemove={isAdmin && member.pubkey !== account?.pubkey}
                  group={group}
                />
              ))}
            </div>
          )}
        </div>

        {/* Admin notice if not admin */}
        {!isAdmin && (
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              Only group admins can invite or remove members
            </p>
          </div>
        )}
      </div>
    </>
  );
}
