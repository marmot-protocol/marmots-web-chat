import { IconLoader2, IconUserOff } from "@tabler/icons-react";
import { use$ } from "applesauce-react/hooks";

import { PageBody } from "@/components/page-body";
import { PageHeader } from "@/components/page-header";
import { withActiveAccount } from "@/components/with-active-account";
import { useIsMobile } from "@/hooks/use-mobile";
import { user$ } from "@/lib/accounts";
import { liveGroups$ } from "@/lib/marmot-client";
import { useOnlineContactsKeyPackages } from "@/pages/contacts/components/online-contacts";
import {
  RecentKeyPackageCard,
  RecentKeyPackagesFeed,
} from "@/pages/contacts/components/recent-key-packages";

/** Shared explore content: Who's Online + recent key packages feed. */
function ExploreContent() {
  const contacts = use$(user$.contacts$);
  const groups = use$(liveGroups$);
  const onlineContacts = useOnlineContactsKeyPackages();
  const isLoading = contacts === undefined || groups === undefined;

  return (
    <>
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Who's Online</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Contacts with a key package published in the last 24 hours — click
            to view their profile
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <IconLoader2 className="h-4 w-4 animate-spin" />
            Loading contacts…
          </div>
        )}

        {!isLoading && contacts?.length === 0 && (
          <div className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <IconUserOff className="h-5 w-5 shrink-0" />
            <span>
              Follow people on Nostr and they'll appear here when they're ready
              to chat.
            </span>
          </div>
        )}

        {onlineContacts && onlineContacts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {onlineContacts.map((kp) => (
              <RecentKeyPackageCard key={kp.pubkey} event={kp} />
            ))}
          </div>
        )}
      </div>

      <RecentKeyPackagesFeed />
    </>
  );
}

/** Desktop explore view: header, Who's Online + recent key packages. Exported for contacts layout. */
export function ContactsExploreDesktop() {
  return (
    <>
      <PageHeader items={[{ label: "Home", to: "/" }, { label: "Contacts" }]} />
      <PageBody>
        <ExploreContent />
      </PageBody>
    </>
  );
}

function ContactsExploreMobile() {
  return (
    <div className="w-full space-y-6 p-4">
      <ExploreContent />
    </div>
  );
}

function ContactsExplorePage() {
  const isMobile = useIsMobile();
  return isMobile ? <ContactsExploreMobile /> : <ContactsExploreDesktop />;
}

export default withActiveAccount(ContactsExplorePage);
