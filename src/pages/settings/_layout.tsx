import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { IconArrowLeft } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { use$ } from "applesauce-react/hooks";

import { useMarmotAccount } from "@/hooks/use-marmot";
import { useProfile } from "@/hooks/use-profile";
import type { SettingsContextValue } from "@/pages/settings/context";

const SETTINGS_TABS = [
  { value: "profile", label: "Profile" },
  { value: "relays", label: "Relays" },
  { value: "key-packages", label: "Key packages" },
  { value: "audit-log", label: "Audit log" },
  { value: "advanced", label: "Advanced" },
];

/** Provide routed settings tabs and preserve drafts across tab changes. */
export function SettingsLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const account = useMarmotAccount();
  const outboxRelays = use$(() => account?.outboxRelays$, [account]);
  const inboxRelays = use$(() => account?.inboxRelays$, [account]);
  const profile = useProfile(account?.pubkey);
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [picture, setPicture] = useState("");
  const [outbox, setOutbox] = useState("");
  const [inbox, setInbox] = useState("");
  const requestedTab = location.pathname
    .split("/")
    .filter(Boolean)[1]
    ?.toLowerCase();
  const activeTab =
    SETTINGS_TABS.find((tab) => tab.value === requestedTab)?.value ?? "profile";

  useEffect(() => {
    setName(profile?.name ?? "");
    setAbout(profile?.about ?? "");
    setPicture(profile?.picture ?? "");
  }, [profile, account]);

  useEffect(() => {
    setOutbox(outboxRelays?.join("\n") ?? "");
    setInbox(inboxRelays?.join("\n") ?? "");
  }, [outboxRelays, inboxRelays]);

  if (!account) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  const context: SettingsContextValue = {
    account,
    name,
    setName,
    about,
    setAbout,
    picture,
    setPicture,
    outbox,
    setOutbox,
    inbox,
    setInbox,
  };

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b p-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/groups")}>
          <IconArrowLeft data-icon="inline-start" /> Back
        </Button>
        <h1 className="font-semibold">Settings</h1>
      </header>
      <Tabs
        value={activeTab}
        onValueChange={(value) => navigate(`/settings/${value}`)}
        className="min-h-0 flex-1 gap-0 overflow-hidden"
      >
        <div className="shrink-0 overflow-x-auto border-b px-4 py-2">
          <TabsList variant="line" aria-label="Settings sections">
            {SETTINGS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {SETTINGS_TABS.map((tab) => (
          <TabsContent
            key={tab.value}
            value={tab.value}
            className="min-h-0 overflow-y-auto"
          >
            {activeTab === tab.value && (
              <div className="w-full min-w-0 max-w-2xl p-4 sm:p-6">
                <Outlet context={context} />
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
