import { useOutletContext } from "react-router";
import type { Dispatch, SetStateAction } from "react";
import type { ChatSnapshot, MarmotController } from "@/lib/marmot/controller";

type DraftSetter = Dispatch<SetStateAction<string>>;

/** Shared settings state retained while navigating between tabs. */
export interface SettingsContextValue {
  snapshot: ChatSnapshot;
  controller: MarmotController | null;
  name: string;
  setName: DraftSetter;
  about: string;
  setAbout: DraftSetter;
  picture: string;
  setPicture: DraftSetter;
  outbox: string;
  setOutbox: DraftSetter;
  inbox: string;
  setInbox: DraftSetter;
}

/**
 * Read the shared settings snapshot and editable drafts.
 * @returns State provided by the settings layout.
 * @example
 * const { name, setName } = useSettings();
 */
export function useSettings(): SettingsContextValue {
  return useOutletContext<SettingsContextValue>();
}
