import { useCallback, useState } from "react";

import { MessageList } from "./message-list";
import { MessageComposer } from "./message-composer";
import type { ReplyTarget } from "./types";

export function ChatView({ groupId }: { groupId: string }) {
  // Only the (rarely-changing) reply target lives here. The composer owns its
  // own text state, so typing never re-renders this component or the list.
  const [reply, setReply] = useState<ReplyTarget | null>(null);
  const clearReply = useCallback(() => setReply(null), []);

  return (
    <div className="flex h-full flex-col">
      <MessageList groupId={groupId} onReply={setReply} />
      <MessageComposer groupId={groupId} reply={reply} onClearReply={clearReply} />
    </div>
  );
}
