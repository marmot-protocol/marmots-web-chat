import { MessagesSquare } from "lucide-react";

export function GroupsIndexPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <MessagesSquare className="size-10" />
      <p className="text-sm">Select a group or create a new one to start chatting.</p>
    </div>
  );
}
