import { BehaviorSubject } from "rxjs";
import type { NostrEvent } from "applesauce-core/helpers/event";
import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import type { MarmotController } from "./controller";

type MessageSender = Pick<
  MarmotController,
  "sendText" | "sendMedia" | "sendPreparedMessage"
>;

/** Local delivery information for one outgoing message, scoped to its controller. */
export interface OutgoingMessage {
  key: string;
  groupId: string;
  message: NostrEvent;
  submittedAt: number;
  status: "sending" | "sent" | "failed";
  error?: string;
  fileName?: string;
  retry: () => void;
}

/** Tracks independent sends without placing optimistic messages in an EventStore. */
export class MessageOutbox {
  readonly messages$ = new BehaviorSubject<OutgoingMessage[]>([]);

  private readonly sender: MessageSender;

  constructor(sender: MessageSender) {
    this.sender = sender;
  }

  /** Enqueue one text or media message immediately; failures remain available to retry. */
  send(
    groupId: string,
    pubkey: string,
    content: string,
    replyTo?: { id: string; pubkey: string },
    file?: File,
  ): void {
    const key = crypto.randomUUID();
    const submittedAt = Date.now() / 1000;
    let rumor: Rumor | undefined;
    const update = (patch: Partial<OutgoingMessage>) => {
      this.messages$.next(
        this.messages$.value.map((entry) =>
          entry.key === key ? { ...entry, ...patch } : entry,
        ),
      );
    };
    const prepared = (value: Rumor) => {
      rumor = value;
      file = undefined;
      update({ message: value as NostrEvent, fileName: undefined });
    };
    const run = async () => {
      update({ status: "sending", error: undefined });
      try {
        if (rumor) {
          await this.sender.sendPreparedMessage(groupId, rumor);
        } else if (file) {
          await this.sender.sendMedia(
            groupId,
            file,
            content || undefined,
            replyTo,
            prepared,
          );
        } else {
          await this.sender.sendText(groupId, content, replyTo, prepared);
        }
        update({ status: "sent" });
      } catch (error) {
        update({
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };
    const retry = () => {
      if (
        this.messages$.value.find((entry) => entry.key === key)?.status !==
        "failed"
      )
        return;
      void run();
    };
    this.messages$.next([
      ...this.messages$.value,
      {
        key,
        groupId,
        submittedAt,
        status: "sending",
        retry,
        fileName: file?.name,
        message: {
          id: key,
          pubkey,
          content,
          created_at: Math.floor(submittedAt),
          kind: 9,
          tags: replyTo ? [["q", replyTo.id, "", replyTo.pubkey]] : [],
          sig: "",
        },
      },
    ]);
    void run();
  }
}

const OUTBOXES = new WeakMap<MessageSender, MessageOutbox>();

/** Get the controller's outbox, preserving pending sends across route navigation. */
export function getMessageOutbox(sender: MessageSender): MessageOutbox {
  let outbox = OUTBOXES.get(sender);
  if (!outbox) {
    outbox = new MessageOutbox(sender);
    OUTBOXES.set(sender, outbox);
  }
  return outbox;
}
