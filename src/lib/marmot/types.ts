import type {
  GroupMediaStore,
  GroupRumorHistory,
  MarmotClient,
  MarmotGroup,
} from "@internet-privacy/marmot-ts";

/** A web group always has persistent rumor history and decrypted-media storage. */
export type AppGroup = MarmotGroup<GroupRumorHistory, GroupMediaStore>;
/** The web client with its concrete per-group backends. */
export type AppMarmotClient = MarmotClient<GroupRumorHistory, GroupMediaStore>;
