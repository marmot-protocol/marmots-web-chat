import { useOutletContext } from "react-router";
import type { Dispatch, SetStateAction } from "react";
import type { MarmotAccount } from "@/lib/marmot/account";

type DraftSetter = Dispatch<SetStateAction<string>>;

/** The active account and editable drafts retained while navigating between tabs. */
export interface SettingsContextValue {
  account: MarmotAccount;
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
 * Read the active account and shared editable drafts.
 * @returns State provided by the settings layout.
 * @example
 * const { name, setName } = useSettings();
 */
export function useSettings(): SettingsContextValue {
  return useOutletContext<SettingsContextValue>();
}
