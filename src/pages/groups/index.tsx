import { use$ } from "applesauce-react/hooks";
import { MessageSquare, Users } from "lucide-react";
import {
  getGroupMembers,
  type MarmotGroup,
  type GroupRumorHistory,
} from "marmot-ts";
import { Link } from "react-router";

import { PageBody } from "@/components/page-body";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getGroupSubscriptionManager } from "@/lib/runtime";
import { liveGroups$ } from "@/lib/marmot-client";

interface GroupCardProps {
  group: MarmotGroup<GroupRumorHistory>;
  hasUnread: boolean;
}

function GroupCard({ group, hasUnread }: GroupCardProps) {
  const marmotData = group.groupData;
  const name = marmotData?.name || "Unnamed Group";
  const description = marmotData?.description || "";
  const members = getGroupMembers(group.state);
  const memberCount = members.length;

  return (
    <Link to={`/groups/${group.idStr}`} className="block">
      <Card className="hover:bg-accent/50 transition-colors relative">
        {hasUnread && (
          <div
            className="absolute top-3 right-3 h-3 w-3 rounded-full bg-destructive"
            aria-label="Unread messages"
            title="Unread messages"
          />
        )}
        <CardHeader>
          <CardTitle className="flex items-center gap-2">{name}</CardTitle>
          {description && (
            <CardDescription className="line-clamp-2">
              {description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>
                {memberCount} {memberCount === 1 ? "member" : "members"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4" />
              <span className="font-mono text-xs truncate max-w-[120px]">
                {group.idStr.slice(0, 12)}...
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function GroupsIndexPage() {
  const groups = use$(liveGroups$);
  const groupMgr = getGroupSubscriptionManager();
  const unreadGroups = use$(groupMgr?.unreadGroupIds$ ?? undefined);

  return (
    <>
      <PageHeader
        items={[
          { label: "Home", to: "/" },
          { label: "Groups", to: "/groups" },
        ]}
      />
      <PageBody>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Groups</h1>
              <p className="text-muted-foreground mt-2">
                Manage and chat in your MLS groups
              </p>
            </div>
            <Button asChild>
              <Link to="/groups/create">Create Group</Link>
            </Button>
          </div>

          {groups && groups.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {groups.map((group) => {
                const hasUnread = Array.isArray(unreadGroups)
                  ? unreadGroups.includes(group.idStr)
                  : false;

                return (
                  <GroupCard
                    key={group.idStr}
                    group={group}
                    hasUnread={hasUnread}
                  />
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {groups === undefined ? "Loading..." : "No groups yet"}
                </h3>
                {groups !== undefined && (
                  <>
                    <p className="text-sm text-muted-foreground mb-4 max-w-md">
                      Create your first group to start secure, private
                      conversations with end-to-end encryption.
                    </p>
                    <Button asChild>
                      <Link to="/groups/create">Create Your First Group</Link>
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </PageBody>
    </>
  );
}
